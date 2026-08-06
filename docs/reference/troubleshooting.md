# Troubleshooting

Ordered roughly by how often each one is the answer.

If the symptom turns out to be an upstream bug rather than your setup, it is on
[known bugs](known-bugs.md) with the code behind it.

---

## Start here

Three checks in the browser console. They rule out most problems in ten seconds.

```js
crossOriginIsolated;
navigator.serviceWorker.controller?.scriptURL;
performance.getEntriesByType("resource").filter(r => r.name.includes("wasm"));
```

The second should name your `sw.js` and the third should include the
[rewriter](../concepts/how-proxies-work.md) WebAssembly file. Those two are
pass/fail.

The first you want `true`, but a `false` there does not stop Scramjet running.
What it costs you is proxied sites that need `SharedArrayBuffer`, which is a
smaller set than people assume and a miserable one to debug. See
[cross-origin isolation](../concepts/cross-origin-isolation.md).

---

## The page loads but nothing happens when I navigate

If it worked a minute ago and the frame now shows `Cannot GET /~/sj/...`, skip
to
[the idle service worker bug](#cannot-get-sj-after-the-tab-has-been-sitting-idle).

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
`http://192.168.1.5:8080` isn't a secure context and can't isolate.

If the headers are set but isolation is still false, something between you and
the browser is stripping them: Cloudflare, an nginx `proxy_pass`, or a hosting
layer.

**No service worker [controller](../guides/wiring.md).** If
`navigator.serviceWorker.controller` is `undefined`, the worker hasn't claimed
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

## `Cannot GET /~/sj/...` after the tab has been sitting idle

An upstream bug that affects every transport. On Wisp it is a papercut; on Bare
it is worse. Either way it is worth recognizing, because the error text points
at your server rather than at the cause.

The symptom: your proxy works, you leave the tab alone for a minute or two, then
navigate again, or press Back, and the frame shows your server's 404 page.

```text
Cannot GET /~/sj/<controller>/<frame>/https%3A%2F%2F...
```

That text is your own web server answering. It means the **service worker did
not intercept the request at all**, so it fell through to the network and hit
Express or Fastify, which has no such route.

### Why

Browsers terminate idle service workers, usually after about thirty seconds of
no events. Scramjet's worker keeps its list of routable frame prefixes in module
scope, so when the browser restarts it that list is empty and `shouldRoute()`
returns `false` for every proxied URL.

Upstream anticipates this. On activation the worker posts a
`$controller$swrevive` message to every client, and the controller is supposed
to re-register its prefix in response. In `scramjet-controller` 0.0.14 that
handshake doesn't fire in time for the navigation that woke the worker, so the
first one after an idle period is lost.

### Reproducing it

1. Load your proxy and navigate to any site. It works.
2. Leave it alone for about 75 seconds.
3. Navigate again.

Confirmed on both libcurl over Wisp and `bare-transport`, so **it isn't
transport-specific**. A busy page can mask it, because any request through the
worker resets the idle timer; a page that goes quiet will hit it.

### How bad it is, and how to recover

Measured on a generated project, twice each:

| After the worker has died   | Result       |
| --------------------------- | ------------ |
| Navigate somewhere new      | still 404    |
| **Reload the frame**        | **recovers** |
| Reload the whole shell page | recovers     |

**Reloading the frame is the fix**, and on Wisp that makes this a papercut
rather than a real problem: the reload button in your own browser controls
clears it, and normal use rarely goes quiet long enough to trigger it in the
first place. The usual way to see it at all is pressing Back after a pause.

On the Bare transport it is worse. There, a full page reload is needed, so a
user who hits it can't recover from your in-page controls.

**Generated projects already handle this.** The engine adapter pings the worker
every 15 seconds, which keeps it from going idle in the first place:

```js
const keepAliveIntervalMs = 15000;

const startKeepAlive = () => {
	setInterval(() => {
		navigator.serviceWorker.controller?.postMessage("keepalive");
	}, keepAliveIntervalMs);
};
```

The payload is a plain string on purpose. Both of the worker's `message`
listeners bail on `typeof e.data != "object"` before doing anything, so the ping
wakes the worker and touches no logic.

Measured against a build with no keepalive, a **40-second** idle already breaks,
so anything at or above 30 seconds is too slow to help. With the 15-second ping,
the same project survives a 90-second idle and navigates normally.

If you are writing your own client rather than generating one, copy this. Do not
set it to something plausible-sounding like 70 seconds, which fires long after
the worker is already gone and protects nothing.

The alternative, reloading the frame when a proxied navigation lands on your own
404, is deliberately **not** what generated projects do. It works, but it hides
every other cause of a 404 behind an automatic reload, which turns a clear
failure into a mystery reload loop. Keep your 404 visible and keep the worker
alive instead.

---

## `SharedArrayBuffer is not defined`

Cross-origin isolation. See above.

---

## Sites load but subresources 404 or are blocked

**Under `require-corp`, cross-origin assets in _your own shell_ must opt in**
with `Cross-Origin-Resource-Policy`, or be fetched with CORS.

Your fonts and CDN scripts are almost certainly fine. Google Fonts, cdnjs,
jsDelivr and unpkg all send CORP. The things that break are other people's
images, favicons especially, and favicon services that redirect, because the
redirect response needs CORP as well as the file it points at.

If the host sends `Access-Control-Allow-Origin` but no CORP, add `crossorigin`
to the tag and it loads. If it sends neither, proxy it or self-host it. The full
table of what does and doesn't work is in
[cross-origin isolation](../concepts/cross-origin-isolation.md#cross-origin-embedder-policy-require-corp).

`Cross-Origin-Embedder-Policy: credentialless` is the other way out. It still
grants isolation and sends no-cors requests without credentials rather than
demanding opt-in. Chromium 96+ and Firefox 119+ support it, **Safari does not at
any version**, so it isn't something you ship to everyone.

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

## `scramjet version mismatch` when constructing the controller

```text
@mercuryworkshop/scramjet version mismatch: this build expects 2.0.67-alpha.2, but the loaded runtime is 2.0.66
```

The controller asserts the core version in its constructor, so this throws
before a single request goes out. The two packages are versioned together and
the controller won't run against a core it wasn't built against.

Three causes, in the order they are worth checking:

1. **A stale `node_modules`.** Bump both packages together and reinstall. The
   [version matrix](versions.md) lists the pairs verified to work.
2. **A cached `scramjet.js`.** Your own service worker outlived a deploy and is
   serving the previous bundle from `Cache Storage` while the page loads the new
   controller. Unregister the worker and hard-reload; see
   [changes to sw.js don't take effect](#changes-to-swjs-do-not-take-effect).
3. **Two copies on the page.** A bundler resolved `@mercuryworkshop/scramjet`
   into your app bundle while a `<script>` tag also loaded the classic build.
   Only the script tag should load it.

The neighboring error means the core bundle never loaded at all:

```text
@mercuryworkshop/scramjet is not loaded. Load scramjet before the controller.
```

Load order is core, controller, then utils. See
[version guards](controller-api.md#version-guards).

---

## `BareMux is not defined`

`/baremux/index.js` didn't load, or loaded after your script. It is a classic
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
SharedWorker errors don't appear in the page console.

Open `chrome://inspect/#workers` (or Firefox's `about:debugging`) and inspect
the worker directly. It is the best bare-mux debugging trick there is, and
almost nobody knows it.

---

## The wisp connection fails or drops

**Check the path matches exactly.** A very common bug:

A proxied URL can contain `/wisp/` in its path, so don't use
`req.url.includes("/wisp/")`. Match the parsed pathname:

```js
const wispPath = new URL(req.url ?? "/", "http://localhost").pathname;
if (wispPath === "/wisp/") {
	req.url = wispPath;
	wisp.routeRequest(req, socket, head);
}
```

The base only exists to make `req.url` parseable; the scheme and host are
discarded when you read `.pathname`. Use a constant like this rather than
`` `http://${req.headers.host}` ``: `Host` is client-controlled, a malformed one
makes `new URL()` throw, and a throw inside an `upgrade` listener is an uncaught
exception rather than a failed request.

**Check the scheme.** An `https://` page can't open a `ws://` socket. The
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

1. **Try another transport.** libcurl and epoxy use different HTTP/TLS
   implementations, and bare doesn't terminate TLS in the browser at all, so a
   site can work on one and not another. Shipping more than one transport turns
   on [transport switching](../concepts/transports.md) and gives users that
   fallback themselves.
2. **Try Scramjet if you are on Ultraviolet.** UV's JavaScript rewriter breaks
   on more sites, and it hasn't had a release since October 2024, so most of
   those breakages aren't getting fixed for you. Check UV's `main` branch before
   giving up though, since a few fixes landed there after the last npm release.
   See [breaking changes](breaking-changes.md#ultraviolet-is-unmaintained).
3. **Check whether the site needs WebSockets.** If you are on a Bare deployment,
   they won't work at all.
4. **Check the console inside the frame.** Select the iframe's context in the
   devtools context dropdown. Rewriter failures usually show up as a syntax
   error in a rewritten script.
5. **Turn on `rewriterLogs`** and reload. See below.

### Getting the rewriter to tell you what it is doing

`rewriterLogs` is off by default and is the single most useful flag when you
suspect the rewriter rather than your own code. Scope it to the failing site so
you aren't drowning in output from every request:

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
[the flags that matter](scramjet-config.md#individual-flags).

Some sites won't work. Heavy anti-bot protection, aggressive integrity checking,
and DRM video are the usual categories, and no amount of configuration changes
that.

[Site compatibility](site-compatibility.md) works through the categories in
order, so you can tell which one you are hitting before spending time on it.

### Sites become `/undefined`

**This affects any site, not one search engine.** Any page that calls
`history.pushState` or `history.replaceState` with fewer than three arguments
can hit it, and single-page apps do that constantly.

Omitting the URL argument is valid: it keeps the current URL. Scramjet
2.0.67-alpha.2 turns it into a navigation to `/undefined`. The cause is one
line, and you can read it in the published bundle's own sourcemap:

```js
const url = String(ctx.args[2]);

if (url || url === "") ctx.args[2] = relevantclient.rewriteUrl(url);
```

`String(undefined)` is the string `"undefined"`, which is truthy, so the guard
on the second line passes and a missing argument gets rewritten into a real
path. The result is a proxied request to `https://crllect.dev/undefined`.

**Upstream has already fixed this**, by only stringifying when the argument is
actually present:

```js
const url = ctx.args[2] ? String(ctx.args[2]) : undefined;
```

That is on `main` and isn't in any published release, so it doesn't help you
yet. Check whether it has shipped before carrying the workaround forward.

Until then, the generated Scramjet adapter installs a frame-local compatibility
plugin. It supplies the frame's current URL only when either History method
omits the URL, and leaves real URLs, the URL watcher, and HTTP caching
unchanged. It patches `History.prototype` inside the proxied document, ahead of
Scramjet's own proxy, so the value that reaches the buggy line is already a real
URL:

```js
for (const method of ["pushState", "replaceState"]) {
	const original = history[method];
	history[method] = function (data, unused, url) {
		return original.call(this, data, unused, url ?? client.url.href);
	};
}
```

**It only covers the top-level document.** The plugin taps `init.post` and
returns early when `isTopLevel` is false, so a nested iframe inside the proxied
page, an embedded SPA or an ad frame, can still navigate itself to `/undefined`.
Patching every nested context is a bigger hammer than the bug warrants, and the
real fix is an upstream release.

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
| Host blocks outbound sockets    | Wisp can't connect anywhere                     |

---

## Sharing a dev server over a tunnel or Live Share

Someone else opens the link and gets a blank page, a refused connection, or
`Blocked request`. Four separate things have to line up, and the dev server only
does the first one for you if you ask.

**Bind to every interface.** Vite and Astro listen on `localhost` only, so
nothing outside your machine can reach them. Pass `--host` on the command, or
set it in the config so you cannot forget.

**Allow the tunnel's hostname.** Vite 6 rejects requests whose `Host` header it
does not recognize, which reads as `Blocked request. This host is not allowed`.
A leading dot covers subdomains, which you want, because most tunnels hand you a
fresh random one every restart.

Both live in the same place:

```js
export default defineConfig({
	server: {
		host: true,
		allowedHosts: [".trycloudflare.com", ".ngrok-free.app"]
	}
});
```

Astro takes the same two keys, nested one level deeper under `vite.server`.

The generated backend already binds every interface, so it needs nothing:
Express omits the host in `listen()`, which means all of them, and Fastify
passes `0.0.0.0` explicitly. It is the frontend dev server that needs the flag.
With no build step there is no separate frontend, so this whole section does not
apply.

**Use HTTPS, not a LAN address.** Service workers need a secure context, and
`localhost` is the only exemption. `http://192.168.1.5:5173` is not a secure
context, so the worker never registers and the proxy cannot work at all, however
healthy the page looks. Tunnels terminate TLS for you, which is the real reason
to prefer one over `--host` on its own.

**Check the tunnel forwards WebSockets and keeps the isolation headers.** Wisp
is one long-lived socket, so a tunnel that does not upgrade leaves you with a
page that loads and a proxy that never connects. Run the
[Start here](#start-here) checks in the visitor's browser rather than your own;
`crossOriginIsolated` is the one that catches a tunnel stripping
`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`.

Bare needs no upgrade, so if a tunnel refuses to carry WebSockets and you only
want to show someone the thing working, building with `--preset serverless` is
the quicker route than fighting the tunnel.

---

## Changes to sw.js don't take effect

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
