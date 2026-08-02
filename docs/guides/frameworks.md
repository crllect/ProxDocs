# Framework integrations

## React and Astro frontends

The builder can generate either frontend directly:

```bash
node builder/cli.js --out ./react-proxy --preset react
node builder/cli.js --out ./astro-proxy --preset astroPreact
```

The React preset renders the browser shell from `src/ProxyShell.tsx` and starts
the proxy controller from a React effect after the shell commits. The Astro
preset renders the same component as a hydrated Preact island from
`src/pages/index.astro`.

Both keep proxy sessions outside framework state. React or Preact owns the
stable controls and containers; `app.ts` owns iframe creation, navigation, tabs,
and popup documents. This avoids rerendering an active proxy frame when UI state
changes.

Use React when the rest of your client already uses React. Use Astro + Preact
when you want a static page with only the proxy shell hydrated. The generated
examples are in [`examples/react`](../../examples/react/) and
[`examples/astro-preact`](../../examples/astro-preact/).

## Server frameworks

The server has exactly two jobs, and every framework does them the same way:

1. **Serve static files**. Yours, plus the engine's bundles from `node_modules`.
2. **Route WebSocket upgrades** to the Wisp handler.

Job 2 is where frameworks differ, because most of them abstract over the raw
HTTP server and wisp needs the raw socket. The pattern below is the same
everywhere: get the underlying `http.Server`, attach an `upgrade` listener.

The generated projects use Express by default. The examples below show the
framework-specific server setup.

---

## Fastify

Used by most large proxy sites, and the framework Scramjet's own dev server
uses.

```js
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dirOf = spec => path.dirname(require.resolve(spec));

const app = Fastify({
	serverFactory: handler => {
		const server = require("node:http").createServer(handler);
		server.on("upgrade", (req, socket, head) => {
			if (new URL(req.url, "https://myproxy.com").pathname === "/wisp/") {
				wisp.routeRequest(req, socket, head);
			} else {
				socket.end();
			}
		});
		return server;
	}
});

app.addHook("onSend", async (_req, reply) => {
	reply.header("Cross-Origin-Opener-Policy", "same-origin");
	reply.header("Cross-Origin-Embedder-Policy", "require-corp");
});

await app.register(fastifyStatic, { root: path.join(__dirname, "public") });
await app.register(fastifyStatic, {
	root: scramjetPath,
	prefix: "/scram/",
	decorateReply: false
});
await app.register(fastifyStatic, {
	root: dirOf("@mercuryworkshop/scramjet-utils"),
	prefix: "/utils/",
	decorateReply: false
});
await app.register(fastifyStatic, {
	root: dirOf("@mercuryworkshop/scramjet-controller"),
	prefix: "/controller/",
	decorateReply: false
});
await app.register(fastifyStatic, {
	root: dirOf("@mercuryworkshop/libcurl-transport"),
	prefix: "/libcurl/",
	decorateReply: false
});

await app.listen({ port: 8080, host: "0.0.0.0" });
```

The `serverFactory` is the key: Fastify normally owns the HTTP server, and this
is how you get at it to attach the upgrade handler.

Two `@fastify/static` gotchas that cost people an hour each:

-   **`decorateReply: false` on every registration after the first.** Omit it
    and Fastify throws about a duplicate decorator.
-   **Two registrations may not share a prefix.** Express happily stacks
    `express.static` calls on one path and falls through; Fastify throws
    `FST_ERR_DUPLICATED_ROUTE`. That is why `scramjet-utils` is mounted at
    `/utils/` above rather than alongside the core bundle at `/scram/`, and why
    the engine adapter loads it from `/utils/scramjet-utils.js`.

---

## Hono

Runtime-agnostic, so the wisp part depends on where it runs. On Node:

```js
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createRequire } from "node:module";
import path from "node:path";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const app = new Hono();
const require = createRequire(import.meta.url);
const dirOf = specifier => path.dirname(require.resolve(specifier));

app.use("*", async (c, next) => {
	await next();
	c.header("Cross-Origin-Opener-Policy", "same-origin");
	c.header("Cross-Origin-Embedder-Policy", "require-corp");
});

for (const [prefix, root] of [
	["/scram", scramjetPath],
	["/utils", dirOf("@mercuryworkshop/scramjet-utils")],
	["/controller", dirOf("@mercuryworkshop/scramjet-controller")],
	["/libcurl", dirOf("@mercuryworkshop/libcurl-transport")]
]) {
	app.use(
		`${prefix}/*`,
		serveStatic({
			root: path.relative(process.cwd(), root),
			rewriteRequestPath: requestPath => requestPath.slice(prefix.length)
		})
	);
}
app.use("/*", serveStatic({ root: "./public" }));

const server = serve({ fetch: app.fetch, port: 8080 });

server.on("upgrade", (req, socket, head) => {
	if (new URL(req.url, "https://myproxy.com").pathname === "/wisp/") {
		wisp.routeRequest(req, socket, head);
	} else {
		socket.end();
	}
});
```

`@hono/node-server`'s `serveStatic` takes paths relative to `process.cwd()`, not
absolute ones, which is awkward when serving out of `node_modules`. Copying the
bundles into `public/` at build time is often less painful.

**Do not run this under Bun.** `@hono/node-server` never takes over Bun's
server, and you get Bun's "Welcome to Bun!" placeholder instead of your app. See
the Bun section below.

---

## Vite (development)

Vite's dev server is Connect-based and exposes `httpServer`, so a plugin can do
everything:

```js
import { createRequire } from "node:module";
import path from "node:path";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import sirv from "sirv";

const require = createRequire(import.meta.url);
const dirOf = specifier => path.dirname(require.resolve(specifier));
const assets = [
	["/scram", scramjetPath],
	["/utils", dirOf("@mercuryworkshop/scramjet-utils")],
	["/controller", dirOf("@mercuryworkshop/scramjet-controller")],
	["/libcurl", dirOf("@mercuryworkshop/libcurl-transport")]
];

export default {
	server: {
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp"
		}
	},
	plugins: [
		{
			name: "proxy-backend",
			configureServer(server) {
				for (const [prefix, root] of assets) {
					server.middlewares.use(prefix, sirv(root, { dev: true }));
				}

				server.httpServer?.on("upgrade", (req, socket, head) => {
					if (
						new URL(req.url, "https://myproxy.com").pathname ===
						"/wisp/"
					) {
						wisp.routeRequest(req, socket, head);
					}
				});
			}
		}
	]
};
```

Two things to get right:

**`server.headers` sets COOP/COEP in dev.** Without them Vite serves an
un-isolated page and Scramjet fails, while your production server works, a
confusing split.

**Do not `socket.end()` on unmatched upgrades.** Vite's HMR WebSocket is also an
upgrade. Closing it breaks hot reload. Let other handlers see it.

For production, `vite build` your frontend and serve `dist/` from a normal Node
server as shown above.

---

## Next.js

Next's App Router does not give you the HTTP server, so there is nowhere to
attach an upgrade listener. You need a custom server, which disables some of
Next's deployment optimisations.

```js
import next from "next";
import http from "node:http";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const app = next({ dev: process.env.NODE_ENV !== "production" });
const handle = app.getRequestHandler();

await app.prepare();

const server = http.createServer((req, res) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	handle(req, res);
});

server.on("upgrade", (req, socket, head) => {
	if (new URL(req.url, "https://myproxy.com").pathname === "/wisp/") {
		wisp.routeRequest(req, socket, head);
	}
});

server.listen(3000);
```

Serve the engine bundles by copying them into `public/` in a `postinstall`
script. `next/static` will not serve arbitrary `node_modules` directories. Do
not close unmatched upgrades in development; Next uses them for hot reload.

Also set the headers in `next.config.js` so they apply to Next's own routes:

```js
export default {
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },
					{
						key: "Cross-Origin-Embedder-Policy",
						value: "require-corp"
					}
				]
			}
		];
	}
};
```

**This custom server cannot run in Vercel Functions**, since the persistent Wisp
upgrade handler is the point. Vercel can still serve the client when Wisp is
hosted separately. If you are using Next because you like React, consider Vite
instead; the proxy shell is not a content site and gains little from Next.

---

## SvelteKit

`adapter-node` gives you a handler you can wrap:

```js
import { handler } from "./build/handler.js";
import express from "express";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
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
app.use(handler);

const server = http.createServer(app);
server.on("upgrade", (req, socket, head) => {
	if (new URL(req.url, "https://myproxy.com").pathname === "/wisp/") {
		wisp.routeRequest(req, socket, head);
	} else {
		socket.end();
	}
});
server.listen(3000);
```

In development, use a Vite plugin as above. SvelteKit's dev server is Vite.

---

## Bun

Bun is worth using as a **runtime**. Installs and startup are noticeably faster,
and it runs your TypeScript server directly with no `tsx` and no build step. But
its `node:http` compatibility layer is not uniform across these frameworks, and
the failures are quiet rather than loud.

Tested directly, with a real wisp tunnel and a real proxied page:

|                            | Node  | Bun                                              |
| -------------------------- | ----- | ------------------------------------------------ |
| Express                    | works | **works**                                        |
| Fastify                    | works | **broken**. Correct headers, empty response body |
| Hono (`@hono/node-server`) | works | **broken**. You get Bun's "Welcome to Bun!" page |

Fastify's failure is `@fastify/static`'s file streaming not surviving Bun's
`node:http` shim: the status and `Content-Type` are right and the body is zero
bytes, which looks like a routing bug and is not one. Hono's is
`@hono/node-server` never taking ownership of the server, so Bun's own default
handler answers instead.

Neither is something you can configure around, so **use Express if you want
Bun**. The builder enforces this pairing rather than letting you generate a
project that starts cleanly and serves nothing.

### Bun.serve

The obvious question is why not use `Bun.serve` natively. The answer is wisp:

```js
wisp.routeRequest(req, socket, head);
```

`Bun.serve`'s WebSocket API gives you a `ServerWebSocket` with `open`/`message`
handlers. A completely different shape, with no raw socket and no adapter in
`@mercuryworkshop/wisp-js`. You would have to reimplement the wisp server to use
it. If you only need static files and no tunnel, `Bun.serve` is lovely; for a
proxy it cannot carry the part that matters.

### Running the generated project on Bun

```bash
bun install
bun run start      # builds the frontend, then `bun server.ts`
```

No `tsx`, no loader flag. That is the real win, and it applies to any of the
Express-based builds.

## The rules, whatever you use

1. **COOP and COEP on every response**, including static assets, or Scramjet
   silently fails. See
   [Cross-origin isolation](../concepts/cross-origin-isolation.md).
2. **Match the wisp path exactly.** `req.url.includes("/wisp/")` is a real bug.
   A proxied URL can contain that string.
3. **Serve the engine bundles at the paths your client expects.** A mismatch
   shows up as a 404 for `scramjet.wasm`, not as a clear error.
4. **Do not cache `sw.js`.** A stale service worker after a deploy is very hard
   to debug.
5. **Get the raw `http.Server`.** Every framework has a way; that is where the
   upgrade handler goes.
