# Quickstart

A working Scramjet proxy, from nothing, in about two minutes.

## Requirements

- **Node 22.13 or newer** to run this repository's builder. Check with
  `node -v`.
- A host that can hold a WebSocket open. Your own machine qualifies; Vercel
  Functions do not, though Vercel may serve the client while Wisp runs
  elsewhere. See [Deployment](deployment.md).

## Generate a project

```bash
node builder/cli.js --out ./my-proxy --preset barebones
```

Or start the documentation site and use the `/build` route to download the zip.

```bash
cd my-proxy
npm install
npm start
```

Open the generated app's `/` route on its configured port, type an address, and
press enter. That is the whole thing.

> The first `npm start` takes a few seconds longer than later ones.
> `proxy-bootstrap` resolves and caches its runtime package set on first run.
> Those versions are not part of the generated project's lockfile.

---

## What you got

Ten files. The interesting ones:

```text
server.js               static files + the wisp endpoint
public/index.html       the shell
public/js/engine.js     the only file that talks to Scramjet
public/js/app.js        DOM wiring
public/js/url.js        address-bar input -> URL
```

### `server.js`

```js
const { routeRequest, routeUpgrade } = await bootstrap({
	transport: "libcurl"
});

app.use((_req, res, next) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	next();
});

app.use((req, res, next) => {
	if (routeRequest(req, res)) return;
	next();
});
app.use(express.static("public"));

server.on("upgrade", routeUpgrade);
```

Three things are happening:

1. **`bootstrap()`** downloads the Scramjet packages and returns two routers. It
   serves the Scramjet bundle, the wasm rewriter, the controller,
   scramjet-utils, the transport client, `/sw.js`, and `/bootstrap-init.js`.
2. **The COOP/COEP headers** have to be there. Scramjet's rewriter needs
   `SharedArrayBuffer`, which browsers withhold from pages that are not
   cross-origin isolated. Remove them and the app loads and then quietly fails.
   See [Cross-origin isolation](../concepts/cross-origin-isolation.md).
3. **`routeUpgrade`** runs the [wisp](../concepts/wisp-vs-bare.md) endpoint. The
   WebSocket that carries all real traffic.

### `public/js/engine.js`

```js
controller = await initBootstrap();

const frame = controller.createFrame(iframeElement, {
	plugins: [
		new utils.HttpCachePlugin(),
		new utils.UrlWatcherPlugin(url => console.log(url)),
		new utils.CatchEscapedLinksPlugin(url => new URL(location.href))
	]
});

frame.go("https://crllect.dev");
```

`initBootstrap()` is a global from `/bootstrap-init.js`. It registers the
service worker, loads every bundle, builds the transport, and hands back a ready
`Controller`.

What the three plugins do:

- **`HttpCachePlugin`** caches subresources so a reload does not pull every
  asset back through the tunnel.
- **`UrlWatcherPlugin`** is the only reliable way to learn where the page went.
  Scramjet 2.x has no `urlchange` event. It fires for real navigations, hash
  changes, and `history.pushState`.
- **`CatchEscapedLinksPlugin`** catches `window.open` and `target="_blank"`,
  which would otherwise escape the proxy entirely.

Five plugins ship with `scramjet-utils`, and you can write your own against the
same hooks. [Plugins and hooks](../reference/plugins-and-hooks.md) documents the
full surface.

> **`frame.go()` is synchronous.** It rewrites the URL and assigns `iframe.src`.
> Awaiting it does nothing useful. The real "it loaded" signal is the
> `UrlWatcherPlugin` callback. Some examples in the wild `await` it, which is
> harmless but misleading.

---

## Adding features

The barebones build has no tabs, no settings, no history, on purpose. It is
meant to be read in one sitting.

When you want more, regenerate:

```bash
node builder/cli.js --out ./my-proxy --preset standard --force
```

That gives you tabs, settings, transport switching, history and bookmarks, and
switches to **manual wiring**: you install the Scramjet packages and mount them
as static directories instead of letting bootstrap fetch them at runtime.

That switch is required for [transport switching](../concepts/transports.md),
because bootstrap only serves the single transport client it was configured
with. The builder enforces it rather than letting you generate something that
silently cannot work.

Or pick features individually:

```bash
node builder/cli.js --out ./my-proxy \
    --engine scramjet --wiring manual \
    --features tabs,settings,transportSwitch,history
```

---

## If it does not work

Run this in the browser console first:

```js
crossOriginIsolated;
```

`false` means the headers are missing, or, you aren't on `https://` or
`localhost`.

Then check whether the service worker took control:

```js
navigator.serviceWorker.controller?.scriptURL;
```

`undefined` means it has not claimed the page yet, reload once. If it stays
undefined, look for registration errors in the console.

Full list: [Troubleshooting](../reference/troubleshooting.md). Unfamiliar
terminology: [Glossary](../reference/glossary.md).

---

## Next

- [How a proxy works](../concepts/how-proxies-work.md). What those four files do
- [Multiple tabs](multiple-tabs.md). The first feature most people want
- [Deployment](deployment.md). Getting it online, with HTTPS
