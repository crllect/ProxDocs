# URL parsing and history

Two separate topics that both live in the address bar. Getting either wrong is
very visible to users.

---

## Part 1: parsing what someone typed

This check appears in many proxy frontends:

```js
if (!input.includes(".")) {
	url = searchUrl + encodeURIComponent(input);
} else if (!input.startsWith("http://") && !input.startsWith("https://")) {
	url = "https://" + input;
}
```

The dot check came from the first Proxy Tutorial I wrote. I was too lazy to come
up with a regex, people copied it, and it stuck.

Three lines, and it fails on all of these:

| Input                     | The three-line version                     | The parser below                          |
| ------------------------- | ------------------------------------------ | ----------------------------------------- |
| `what is 3.5mm cable`     | Navigates to `https://what is 3.5mm cable` | Searches                                  |
| `1.5`                     | Navigates to `https://1.5`                 | Searches                                  |
| `localhost:3000`          | Searches, because there is no dot          | Refuses, shows a message                  |
| `127.0.0.1:8080`          | Navigates, the dots are IP octets          | Refuses, shows a message                  |
| `münchen.de`              | Navigates, the browser punycodes it        | Navigates to `https://xn--mnchen-3ya.de/` |
| `httpfoo.com`             | Navigates, the dot test happens to pass    | Navigates to `https://httpfoo.com/`       |
| `https://x.com`           | Navigates                                  | Navigates                                 |
| `mailto:user@crllect.dev` | Navigates to `https://mailto:user@…`       | Hands off to the browser                  |
| `ftp://ftp.gnu.org/`      | Navigates to `https://ftp://ftp.gnu.org/`  | Hands off to the browser                  |
| `javascript:alert(1)`     | Navigates to `https://javascript:alert(1)` | Refuses, shows a message                  |
| `data:text/html,x`        | Navigates to `https://data:text/html,x`    | Refuses, shows a message                  |

The last four rows are the ones people miss. A scheme the proxy can't carry is
not an error and not a search: `mailto:` and `tel:` get handed to the browser
with `location.assign()`, which opens the user's mail or dial handler the way a
normal link would. `javascript:` and `data:` are refused outright, because both
execute on **your** origin.

That last point is the one with teeth. If your address bar can be populated from
a link or a query parameter, blindly navigating a `javascript:` URL is an XSS
vector on your own origin.

Loopback addresses are refused rather than proxied. A proxied request is made by
your **wisp server**, not by the browser, so `localhost` resolves to the
server's own machine and never to the user's. A correctly configured server
already refuses it at the transport layer (see
[`allow_loopback_ips`](running-a-proxy.md)), and the user gets a bare TLS error
with nothing explaining why. Catching it in the parser turns that into a
sentence. This covers `localhost`, `*.localhost`, `127.0.0.1`, and `::1`, with
or without a scheme.

Which engine you send those searches to matters too, and not every engine
survives a proxy: see [Search engines](search-engines.md).

There is also a privacy failure hiding in the first row. When a URL is
misclassified as a search, **you send it to a search engine**. Users paste URLs
containing session tokens, password-reset links, and invite codes. Silently
forwarding those to Google is a real leak.

### A safer parser

Check hostname-shaped input before the generic scheme test, because
`localhost:3000` is syntactically a URL scheme. Accept a hostname, an IP
address, or an IPv6 literal; refuse loopback targets; then handle explicit
schemes and search everything else.

```js
const proxyableSchemes = new Set(["http:", "https:"]);
const blockedSchemes = new Set([
	"javascript:",
	"data:",
	"vbscript:",
	"file:",
	"blob:",
	"filesystem:"
]);
const looksLikeUrl =
	/^(?:(?:(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:.]+\]|[^\s/?#@]+\.[^\s/?#@.]{2,})(?::\d+)?(?:[/?#]\S*)?)$/iu;

const isLoopback = hostname => {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (host === "localhost" || host.endsWith(".localhost")) return true;
	if (host === "::1" || host === "::") return true;

	const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
	const octets = (mapped ? mapped[1] : host).split(".");
	if (octets.length !== 4) return false;
	if (!octets.every(part => /^\d{1,3}$/.test(part) && Number(part) < 256))
		return false;

	return Number(octets[0]) === 127 || octets.join(".") === "0.0.0.0";
};

export const resolveInput = (rawInput, searchTemplate) => {
	const input = String(rawInput ?? "").trim();
	if (!input) return { url: "", kind: "empty" };

	if (looksLikeUrl.test(input)) {
		try {
			const url = new URL("https://" + input);
			if (isLoopback(url.hostname)) return { url: "", kind: "blocked" };
			if (!url.username && !url.password)
				return { url: url.href, kind: "url" };
		} catch {}
	}

	if (isLoopback(input.split(/[:/?#]/)[0] ?? "")) {
		return { url: "", kind: "blocked" };
	}

	if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
		try {
			const parsed = new URL(input);
			if (
				parsed.username ||
				parsed.password ||
				blockedSchemes.has(parsed.protocol) ||
				(proxyableSchemes.has(parsed.protocol) &&
					isLoopback(parsed.hostname))
			) {
				return { url: "", kind: "blocked" };
			}
			return proxyableSchemes.has(parsed.protocol)
				? { url: parsed.href, kind: "url" }
				: { url: parsed.href, kind: "external" };
		} catch {
			return { url: "", kind: "blocked" };
		}
	}

	return {
		url: searchTemplate.replace("%s", encodeURIComponent(input)),
		kind: "search"
	};
};
```

The credential check runs for explicit and inferred URLs. It rejects text such
as `https://crllect.dev@attacker.crllect.dev/`, whose destination is
`attacker.crllect.dev` despite the name at the start.

### Displaying URLs back

Browsers hide the scheme and a leading `www.`. Copy that, people judge trust
from this string:

```js
export const formatForDisplay = url => {
	try {
		const parsed = new URL(url);
		const host = parsed.host.replace(/^www\./, "");
		const rest = parsed.pathname === "/" ? "" : parsed.pathname;
		return host + rest + parsed.search + parsed.hash;
	} catch {
		return url;
	}
};
```

One rule that matters more than it looks: **never overwrite the address bar
while the user is typing.**

```js
if (!addressBarFocused) {
	addressBar.value = tab?.url ? formatForDisplay(tab.url) : "";
}
```

Without that check, a background [frame](multiple-tabs.md) finishing a load
wipes what someone is halfway through typing. It is the most irritating bug a
proxy frontend can have, and it is one line to prevent.

---

## Part 2: history

"History" means two unrelated things, and conflating them is why so many proxy
frontends have a broken back button.

### Document history, the engine owns this

The iframe still has a browser-managed document history. Scramjet wraps it as
`frame.back()`, `frame.forward()`, and `frame.reload()`; Ultraviolet delegates
to the iframe's `contentWindow.history`.

That history is richer than a URL list. It includes form submissions, redirects,
`history.replaceState`, hash changes, and state associated with a same-document
navigation. Do not try to serialize or recreate it from URLs.

```js
const back = () => element.contentWindow?.history.back();
const forward = () => element.contentWindow?.history.forward();
const reload = () => element.contentWindow?.location.reload();
```

The proxy shell can't use that history alone. Its initial new-tab and settings
pages are `srcdoc` documents, not engine navigations. The browser has no useful
document-history entry that connects a proxied page back to that generated
new-tab page.

### Shell history, you do own this

The generated browser controls keep a small, per-tab list of top-level entries.
This includes the internal new-tab and settings pages as well as the final URLs
reported by the proxy engine. It exists for the shell, not to recreate every
browser-history detail.

```js
record(url) {
	if (this.history[this.historyIndex] === url) return;

	const existing = this.history.lastIndexOf(url, this.historyIndex - 1);
	if (existing >= 0) {
		this.historyIndex = existing;
		return;
	}

	this.history.splice(this.historyIndex + 1);
	this.history.push(url);
	this.historyIndex = this.history.length - 1;
}
```

This makes control state deterministic across browsers. Back is disabled on a
fresh new tab. After navigating to `https://crllect.dev/`, Back returns to the
new-tab page and Forward becomes available. A new navigation after Back drops
the forward branch.

The engine URL event feeds this top-level list, so links, redirects, and SPA URL
changes still update the shell address bar. Its purpose is only to select the
next shell view and compute whether controls should be enabled; it can't and
doesn't reproduce in-document form or state history.

When selecting a previous entry, render or proxy-navigate it without recording a
new entry. Otherwise Back itself creates a new history branch. Ignore late URL
events from a frame while it is displaying an internal `srcdoc` page; the old
page can finish asynchronously after the shell has already changed views.

#### Why not use `history.length`?

`history.length` includes entries outside the proxy frame and doesn't tell you
which direction is available. The Navigation API exposes `canGoBack` and
`canGoForward` in Chromium, but it isn't portable and still can't represent an
internal `srcdoc` new-tab page:

```js
const navigation = frameWindow.navigation;
if (navigation) {
	update(navigation.canGoBack, navigation.canGoForward);
	navigation.addEventListener("currententrychange", update);
	navigation.addEventListener("navigatesuccess", update);
}
```

The per-tab shell list is therefore the cross-browser source of control state.
The engine's document history remains the source of in-document state.

The persisted visit log remains separate. It records visits for a history page;
it isn't the current tab's Back/Forward stack.

### The visit log, you do own this

A persisted, searchable record of where the user went. Independent of any tab.

```js
const maxEntries = 1000;
const dedupeWindowMs = 30_000;

export const record = (url, title = "") => {
	if (!url) return;
	if (!/^https?:/i.test(url)) return;

	const now = Date.now();
	const last = entries[0];

	if (last && last.url === url && now - last.at < dedupeWindowMs) {
		last.at = now;
		if (title) last.title = title;
		persist();
		return;
	}

	entries.unshift({ url, title, at: now });
	if (entries.length > maxEntries) entries.length = maxEntries;
	persist();
};
```

The dedupe window collapses repeated callbacks and reloads of the same URL.
Redirects to different URLs remain separate entries.

Cap the length. `localStorage` gives you around 5 MB for the whole origin, and
an uncapped history will eventually take all of it and start throwing on every
write, including your settings.

### Where the record call goes

Hook it to the engine's URL event, not to your `navigate()` function.
`navigate()` only knows about addresses the user typed; it never sees links they
clicked, redirects, or SPA route changes.

```js
this.session = await engine.createSession(this.element, {
	url: url => {
		this.url = url;
		if (settings.get("saveHistory")) visitLog.record(url, this.title);
	}
});
```

With Scramjet that event comes from `UrlWatcherPlugin`, which fires on real
navigations, hash changes, and `history.pushState`. It taps `init.post` for each
top-level document, then `client.hooks.lifecycle.navigate` and a `hashchange`
listener inside it, so a hash change can notify you twice: upstream marks that
with a TODO in `utils/src/url-watcher.ts`. Make your handler idempotent, which
the `record()` above already is, rather than assuming one event per navigation.

Ultraviolet has no such event and leaves you polling `contentWindow.location`.
The builder no longer generates Ultraviolet projects, so if you are maintaining
one, that polling loop is yours to keep. See
[proxy engines](../concepts/engines.md#ultraviolet).

### Let people turn it off

A proxy is often used because someone doesn't want a local record. Ship a
`saveHistory` setting, honor it, and delete entries when the user clears them:

```js
export const clear = () => {
	entries = [];
	persist();
};
```

If you ever sync history to a server, that must be opt-in and it must be
obvious. See [Running a proxy site well](site-best-practices.md).

---

## On URL codecs

Ultraviolet encodes the destination into the path with a codec.
`Ultraviolet.codec.xor` by default. Scramjet's controller uses
`encodeURIComponent` by default and lets you supply your own.

Be clear about what this is for. **It is obfuscation, not encryption.** The key
is in the client bundle, so anyone can decode it. Its only real function is to
stop naive substring filters from matching `youtube.com` in a URL.

Writing a custom codec is easy and occasionally worthwhile:

```js
const encode = value => {
	const bytes = new TextEncoder().encode(value);
	const binary = String.fromCharCode(...bytes);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
};

const decode = value => {
	const base64 = value
		.replace(/-/g, "+")
		.replace(/_/g, "/")
		.padEnd(Math.ceil(value.length / 4) * 4, "=");
	const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
};

config.codec = { encode, decode };
```

Two constraints: the output must be path-safe, and **encode/decode must be
byte-for-byte inverses** for every input including unicode and already-encoded
sequences. A codec that round-trips imperfectly produces failures that look like
rewriter bugs and are very hard to trace.

Do not tell users a codec hides their browsing. It doesn't.
