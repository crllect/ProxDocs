# Ultraviolet on Vercel

Vercel can serve a Scramjet client, but Vercel Functions cannot host bundled
Wisp because its persistent WebSocket outlives a function request. An all-in-one
Vercel build therefore uses **Ultraviolet over Bare**. Wisp may instead run on a
separate WebSocket-capable host.

Read [the tradeoffs](#what-you-are-giving-up) before you commit to it. They are
significant, and "move to a host that supports WebSockets" is often the better
answer.

```bash
node builder/cli.js --out ./my-proxy --preset staticHost
```

---

## Why the constraint exists

Vercel Functions use a request/response lifecycle and cannot keep Wisp's
WebSocket open between requests.

[Wisp](../concepts/wisp-vs-bare.md) is a single persistent WebSocket carrying
every stream. The two models cannot be reconciled. It is not a configuration
problem and there is no flag to set.

[Bare](../concepts/wisp-vs-bare.md) is ordinary HTTP: one request in, one
response out. That maps onto a Vercel Function.

So the all-in-one combination for Vercel is:

```text
Ultraviolet  (no SharedArrayBuffer, so no COOP/COEP requirement)
    over
bare-as-module3  (plain HTTP, no WebSocket)
    to
@tomphttp/bare-server-node  (running as a serverless function)
```

Scramjet has no bare transport at all. `proxy-bootstrap` contains a stub that
throws `"Bare transport not implemented yet"`. Do not spend time trying.

---

## The server

```js
import express from "express";
import http from "node:http";
import { createBareServer } from "@tomphttp/bare-server-node";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { bareModulePath } from "@mercuryworkshop/bare-as-module3";

const app = express();

app.use("/uv/", express.static(uvPath));
app.use("/baremux/", express.static(baremuxPath));
app.use("/baremod/", express.static(bareModulePath));
app.use(express.static("public"));

const bareServer = createBareServer("/bare/");
const handleRequest = (req, res) => {
	if (bareServer.shouldRoute(req)) {
		bareServer.routeRequest(req, res);
		return;
	}
	app(req, res);
};

export default handleRequest;

if (!process.env.VERCEL) {
	http.createServer(handleRequest).listen(process.env.PORT || 3000);
}
```

Note there is **no `upgrade` handler and no COOP/COEP middleware**. Ultraviolet
does not need isolation, and there are no WebSockets to route.

### `vercel.json`

```json
{
	"version": 2,
	"builds": [
		{
			"src": "server.js",
			"use": "@vercel/node",
			"config": {
				"includeFiles": [
					"public/**",
					"node_modules/@titaniumnetwork-dev/ultraviolet/**",
					"node_modules/@mercuryworkshop/bare-mux/**",
					"node_modules/@mercuryworkshop/bare-as-module3/**"
				]
			}
		}
	],
	"routes": [{ "src": "/(.*)", "dest": "server.js" }]
}
```

Everything goes to one exported function. `includeFiles` keeps the application,
UV, bare-mux, and Bare module assets available to Express after Vercel traces
the server bundle.

## The client

```js
self.__uv$config = {
	prefix: "/service/",
	bare: "/bare/",
	encodeUrl: Ultraviolet.codec.xor.encode,
	decodeUrl: Ultraviolet.codec.xor.decode,
	handler: "/uv/uv.handler.js",
	client: "/uv/uv.client.js",
	bundle: "/uv/uv.bundle.js",
	config: "/uv-config.js",
	sw: "/uv/uv.sw.js"
};
```

```js
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
await connection.setTransport("/baremod/index.mjs", [
	new URL("/bare/", location.href).href
]);

const registration = await navigator.serviceWorker.register("/uv-sw.js", {
	scope: __uv$config.prefix
});

const worker =
	registration.active ?? registration.installing ?? registration.waiting;
if (worker && worker.state !== "activated") {
	await new Promise(resolve =>
		worker.addEventListener("statechange", () => {
			if (worker.state === "activated") resolve();
		})
	);
}

iframe.src = __uv$config.prefix + __uv$config.encodeUrl(url);
```

> **The `bare` field confuses everyone.** Almost every Ultraviolet config in the
> wild sets `bare:` even when running libcurl or epoxy over wisp, where it is
> completely ignored. It is only read by the Bare transport. In this setup it is
> used; in a Wisp setup you can delete it.

---

## What you are giving up

### WebSocket sites will not work

Not "will be slow". Will not work. Discord, most chat apps, live dashboards,
collaborative editors, anything with real-time updates. The Bare spec does
define WebSocket tunnelling, but it needs a connection the function cannot hold.

This rules out a large fraction of what people want a proxy for.

### Your server can inspect target traffic

The Bare server terminates TLS with the target site. It can read every URL,
cookie, form post, and response that passes through the function.

With Wisp, HTTPS target TLS terminates in the browser and the relay sees
ciphertext plus connection metadata. Plain HTTP destinations are not encrypted
end to end.

If you deploy this, tell your users. It is a legitimate engineering tradeoff and
a bad thing to be quiet about.

### Worse site compatibility

Ultraviolet's JavaScript rewriter breaks on more sites than Scramjet's Rust/WASM
one, and it is [archived](../concepts/scramjet-vs-ultraviolet.md), when a site
changes something UV gets wrong, it stays wrong.

### Execution limits and cold starts

Vercel functions have a wall-clock limit. Long downloads, video streaming, and
slow endpoints get cut off. Cold starts add latency to the first request after
idle.

### Check the host's terms

Public proxies attract abuse reports and may violate a provider's acceptable-use
policy. Read the current terms for your provider before deploying one.

---

## The alternative worth considering

Split the deployment:

```text
Frontend  → Vercel, Netlify, Cloudflare Pages, GitHub Pages (static, free, fast)
Backend   → a small VPS, Fly, Render, Railway, Koyeb (WebSockets work)
```

Point the client at the remote wisp server:

```js
const transport = new LibcurlClient({
	wisp: "wss://backend.crllect.dev/wisp/"
});
```

You get Scramjet, target-site WebSockets, and TLS in the browser while keeping
the CDN for static assets. The Wisp host needs a valid certificate; if it also
serves browser assets, those responses need appropriate CORS headers.

A small VPS or long-running application host can run Wisp without the function
limits above. See [Deployment](deployment.md).

---

## Other static hosts

| Host                           | Bare over HTTP   | Wisp              | Notes                                               |
| ------------------------------ | ---------------- | ----------------- | --------------------------------------------------- |
| Vercel                         | Yes              | Separately hosted | Functions cannot host persistent Wisp               |
| Netlify Functions              | Yes              | No                | Same model, shorter timeouts                        |
| Cloudflare Workers             | Partly           | No                | Different runtime; `bare-server-node` needs porting |
| GitHub Pages                   | No               | No                | Static files only, no server code at all            |
| Deno Deploy                    | Runtime-specific | Runtime-specific  | Requires a Deno-compatible Wisp server              |
| Render / Fly / Railway / Koyeb | Yes              | **Yes**           | Real Node processes; use Scramjet                   |

Deno Deploy requires a Deno-compatible Wisp server rather than
`@mercuryworkshop/wisp-js`'s Node build. Verify current WebSocket limits before
choosing it.
