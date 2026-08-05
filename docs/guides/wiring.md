# Wiring Scramjet

Scramjet needs browser files from the core, controller, utils, and transport
packages. It also needs a service worker and a
[Wisp](../concepts/wisp-vs-bare.md) endpoint. Wiring is how those get served.

**Do it manually.** You install the packages and serve five static directories.
That is the whole job, and everything else on this site assumes it.

There is a second way, `proxy-bootstrap`, which fetches and serves the same
files at runtime. Upstream's `create-proxy-app` scaffolds with it, so it is
covered at the bottom.

## Manual wiring

Install the packages. The versions are pinned because Scramjet 2.x is still on a
prerelease tag, so a bare `bun add @mercuryworkshop/scramjet` would pull a 1.x
build instead. See the [version matrix](../reference/versions.md):

```bash
bun add express \
    @mercuryworkshop/scramjet@2.0.67-alpha.2 \
    @mercuryworkshop/scramjet-controller@0.0.14 \
    @mercuryworkshop/scramjet-utils@0.0.3 \
    @mercuryworkshop/libcurl-transport@^2.0.5 \
    @mercuryworkshop/epoxy-transport@^3.0.1 \
    @mercuryworkshop/wisp-js@^0.4.1
```

That install is the whole difference on the server side. Everything below is a
static mount per package plus the Wisp upgrade handler.

### Server

Create `server.mjs`:

```js
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import express from "express";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const require = createRequire(import.meta.url);
const dirOf = specifier => path.dirname(require.resolve(specifier));
const app = express();

app.use((_req, res, next) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	next();
});

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
app.use("/epoxy/", express.static(dirOf("@mercuryworkshop/epoxy-transport")));
app.use(express.static("public"));

const server = http.createServer(app);
server.on("upgrade", (req, socket, head) => {
	const wispPath = new URL(req.url ?? "/", "http://localhost").pathname;
	if (wispPath === "/wisp/") {
		req.url = wispPath;
		wisp.routeRequest(req, socket, head);
		return;
	}
	socket.end();
});

server.listen(8080);
```

Run it with `node server.mjs`.

`require.resolve()` finds the browser package directory without importing the
browser-only transport module into Node.

Three lines in the upgrade handler are load-bearing, and all three are explained
in [Wisp vs Bare](../concepts/wisp-vs-bare.md#running-a-wisp-server): parse
against a constant base rather than the client-controlled `Host` header,
reassign `req.url` to the bare pathname before routing, and end every upgrade
you don't recognize.

### Service worker

Create `public/sw.js`:

```js
importScripts("/controller/controller.sw.js");

self.addEventListener("fetch", event => {
	if ($scramjetController.shouldRoute(event)) {
		event.respondWith($scramjetController.route(event));
	}
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event =>
	event.waitUntil(self.clients.claim())
);
```

The worker must be served from `/sw.js` so its scope can cover proxied routes.
Calling `shouldRoute()` before `route()` keeps the worker from intercepting its
own runtime files.

Generated projects add shell caching below that check, so your own bundle and
stylesheet are served from disk instead of competing with the tunnel on every
reload. See [the service worker cache](deployment.md#the-service-worker-cache).

### Client boot

Create the controller before creating any frames:

```js
const loadScript = src =>
	new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = src;
		script.onload = resolve;
		script.onerror = () => reject(new Error(`Failed to load ${src}`));
		document.head.append(script);
	});

const registration = await navigator.serviceWorker.register("/sw.js", {
	scope: "/",
	updateViaCache: "none"
});
await navigator.serviceWorker.ready;

if (!navigator.serviceWorker.controller) {
	await new Promise(resolve =>
		navigator.serviceWorker.addEventListener("controllerchange", resolve, {
			once: true
		})
	);
}

const serviceworker = navigator.serviceWorker.controller ?? registration.active;
if (!serviceworker) throw new Error("The service worker did not become active");

for (const src of [
	"/scram/scramjet.js",
	"/controller/controller.api.js",
	"/utils/scramjet-utils.js"
]) {
	await loadScript(src);
}

const api = window.$scramjetController;

const { default: LibcurlClient } = await import("/libcurl/index.mjs");
const scheme = location.protocol === "https:" ? "wss:" : "ws:";
const transport = new LibcurlClient({
	wisp: `${scheme}//${location.host}/wisp/`
});

const controller = new api.Controller({
	serviceworker,
	transport,
	config: {
		scramjetPath: "/scram/scramjet.js",
		wasmPath: "/scram/scramjet.wasm",
		injectPath: "/controller/controller.inject.js"
	}
});

await controller.wait();

setInterval(() => {
	navigator.serviceWorker.controller?.postMessage("keepalive");
}, 15000);
```

Those three paths have to match where you mounted the packages, because the
defaults assume a different layout. You will also see them written as
`api.config.wasmPath = …` before construction; both work, but passing `config`
doesn't mutate shared global state. Every option is listed in
[Config and flags](../reference/scramjet-config.md).

### The keepalive

That `setInterval` isn't decoration, and it isn't something Scramjet asks for.
It works around a live upstream bug: the browser terminates an idle service
worker, Scramjet's worker loses the frame prefixes it was routing, and every
navigation after that lands on your own 404 until the page is reloaded.

Posting any message to the worker resets its idle timer. Fifteen seconds is
comfortably inside the roughly thirty-second window browsers allow, with enough
margin to survive a throttled background tab.

It is a workaround, so treat it as one. It costs a resident service worker
process per open tab, which is a real if small cost on mobile, and it should be
deleted once the upstream handshake is fixed. See
[the bug and how to recognize it](../reference/troubleshooting.md#cannot-get-sj-after-the-tab-has-been-sitting-idle).

Do not skip `await controller.wait()`. It waits for the service worker to
complete its handshake and for the wasm to be fetched, and **nothing stops you
calling `createFrame()` before either has happened**. The readiness guard inside
it tests a promise the constructor always assigns, so it never fires; you get a
frame back, the worker may not be routing its prefix yet, and the first
navigation lands on your own 404. It does **not** wait for the cookie jar. That
loads lazily on the first proxied request, which the controller holds until it
is ready. See [Cookies and sessions](cookies-and-sessions.md) and the
[Controller API](../reference/controller-api.md#createframeelement-options).

**Do not drop the `setInterval`.** Browsers terminate an idle service worker
after about thirty seconds, and Scramjet's worker keeps its routing table in
module scope, so a cold worker can't route and the first navigation after a
quiet period lands on your own 404. The ping keeps it warm. A plain string
payload is deliberate: both of the worker's `message` listeners return early on
anything that isn't an object, so this wakes the worker and runs no handler.
Generated projects include it. See
[the idle service worker bug](../reference/troubleshooting.md#cannot-get-sj-after-the-tab-has-been-sitting-idle).

The load order is core, controller, then utils. To switch transports later,
serve both modules and pass a new instance to `controller.setTransport()`.

Register the service worker once, here, and construct one controller for the
whole page. Frames come from `controller.createFrame()`, so a second
registration or a second controller buys nothing and costs a duplicate wisp
connection. For the same reason, `setTransport()` belongs on an actual transport
change and not on every navigation. See [Transports](../concepts/transports.md).

## proxy-bootstrap

The other path. Upstream's `create-proxy-app` uses it, so plenty of projects
start here even though manual wiring is the better place to end up.

> **The generator will not build this for you from the web builder**, and no
> preset or example uses it. It is documented because you will meet it in other
> people's projects and because it is genuinely the shortest path to something
> running. If you want one anyway:
>
> ```bash
> node builder/cli.js --out ./my-proxy --wiring bootstrap
> ```
>
> Read [what bootstrap gives up](#what-bootstrap-gives-up) before you do.

Install the server and bootstrap package:

```bash
bun add express @mercuryworkshop/proxy-bootstrap@0.0.5
```

Create `server.mjs` so Node treats the file as an ES module:

```js
import http from "node:http";
import express from "express";
import { bootstrap } from "@mercuryworkshop/proxy-bootstrap";

const app = express();
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

const server = http.createServer(app);
server.on("upgrade", (req, socket, head) => {
	if (routeUpgrade(req, socket, head)) return;
	socket.end();
});

server.listen(8080);
```

Run it with `node server.mjs`.

Load the bootstrap client before your module in `public/index.html`:

```html
<script src="/bootstrap-init.js"></script>
<script type="module" src="/js/app.js"></script>
```

The client setup is one call:

```js
const controller = await initBootstrap();
```

`bootstrap()` resolves and caches its runtime package set, serves the browser
assets and service worker, and handles Wisp upgrades. Those runtime packages do
not appear in your application's lockfile. A fresh deployment or replacement
container may need registry access while the cache is rebuilt.

`proxy-bootstrap@0.0.5` should be used with libcurl; its epoxy client route is
broken. Use manual wiring to serve epoxy or to switch transports.

## What bootstrap gives up

| Capability                        | Manual                   | Bootstrap |
| --------------------------------- | ------------------------ | --------- |
| Server setup                      | One install, five mounts | One call  |
| Runtime packages in your lockfile | Yes                      | No        |
| Starts with no network access     | Yes                      | No        |
| Runtime transport switching       | Yes                      | No        |
| Service worker maintained by you  | Yes                      | No        |

The row that matters most is the lockfile. Bootstrap resolves its runtime
packages when the server boots, so an upstream release can change what your
deployed app runs without you touching anything. Every other row follows from
that same design.

Bootstrap is a fine way to see a proxy working in two minutes, and that is what
a throwaway experiment might use it for. For anything you intend to keep
running, take the install line and the five `express.static` lines.
