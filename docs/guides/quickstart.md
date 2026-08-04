# Quickstart

A working Scramjet proxy, from nothing, in about two minutes.

## Requirements

- **Node 22.13 or newer** to run this repository's builder. Check with
  `node -v`.
- A host that can hold a WebSocket open. Your own machine qualifies; serverless
  functions do not, though a static host may serve the client while Wisp runs
  elsewhere. See [Deployment](deployment.md).

## Generate a project

```bash
node builder/cli.js --out ./my-proxy --preset minimal
```

Or start the documentation site and use the `/build` route to download the zip.

```bash
cd my-proxy
npm install
npm start
```

Open the generated app's `/` route on its configured port, type an address, and
press enter. That is the whole thing.

Every package is a normal dependency in `package.json`, resolved by
`npm install` and pinned in your lockfile. Nothing is fetched at runtime.

---

## What you got

Eleven files. The interesting ones:

```text
server.js               static files + the wisp endpoint
public/index.html       the shell
public/js/engine.js     the only file that talks to Scramjet
public/js/app.js        DOM wiring
public/js/url.js        address-bar input -> URL
```

### `server.js`

```js
app.use((_req, res, next) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	next();
});

const dirOf = specifier => path.dirname(require.resolve(specifier));

app.use("/scram/", express.static(scramjetPath));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use(
	"/controller/",
	express.static(dirOf("@mercuryworkshop/scramjet-controller"))
);
app.use(
	"/libcurl/",
	express.static(dirOf("@mercuryworkshop/libcurl-transport"))
);
app.use(express.static("public"));

server.on("upgrade", (req, socket, head) => {
	if (new URL(req.url, `http://${req.headers.host}`).pathname === "/wisp/") {
		wisp.routeRequest(req, socket, head);
		return;
	}
	socket.end();
});
```

Three things are happening:

1. **Four static mounts.** Scramjet's bundle and wasm, the controller, utils,
   and the transport, each served straight out of `node_modules`. That is the
   entire server side of a proxy. See [Wiring Scramjet](wiring.md).
2. **The COOP/COEP headers.** Keep them. The engine itself runs without them,
   but they are what makes your page cross-origin isolated, and Scramjet passes
   that isolation on to every site you proxy. Remove them and any proxied site
   needing `SharedArrayBuffer` fails from inside its own bundle. See
   [Cross-origin isolation](../concepts/cross-origin-isolation.md).
3. **The upgrade handler** runs the [wisp](../concepts/wisp-vs-bare.md)
   endpoint. The WebSocket that carries all real traffic.

### `public/js/engine.js`

```js
const controller = new api.Controller({
	serviceworker,
	transport: new LibcurlClient({ wisp: wispUrl }),
	config: {
		scramjetPath: "/scram/scramjet.js",
		wasmPath: "/scram/scramjet.wasm",
		injectPath: "/controller/controller.inject.js"
	}
});
await controller.wait();

const frame = controller.createFrame(iframeElement, {
	plugins: [
		new utils.HttpCachePlugin(),
		new utils.UrlWatcherPlugin(url => console.log(url)),
		new utils.CatchEscapedLinksPlugin(url => new URL(location.href))
	]
});

frame.go("https://crllect.dev");
```

The generated file also registers the service worker and loads the three runtime
scripts before this runs. [Wiring Scramjet](wiring.md) walks through that boot
sequence line by line.

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

The minimal build has no tabs, no settings, no history, on purpose. It is meant
to be read in one sitting.

When you want more, regenerate:

```bash
node builder/cli.js --out ./my-proxy --preset standard --force
```

That gives you tabs, settings and
[transport switching](../concepts/transports.md), and moves you to TypeScript,
Vite and Tailwind. The server is the same four static mounts.

Or pick features individually:

```bash
node builder/cli.js --out ./my-proxy \
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
