# Bootstrap or manual wiring

Scramjet needs browser files from the core, controller, utils, and transport
packages. It also needs a service worker and a Wisp endpoint. Manual wiring
installs those packages and serves them as static directories. Bootstrap skips
the install and builds the same routes at runtime.

## Bootstrap

Install the server and bootstrap package:

```bash
npm install express @mercuryworkshop/proxy-bootstrap@0.0.5
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
container may need npm access while the cache is rebuilt.

`proxy-bootstrap@0.0.5` should be used with libcurl; its epoxy client route is
broken. Use manual wiring to serve epoxy or to switch transports.

## Manual wiring

Install the packages. The versions are pinned because Scramjet 2.x is still on a
prerelease tag, so a bare `npm install @mercuryworkshop/scramjet` would pull a
1.x build instead. See the [version matrix](../reference/versions.md):

```bash
npm install express \
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
	if (new URL(req.url ?? "/", "https://myproxy.com").pathname === "/wisp/") {
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
api.config.scramjetPath = "/scram/scramjet.js";
api.config.wasmPath = "/scram/scramjet.wasm";
api.config.injectPath = "/controller/controller.inject.js";

const { default: LibcurlClient } = await import("/libcurl/index.mjs");
const scheme = location.protocol === "https:" ? "wss:" : "ws:";
const transport = new LibcurlClient({
	wisp: `${scheme}//${location.host}/wisp/`
});
const controller = new api.Controller({ serviceworker, transport });

await controller.wait();
```

The load order is core, controller, then utils. To switch transports later,
serve both modules and pass a new instance to `controller.setTransport()`.

Register the service worker once, here, and construct one controller for the
whole page. Frames come from `controller.createFrame()`, so a second
registration or a second controller buys nothing and costs a duplicate wisp
connection. For the same reason, `setTransport()` belongs on an actual transport
change and not on every navigation — see
[Transports](../concepts/transports.md).

## Which one

| Capability                        | Bootstrap | Manual                   |
| --------------------------------- | --------- | ------------------------ |
| Server setup                      | One call  | One install, five mounts |
| Runtime transport switching       | No        | Yes                      |
| Runtime packages in your lockfile | No        | Yes                      |
| npm access needed on a fresh boot | Yes       | No                       |
| Service worker maintained by you  | No        | Yes                      |

Manual wiring is the better default, and it is what every preset except
barebones uses. The extra work is an `npm install` and five `express.static`
lines, and it buys you pinned versions in your lockfile, startup with no network
access, custom paths, and transport switching. Reach for bootstrap when you want
the shortest possible server file and none of that matters. The builder emits
both versions from the same feature set.
