# Troubleshooting

Ordered roughly by how often each one is the answer.

---

## Start here

Three checks in the browser console. They rule out most problems in ten seconds.

```js
crossOriginIsolated;
navigator.serviceWorker.controller?.scriptURL;
performance.getEntriesByType("resource").filter(r => r.name.includes("wasm"));
```

For Scramjet, the first value must be `true`, the second should name your
`sw.js`, and the third should include the
[rewriter](../concepts/how-proxies-work.md) WebAssembly file.

---

## The page loads but nothing happens when I navigate

**`crossOriginIsolated === false`**. _possibly, but check the service worker
first._ Scramjet runs without isolation; what isolation buys you is proxied
sites being able to use `SharedArrayBuffer` themselves. If nothing at all
happens on navigation, a service worker scope problem is more likely. Still,
these are the headers you want, and it costs one line to rule out:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Check the **document** response in the Network tab, not just assets. Then check
you are on `https://` or `http://localhost`, a LAN address like
`http://192.168.1.5:8080` is not a secure context and cannot isolate.

If the headers are set but isolation is still false, something between you and
the browser is stripping them: Cloudflare, an nginx `proxy_pass`, or a hosting
layer.

**No service worker [controller](../guides/wiring.md).** If
`navigator.serviceWorker.controller` is `undefined`, the worker has not claimed
the page. Reload once. If it stays undefined, look for registration errors and
confirm `sw.js` is served from the **root** of your origin. A worker at
`/js/sw.js` can never control `/~/sj/…`.

**A JavaScript error before the listener attached.** If your address bar does a
full page navigation instead of loading the iframe, your `submit` handler never
ran because the module threw. Check the console, and try importing it directly:

```js
import("/js/app.js").then(() => "ok").catch(e => e.message);
```

---

## `SharedArrayBuffer is not defined`

Cross-origin isolation. See above.

---

## Sites load but subresources 404 or are blocked

**Under `require-corp`, cross-origin assets must opt in** with
`Cross-Origin-Resource-Policy` or CORS. Google Fonts, CDN scripts, and external
favicons in _your own shell_ will be blocked.

Self-host them, or try `Cross-Origin-Embedder-Policy: credentialless`, which
still grants isolation but does not require opt-in. Chromium 96+ and Firefox
119+ support it. **Safari does not, at any version**, and WebKit has not
signalled that it intends to, so `credentialless` is not a fix you can ship to
everyone. Self-hosting is the portable answer.

This applies to **your shell's** assets. Assets of proxied pages go through the
service worker and are same-origin by the time the browser sees them.

---

## `environment detection error` on server start

You imported a browser-only transport in Node:

```js
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
```

That exact string comes from libcurl's Emscripten runtime, which is built for
`worker,web` only and throws when it finds neither. Epoxy 3.x is Rust and
wasm-bindgen, so it fails differently, but for the same reason and with the same
fix.

Neither libcurl 2.x nor epoxy 3.x exposes a Node entry point any more. Resolve
the path without executing the module:

```js
const require = createRequire(import.meta.url);
const dir = path.dirname(require.resolve("@mercuryworkshop/libcurl-transport"));
```

See [Breaking changes](breaking-changes.md).

---

## `BareMux is not defined`

`/baremux/index.js` did not load, or loaded after your script. It is a classic
script, not a module, so order in your HTML matters:

```html
<script src="/baremux/index.js"></script>
<script type="module" src="/js/app.js"></script>
```

Also confirm the server mounts it:

```js
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
app.use("/baremux/", express.static(baremuxPath));
```

---

## Requests hang with no error (bare-mux)

The transport probably failed to construct **inside the SharedWorker**, and
SharedWorker errors do not appear in the page console.

Open `chrome://inspect/#workers` (or Firefox's `about:debugging`) and inspect
the worker directly. It is the best bare-mux debugging trick there is, and
almost nobody knows it.

---

## The wisp connection fails or drops

**Check the path matches exactly.** A very common bug:

A proxied URL can contain `/wisp/` in its path, so do not use
`req.url.includes("/wisp/")`. Match the parsed pathname:

```js
if (new URL(req.url, `http://${req.headers.host}`).pathname === "/wisp/") {
	wisp.routeRequest(req, socket, head);
}
```

The base only exists to make `req.url` parseable; the scheme and host are
discarded when you read `.pathname`.

**Check the scheme.** An `https://` page cannot open a `ws://` socket. The
browser blocks it as mixed content.

```js
const scheme = location.protocol === "https:" ? "wss:" : "ws:";
```

**Check reverse-proxy timeouts.** nginx's default `proxy_read_timeout` is 60
seconds, which kills idle [wisp](../concepts/wisp-vs-bare.md) connections
mid-session:

```nginx
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

And confirm the upgrade headers are forwarded, see
[Deployment](../guides/deployment.md).

---

## A specific site is broken

In this order:

1. **Try the other transport.** libcurl and epoxy use different HTTP/TLS
   implementations, so a site may work with one and not the other. Shipping
   [transport switching](../concepts/transports.md) gives users that fallback.
2. **Try Scramjet if you are on Ultraviolet.** UV's JavaScript rewriter breaks
   on more sites, and it has not had a release since October 2024, so most of
   those breakages are not getting fixed for you. Check UV's `main` branch
   before giving up though, since a few fixes landed there after the last npm
   release. See
   [breaking changes](breaking-changes.md#ultraviolet-is-unmaintained).
3. **Check whether the site needs WebSockets.** If you are on a Bare deployment,
   they will not work at all.
4. **Check the console inside the frame.** Select the iframe's context in the
   devtools context dropdown. Rewriter failures usually show up as a syntax
   error in a rewritten script.
5. **Turn on `rewriterLogs`** and reload. See below.

### Getting the rewriter to tell you what it is doing

`rewriterLogs` is off by default and is the single most useful flag when you
suspect the rewriter rather than your own code. Scope it to the failing site so
you are not drowning in output from every request:

```js
scramjetConfig: {
	siteFlags: {
		"https://discord\\.com/.*": { rewriterLogs: true }
	}
}
```

Two kinds of output land in the **frame's** console:

**Parse errors.** Every error oxc produced while parsing a script is printed as
`oxc parse error`. Without the flag these are swallowed, because
`allowInvalidJs` passes the original script through instead, which is exactly
why a site can be quietly half-broken with a clean-looking console. Pair the
flag with `allowInvalidJs: false` to make those failures loud.

**Timing.** Each rewrite prints how long it took, bucketed:

```text
[time] oxc rewrite for "https://discord.com/assets/app.js" was decent speed (23.45ms)
```

The buckets are `BLAZINGLY FAST` under 1 ms, `decent speed` under 500 ms, and
`really slow` above that. HTML rewriting and rewriter-pool allocation report the
same way. Consistent `really slow` on one site is the signal to reach for
`disableComputedWrap` through `siteFlags`. See
[the flags that matter](scramjet-config.md#the-ones-you-will-actually-change).

Some sites will not work. Heavy anti-bot protection, aggressive integrity
checking, and DRM video are the usual categories, and no amount of configuration
changes that.

[Site compatibility](site-compatibility.md) works through the categories in
order, so you can tell which one you are hitting before spending time on it.

### Brave Search becomes `/undefined`

Some Brave Search pages call `history.pushState` or `history.replaceState`
without the optional URL argument. That is valid browser behavior: omitting the
argument keeps the current URL. Scramjet 2.0.67 rewrites that missing argument
as the string `"undefined"`, producing a proxied request to
`https://search.brave.com/undefined`.

The generated Scramjet adapter installs a frame-local compatibility plugin. It
supplies the frame's current URL only when either History method omits the URL.
It leaves real URLs, the URL watcher, and HTTP caching unchanged:

```js
for (const method of ["pushState", "replaceState"]) {
	const original = history[method];
	history[method] = function (data, unused, url) {
		return original.call(this, data, unused, url ?? client.url.href);
	};
}
```

Do not filter `UrlWatcherPlugin` values or override `frame.back()` to work
around this. Both affect normal navigation for every site. Upgrade or regenerate
if a generated project lacks the compatibility plugin.

---

## Everything works locally, breaks in production

Almost always one of:

| Cause                           | Check                                           |
| ------------------------------- | ----------------------------------------------- |
| No HTTPS                        | Service workers need a secure context           |
| Headers stripped by a proxy/CDN | `crossOriginIsolated` in the production console |
| Websockets not forwarded        | Test a site that needs them                     |
| Reverse-proxy timeout too low   | Connection drops after ~60s                     |
| Stale `sw.js` cached            | Serve it with `Cache-Control: no-cache`         |
| Host blocks outbound sockets    | Wisp cannot connect anywhere                    |

---

## Changes to sw.js do not take effect

Service workers update on their own schedule. Force it:

```js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event =>
	event.waitUntil(self.clients.claim())
);
```

And never cache it:

```js
res.setHeader("Cache-Control", "no-cache");
```

While developing, tick **Update on reload** in the Application → Service Workers
panel.

---

## Tabs reload every time I switch

You are unmounting the iframe. Toggle `display` instead of removing the element
from the DOM. Removing it destroys the document. See
[Multiple tabs](../guides/multiple-tabs.md).

---

## The address bar keeps clearing while I type

You are rewriting `input.value` on every render. Guard it:

```js
if (!addressBarFocused) {
	addressBar.value = tab?.url ? formatForDisplay(tab.url) : "";
}
```

---

## Transport switching does nothing

**On bootstrap wiring it cannot work.** `proxy-bootstrap` fixes the transport at
server start and only serves that one client. Regenerate with manual wiring.

**Otherwise:** `setTransport` affects the _next_ request. Pages already loaded
keep their connections until reloaded.

---

## Searching for a URL I pasted

Your input parser misclassified it. The three-line version everyone copies
misclassifies a lot. See
[URL parsing and history](../guides/url-parsing-and-history.md), this one has a
privacy cost, because misclassified URLs get sent to a search engine.

---

## Still stuck

Collect these before asking anywhere:

- `crossOriginIsolated`
- `navigator.serviceWorker.controller?.scriptURL`
- Engine and exact versions from `package.json`
- Which transport
- Whether it works on `localhost`
- The first error in the console, and the first in the **frame's** console
- The Network tab entry for the failing request

"It doesn't work" is unanswerable. That list usually contains the answer.
