# Breaking changes

Things that changed and will break code copied from older guides. Roughly newest
first.

---

## The published Scramjet docs describe the older API

**Affects:** anyone following <https://mercuryworkshop-scramjet.mintlify.app/>

The official documentation site currently documents the **Scramjet 1.x** API.
`$scramjetLoadController()`, `ScramjetController`, `ScramjetFrame`,
`frame.addEventListener("urlchange")`, and bare-mux for transports.

The repository's `main` branch has moved to a different architecture: separate
`scramjet-controller` and `scramjet-utils` packages, a `Controller` class,
[plugin](plugins-and-hooks.md)-based frames, and `proxy-transports` instead of
bare-mux.

Both are real. 1.x is the npm `latest` and what most community code uses; 2.x is
where development happens. Neither is wrong. Just check which one a given guide
means.

| 1.x                                                        | 2.x                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `const { ScramjetController } = $scramjetLoadController()` | `const { Controller } = window.$scramjetController`                                |
| `new ScramjetController({ prefix, flags, codec })`         | `new Controller({ serviceworker, transport })`                                     |
| `await scramjet.init()`                                    | `await controller.wait()`                                                          |
| `scramjet.createFrame()`, creates the iframe               | `controller.createFrame(element?, { plugins })`, takes one or makes a detached one |
| `frame.frame` is the element                               | `frame.element` is the element                                                     |
| `frame.addEventListener("urlchange", cb)`                  | `new UrlWatcherPlugin(cb)` in `plugins`                                            |
| `frame.url`                                                | Track it from the `UrlWatcherPlugin` callback                                      |
| `scramjet.encodeUrl(url)`                                  | `frame.go(url)` does it                                                            |
| Transports via bare-mux                                    | Transport object passed to `Controller`                                            |

---

## bare-mux is deprecated

**Version:** `@mercuryworkshop/bare-mux@2.1.9` (April 2026)

The package now ships a deprecation notice pointing at
`@mercuryworkshop/proxy-transports`.

**What to do:** on Scramjet 2.x, nothing. It already uses proxy-transports, and
you should not add bare-mux. On Ultraviolet 3.x, keep using bare-mux; UV has no
other option and is not going to get one.

See [bare-mux and proxy-transports](../concepts/bare-mux.md).

---

## bare-as-module3 became bare-transport

**Versions:** `bare-as-module3@2.2.5` (Oct 2024) → `bare-transport@1.0.0`
(Dec 2025)

The Bare transport was rewritten against `proxy-transports` and **republished
under a new name**, restarting at 1.0.0:

| Package                            | Interface          | Engine       |
| ---------------------------------- | ------------------ | ------------ |
| `@mercuryworkshop/bare-as-module3` | `bare-mux`         | Ultraviolet  |
| `@mercuryworkshop/bare-transport`  | `proxy-transports` | Scramjet 2.x |

Both are still on npm and neither is deprecated, so nothing warns you.
Installing the familiar name on Scramjet gets you a transport it cannot use.

The version numbers make it worse: the replacement is `1.0.0` and the old one is
`2.2.5`, so the dead package looks newer.

**What this changes:** Scramjet no longer requires a WebSocket. Over Bare it
runs on request/response serverless hosts, which used to be the one thing only
Ultraviolet could do. `proxy-bootstrap` cannot wire it yet, so use
[manual wiring](../guides/wiring.md).

---

## Transport path helpers removed

**Versions:** `libcurl-transport@2.0.0` (Dec 2025), `epoxy-transport@3.0.0`
(Dec 2025)

This breaks server code that imports the old path helpers.

```js
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";

app.use("/libcurl/", express.static(libcurlPath));
```

The new majors dropped the `./node` export subpath, so those imports no longer
resolve and the package root gives you the browser bundle. Importing libcurl in
Node throws `environment detection error`, from its Emscripten runtime; epoxy is
wasm-bindgen and fails with something else.

(`epoxy-transport` still _ships_ a `lib/index.cjs` exporting `epoxyPath`. It is
simply unreachable, because `exports` only declares `"."`. Do not try to reach
around it, resolve the directory instead.)

**Fix:** resolve the directory without executing the module.

```js
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dirOf = spec => path.dirname(require.resolve(spec));

app.use(
	"/libcurl/",
	express.static(dirOf("@mercuryworkshop/libcurl-transport"))
);
app.use("/epoxy/", express.static(dirOf("@mercuryworkshop/epoxy-transport")));
```

**Or** stay on `libcurl@^1` / `epoxy@^2`. Which is what you want anyway if you
are on Ultraviolet. See the [version matrix](versions.md).

---

## Scramjet split into three packages

**Version:** Scramjet 2.x

`@mercuryworkshop/scramjet` used to contain everything. Now:

| Package               | Contains                        | Global                |
| --------------------- | ------------------------------- | --------------------- |
| `scramjet`            | Core, rewriter, wasm            | `$scramjet`           |
| `scramjet-controller` | Window-side API, service worker | `$scramjetController` |
| `scramjet-utils`      | Official plugins                | `$scramjetUtils`      |

All three must be served and loaded **in that order**. The
[controller](../guides/wiring.md) expects `$scramjet` to exist, and utils
expects the controller.

```js
const runtimeScripts = [
	"/scram/scramjet.js",
	"/controller/controller.api.js",
	"/utils/scramjet-utils.js"
];
```

---

## The `latest` GitHub release URL moved on

**Affects:** anything pinning a tarball URL

```json
{
	"@mercuryworkshop/scramjet": "https://github.com/MercuryWorkshop/scramjet/releases/download/latest/mercuryworkshop-scramjet-2.0.0-alpha.tgz"
}
```

`latest` is a rolling continuous build. It now serves
`mercuryworkshop-scramjet-2.0.67-alpha.2.tgz`, so that exact filename 404s.

**Fix:** install from npm with an explicit version.

```json
{
	"@mercuryworkshop/scramjet": "2.0.67-alpha.2"
}
```

---

## Ultraviolet 3.1.2 added `uv.route()`

**Version:** Ultraviolet 3.1.2

Before it, service workers called `uv.fetch()` on every request, so the worker
tried to proxy your own site's assets too.

```js
self.addEventListener("fetch", event => event.respondWith(uv.fetch(event)));

self.addEventListener("fetch", event => {
	event.respondWith(
		(async () => {
			if (uv.route(event)) return await uv.fetch(event);
			return await fetch(event.request);
		})()
	);
});
```

---

## Ultraviolet 3.0 replaced the bare client with bare-mux

**Version:** Ultraviolet 3.0.0

Before 3.0, UV talked to a bare server directly and `__uv$config.bare` was the
whole configuration. From 3.0 the request layer goes through bare-mux, so you
must set a [transport](../concepts/transports.md) before anything works:

```js
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
await connection.setTransport("/libcurl/index.mjs", [{ wisp: wispUrl }]);
```

`__uv$config.bare` did not survive that change. **Nothing in UV 3.x reads it**,
not even on a [bare](../concepts/wisp-vs-bare.md) deployment. The Bare URL is an
argument to `setTransport()` now. Leaving it set is harmless and does nothing.
Nearly every config in the wild still has it.

---

## Ultraviolet 2.0 required Bare server v3

**Version:** Ultraviolet 2.0.0

Support for older bare servers was dropped. V3 replaced V2's separate
host/port/protocol/path headers with a single `X-Bare-URL`.

If you see `/v2/` endpoints or `X-Bare-Host` anywhere, it predates this.

---

## Ultraviolet is unmaintained

**Date:** last npm release 3.2.10, 27 October 2024

The README says it plainly: "this project isn't really maintained anymore… It
has been superseded by Scramjet."

The repository is **not** archived, despite how often that gets repeated. It is
open, it still accepts issues, and commits have landed since. What stopped is
releases, and that gap matters, because `main` now carries fixes that npm 3.2.10
does not:

| Landed     | Change                                        |
| ---------- | --------------------------------------------- |
| 2024-11-16 | `codecs.js` update (#167)                     |
| 2024-11-26 | WebSocket `isTrusted` and proper `on*` values |
| 2025-03-06 | `import.meta.url` rewriting (#178)            |
| 2025-03-06 | dependency updates                            |

So if you are on UV and hitting one of those, installing from the git `main`
branch rather than npm is a real option. Do not expect a review on your PR
quickly.

It still works, and it remains the option for an all-in-one backend that cannot
hold Wisp's WebSocket open. A separately hosted Wisp relay removes that hosting
constraint. See [Scramjet vs Ultraviolet](../concepts/engines.md).

---

## Things that are not breaking changes but look like it

**`frame.go()` returns nothing.** In Scramjet 2.x it is synchronous, it rewrites
the URL and assigns `iframe.src`. Some examples `await` it; that is harmless but
misleading. The real load signal is `UrlWatcherPlugin`.

**`beginNavigation`, `resetRemoteTransports`, `discardFrame`.** These appear in
some production proxy codebases. They are **not upstream API**, they are local
patches to a forked Scramjet. Do not expect them on the published packages.

**`navigator.serviceWorker.ready` resolving early.** It resolves when a worker
becomes active, which is not the same as it controlling the current document. On
a first load the page is uncontrolled and every proxied request misses the
worker. Wait for `controllerchange` as well.
