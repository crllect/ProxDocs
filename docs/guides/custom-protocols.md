# Custom protocols

Browsers give their own pages a private scheme: `chrome://settings`,
`about:config`, `edge://flags`. You can do the same, `myproxy://settings`, and
it is worth doing for a concrete reason, not just aesthetics.

---

## What you cannot do

Be clear about this first, because it saves you an afternoon.

**You cannot register a real URL scheme.** `navigator.registerProtocolHandler`
only accepts a short allowlist (`mailto`, `web+*`, a few others), requires user
consent, and routes to an HTTPS URL anyway. Service workers cannot intercept a
scheme the browser does not already route over HTTP.

So `myproxy://settings` is **not a URL** as far as the network stack is
concerned. Typing it into the real browser address bar does nothing.

## What you are building

A **routing convention**, resolved entirely inside your app:

1. Your URL parser recognises the scheme and returns `{ kind: "internal" }`.
2. A registry maps the host part to a renderer.
3. The renderer's HTML goes into the tab's iframe via `srcdoc`.

Three steps, all in your own code, no browser cooperation needed.

### Why bother

**It gives internal pages an address that can never collide with a proxied
site.** Without a scheme, you end up with `/settings` as a real route, and now
you have to make sure a proxied page can never be at `/settings`, that your
service worker does not intercept it, and that navigating to it does not leave
the proxy shell.

With a scheme, the URL parser routes it **before the proxy engine is ever
involved**, so it cannot collide with a proxied HTTP route.

It also gives you shareable, typeable addresses for internal pages, and it makes
the address bar honest. The user sees `myproxy://history`, not a blank bar or a
lie.

This feature is optional. If settings, history, or bookmarks should behave like
an overlay or sidebar instead of a destination, leave custom protocols off. The
builder opens those pages in a separate popup iframe, so the active tab and its
Back/Forward history do not change. See
[Settings: Popup or custom protocol](settings.md#popup-or-custom-protocol).

---

## Implementation

### 1. Recognise the scheme

In your URL parser, before anything else:

```js
export const internalScheme = "myproxy:";

export const parseScheme = input => {
	if (!/^[a-z][a-z0-9+.-]*:/i.test(input)) return null;
	const parsed = new URL(input);
	if (parsed.protocol === internalScheme) {
		return { url: parsed.href, kind: "internal" };
	}
	return { url: parsed.href, kind: "external" };
};
```

`new URL("myproxy://settings")` works. The URL parser accepts any syntactically
valid scheme. Note that for a **non-special** scheme, whether the name lands in
`.hostname` or `.pathname` depends on whether you wrote `//`:

```js
new URL("myproxy://settings").hostname;
new URL("myproxy:settings").pathname;
```

The first expression returns `"settings"`; the second also returns `"settings"`,
but from `pathname`.

Accept both:

```js
const name = parsed.hostname || parsed.pathname.replace(/^\/+/, "");
```

### 2. A registry

```js
const pages = new Map();

export const definePage = (name, { title, render }) => {
	pages.set(name, { title, render });
};

export const render = rawUrl => {
	const parsed = new URL(rawUrl);
	const name = parsed.hostname || parsed.pathname.replace(/^\/+/, "");
	const page = pages.get(name);
	if (!page) return errorDocument(name);
	return documentPage(page.title, page.render(parsed.searchParams));
};
```

Passing `searchParams` through means `myproxy://history?q=wikipedia` works
without any extra plumbing.

### 3. Render into the tab

```js
const openInternal = url => {
	const html = internal.render(url);
	if (html === null) return;

	const tab = tabs.active ?? tabs.open();
	tab.internalHistory.push(url);
	tab.url = url;
	tab.element.removeAttribute("src");
	tab.element.srcdoc = html;
	tabs.emit();
};
```

Internal pages occupy a tab like any other page, so tab switching and the tab
strip work normally. They do need a per-tab internal history stack because
successive `srcdoc` assignments do not give the custom URLs useful native
history entries. Clear that stack in `tab.go()` before handing an HTTP URL to
the proxy engine. See
[URL parsing and history](url-parsing-and-history.md#internal-srcdoc-pages-are-the-exception).

### Keep data-backed pages live

When custom protocols are enabled, History and Bookmarks are open `srcdoc` tabs
rather than popups. Subscribe to their data modules and re-render every matching
internal tab when data changes, including hidden background tabs, so switching
back never requires a reload:

```js
const refreshInternalPages = names => {
	for (const tab of tabs.tabs) {
		if (!names.includes(internal.pageName(tab.url))) continue;
		const html = internal.render(tab.url);
		if (html !== null) tab.element.srcdoc = html;
	}
};

visitLog.onChange(() => refreshInternalPages(["history"]));
bookmarks.onChange(() => refreshInternalPages(["bookmarks"]));
```

Do this only for protocol-backed internal pages. Popup-menu builds already have
their own refresh path and should not replace the active proxy tab.

---

## Why `srcdoc` and not a real route

This is the security-relevant decision.

A `srcdoc` assignment navigates the iframe to an `about:srcdoc` document, but it
does not make a network request and the service worker does not receive one.
This means:

**A proxied site cannot fetch your settings page.** If internal pages lived at
`/internal/settings`, a proxied page, running on your origin, remember, could
`fetch("/internal/settings")` and read whatever is rendered there. With `srcdoc`
there is nothing to fetch.

The document still inherits your origin, so it can use your stylesheet and talk
to the shell. It just has no address.

---

## Talking to the shell

A `srcdoc` document does not share the parent document's existing module scope.
It could import modules by URL, but the generated page keeps the boundary small
and uses `postMessage`:

```js
document.addEventListener("click", event => {
	const link = event.target.closest("[data-open]");
	if (!link) return;
	event.preventDefault();
	parent.postMessage(
		{ type: "internal:open", url: link.dataset.open },
		parent.location.origin
	);
});
```

```js
addEventListener("message", event => {
	if (event.origin !== location.origin) return;
	if (!internal.isInternal(currentUrl())) return;
	if (event.source !== tabs.active?.element.contentWindow) return;
	const data = event.data;
	if (!data || typeof data !== "object") return;

	if (data.type === "internal:open" && typeof data.url === "string") {
		navigate(data.url);
	}
});
```

`about:srcdoc` reports `location.origin` as `"null"`, so the child uses
`parent.location.origin` as the target. In the shell, verify the active URL is
internal as well as checking `event.source`, `event.origin`, and the message
shape. Proxied content is same-origin and uses the same iframe window after a
navigation, so neither check identifies an internal page by itself.

---

## Choosing a scheme name

-   Letters first, then letters, digits, `+`, `-`, `.`
-   Avoid real schemes: `http`, `https`, `ftp`, `file`, `data`, `blob`, `about`,
    `chrome`, `edge`, `view-source`
-   Keep it short, people type it

The generator derives one from your project name, so `my-proxy` produces
`myproxy://settings`. If the cleaned project name is a reserved scheme such as
`http`, `https`, `data`, or `javascript`, the generator appends `app`.

---

## Useful pages

`home` (a new-tab page), `settings`, `history`, `bookmarks`, and `about` cover
almost everything. Two suggestions:

Make an `about` page that reports real versions:

```js
definePage("about", {
	title: "About",
	render: () => `
    <main class="internal-shell">
      <h1>About</h1>
      <dl>
        <dt>Engine</dt><dd>${engine.label}</dd>
        <dt>Scramjet</dt><dd>${window.$scramjet?.versionInfo?.version ?? "unknown"}</dd>
        <dt>Transport</dt><dd>${engine.getTransport?.().kind ?? "n/a"}</dd>
      </dl>
    </main>`
});
```

That page will save you more support time than any documentation you write.

And always ship a fallback for unknown pages that lists the real ones:

```js
const errorDocument = name => {
	return documentPage(
		"Page not found",
		`
    <main class="internal-shell">
      <h1>No such page</h1>
      <p><code>myproxy://${escapeHtml(name)}</code> does not exist.</p>
      <ul>${listPages()
			.map(p => `<li><a href="#" data-open="${p.url}">${p.url}</a></li>`)
			.join("")}</ul>
    </main>`
	);
};
```

---

## Escaping

Everything you interpolate into these templates must be escaped. Internal pages
render history entries, bookmark titles, and settings values, all of which come
from proxied sites, and any of which can contain `<script>`:

```js
export const escapeHtml = value => {
	return String(value).replace(
		/[&<>"']/g,
		c =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;"
			})[c]
	);
};
```

A page title is attacker-controlled input. Treat it that way.
