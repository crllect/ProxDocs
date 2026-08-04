# Version matrix

Verified against the npm registry on **2026-08-02**. The canonical copy lives in
[`builder/versions.js`](https://github.com/crllect/ProxDocs/blob/main/builder/versions.js),
which is what the generator uses.

---

## Pick a row and use everything in it

Here are two working mixing generations:

### Scramjet 2.x, current architecture

```json
{
	"@mercuryworkshop/scramjet": "2.0.67-alpha.2",
	"@mercuryworkshop/scramjet-controller": "0.0.14",
	"@mercuryworkshop/scramjet-utils": "0.0.3",
	"@mercuryworkshop/libcurl-transport": "^2.0.5",
	"@mercuryworkshop/epoxy-transport": "^3.0.1",
	"@mercuryworkshop/wisp-js": "^0.4.1"
}
```

Or let `@mercuryworkshop/proxy-bootstrap@0.0.5` fetch all of it at runtime.

### Ultraviolet 3.x. For hosts that cannot hold a WebSocket

```json
{
	"@titaniumnetwork-dev/ultraviolet": "^3.2.10",
	"@mercuryworkshop/bare-mux": "^2.1.9",
	"@mercuryworkshop/libcurl-transport": "^1.5.2",
	"@mercuryworkshop/epoxy-transport": "^2.1.28",
	"@mercuryworkshop/wisp-js": "^0.4.1",

	"@mercuryworkshop/bare-as-module3": "^2.2.5",
	"@tomphttp/bare-server-node": "^2.0.3"
}
```

The last two are only needed for a bare deployment.

---

## The trap: `latest` is not the newest Scramjet

```bash
npm install @mercuryworkshop/scramjet     # installs 1.1.0, not 2.x
```

Scramjet 2.x is published under the **`alpha`** dist-tag. `latest` still points
at the 1.x line, which uses a completely different API
(`$scramjetLoadController` and bare-mux). Ask for the version explicitly:

```bash
npm install @mercuryworkshop/scramjet@2.0.67-alpha.2
```

Pin the Scramjet packages exactly. These are alphas and the
[controller](../guides/wiring.md) API has changed more than once between them.

Older guides install from a GitHub release URL:

`https://github.com/MercuryWorkshop/scramjet/releases/download/latest/mercuryworkshop-scramjet-2.0.0-alpha.tgz`

`latest` there is a rolling continuous build, so that URL no longer resolves to
the version the guide was written against. Everything is on npm now; use npm.

---

## Transport compatibility

The interface these implement changed, and the package majors track it:

| Engine          | Interface package  | libcurl      | epoxy         |
| --------------- | ------------------ | ------------ | ------------- |
| Ultraviolet 3.x | `bare-mux`         | `^1` (1.5.2) | `^2` (2.1.28) |
| Scramjet 1.x    | `bare-mux`         | `^1`         | `^2`          |
| Scramjet 2.x    | `proxy-transports` | `^2` (2.0.5) | `^3` (3.0.1)  |

Mismatched versions sometimes _appear_ to work, because the two interfaces are
structurally similar. That is worse than failing outright, you get errors on
specific sites rather than at startup.

---

## Node-side path helpers

Which packages export a helper for serving their browser assets:

| Package                            | Helper           | Import                           |
| ---------------------------------- | ---------------- | -------------------------------- |
| `@mercuryworkshop/scramjet`        | `scramjetPath`   | `@mercuryworkshop/scramjet/path` |
| `@mercuryworkshop/bare-mux`        | `baremuxPath`    | `@mercuryworkshop/bare-mux/node` |
| `@titaniumnetwork-dev/ultraviolet` | `uvPath`         | package root                     |
| `@mercuryworkshop/bare-as-module3` | `bareModulePath` | package root                     |
| `libcurl-transport` **1.x**        | `libcurlPath`    | package root                     |
| `epoxy-transport` **2.x**          | `epoxyPath`      | package root                     |
| `libcurl-transport` **2.x**        | **none**         | resolve manually                 |
| `epoxy-transport` **3.x**          | **none**         | resolve manually                 |
| `scramjet-controller`              | **none**         | resolve manually                 |
| `scramjet-utils`                   | **none**         | resolve manually                 |

For the ones without a helper:

```js
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dirOf = specifier => path.dirname(require.resolve(specifier));

app.use(
	"/controller/",
	express.static(dirOf("@mercuryworkshop/scramjet-controller"))
);
app.use(
	"/libcurl/",
	express.static(dirOf("@mercuryworkshop/libcurl-transport"))
);
```

`require.resolve` only resolves a path; it does not execute the module. That
matters because the newer transports are browser-only and **throw
`"environment detection error"` if you import them in Node**.

---

## What each package contains

| Package               | Serves as      | Key files                                                       |
| --------------------- | -------------- | --------------------------------------------------------------- |
| `scramjet`            | `/scram/`      | `scramjet.js`, `scramjet.wasm`                                  |
| `scramjet-controller` | `/controller/` | `controller.api.js`, `controller.inject.js`, `controller.sw.js` |
| `scramjet-utils`      | `/utils/`      | `scramjet-utils.js` (global `$scramjetUtils`)                   |
| `libcurl-transport`   | `/libcurl/`    | `index.mjs` (ESM), `index.js` (UMD)                             |
| `epoxy-transport`     | `/epoxy/`      | `index.mjs` (ESM), `index.js` (UMD)                             |
| `bare-mux`            | `/baremux/`    | `index.js`, `worker.js`                                         |
| `ultraviolet`         | `/uv/`         | `uv.bundle.js`, `uv.client.js`, `uv.handler.js`, `uv.sw.js`     |
| `bare-as-module3`     | `/baremod/`    | `index.mjs`                                                     |

The generated server gives each package a distinct prefix so the same routes
work in Express and Fastify.

---

## Release timeline

| Package                                | Version            | Published  |
| -------------------------------------- | ------------------ | ---------- |
| `@mercuryworkshop/scramjet`            | 2.0.67-alpha.2     | 2026-06-24 |
| `@mercuryworkshop/scramjet`            | 1.1.0 (`latest`)   | 2026-04-27 |
| `@mercuryworkshop/scramjet-controller` | 0.0.14             | 2026-06-24 |
| `@mercuryworkshop/scramjet-utils`      | 0.0.3              | 2026       |
| `@mercuryworkshop/proxy-bootstrap`     | 0.0.5              | 2026       |
| `@mercuryworkshop/proxy-transports`    | 1.0.2              | 2025-12-18 |
| `@mercuryworkshop/bare-mux`            | 2.1.9 (deprecated) | 2026-04-27 |
| `@mercuryworkshop/epoxy-transport`     | 3.0.1              | 2025-12-25 |
| `@mercuryworkshop/libcurl-transport`   | 2.0.5              | 2025-12-24 |
| `@mercuryworkshop/wisp-js`             | 0.4.1              | 2025-12-05 |
| `@titaniumnetwork-dev/ultraviolet`     | 3.2.10 (final)     | 2024-10-27 |
| `wisp-server-node`                     | 1.1.8              | 2025-11-04 |
| `chemicaljs`                           | 2.6.4              | 2024-12-26 |

Two things to read off this table: **Ultraviolet has not shipped since October
2024** and is archived. And **bare-mux 2.1.9 carries a deprecation notice**
pointing at `proxy-transports`, even though UV 3.x still depends on it.

---

## Checking for yourself

```bash
npm view @mercuryworkshop/scramjet dist-tags
npm view @mercuryworkshop/scramjet-controller version
npm view @mercuryworkshop/libcurl-transport versions --json | tail -20
```

If this page and npm disagree, npm is right and this page is stale. Please open
a PR.
