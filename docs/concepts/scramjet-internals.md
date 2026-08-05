# Inside Scramjet

Everything else on this site treats Scramjet as a dependency. This page treats
it as a codebase: what the packages are, where a given behaviour lives, how to
build it, and how to run its tests.

Read it if you are about to file a bug with a diagnosis attached, patch
something locally, or contribute upstream. If you are building a proxy, you do
not need any of this.

Verified against `MercuryWorkshop/scramjet` at 2.0.67-alpha.2. Upstream moves
fast, and when this page and the repository disagree, the repository wins.

---

## The repository

Scramjet is a pnpm workspace. Not npm, not bun: the root `package.json` runs
`only-allow pnpm` in `preinstall`, so the other two abort on install.

```bash
git clone https://github.com/MercuryWorkshop/scramjet
cd scramjet
pnpm install
cd packages/core && pnpm rewriter:build && pnpm build && cd ../..
pnpm dev
```

**`pnpm install` on its own is not enough, and `pnpm dev` will not run after
it.** `rspack.config.ts` reads `packages/core/dist/scramjet.wasm` while the
config itself is evaluating, and that file is not in the repository, so every
build and the dev server fail on a fresh clone until the rewriter has been built
once. That is the step above, and it needs the Rust toolchain described in the
next section.

`pnpm dev` starts the development server in `devserver.ts`: Vite for the demo
page, rspack in watch mode for the bundles, and a wisp-js server in the same
process, so one command gives you a working proxy pointed at your own build. It
prints the commit and branch it built from, which is worth quoting in a bug
report.

| Package                     | Publishes as                           | What lives there                   |
| --------------------------- | -------------------------------------- | ---------------------------------- |
| `packages/core`             | `@mercuryworkshop/scramjet`            | Rewriter, client, fetch pipeline   |
| `packages/controller`       | `@mercuryworkshop/scramjet-controller` | Window API, service worker, inject |
| `packages/utils`            | `@mercuryworkshop/scramjet-utils`      | The five shipped plugins           |
| `packages/rpc`              | `@mercuryworkshop/rpc`                 | The typed `postMessage` layer      |
| `packages/bootstrap`        | `@mercuryworkshop/proxy-bootstrap`     | The one-call wiring path           |
| `packages/create-proxy-app` | `create-proxy-app`                     | The upstream scaffolder            |
| `packages/demo`             | `@mercuryworkshop/scramjet-demo`       | The page `pnpm dev` serves         |
| `packages/runway`           | workspace only                         | The browser test harness           |

The three published runtime packages are versioned together and assert each
other's versions at load; see
[version guards](../reference/controller-api.md#version-guards).

---

## Where behaviour lives

The question this page exists to answer is "I am seeing X, which file do I
open".

| You are looking at                     | Open                                                 |
| -------------------------------------- | ---------------------------------------------------- |
| A flag, or what a flag defaults to     | `core/src/types.ts`, `core/src/index.ts`             |
| A URL that encoded wrong               | `core/src/shared/rewriters/url.ts`                   |
| A cookie that did not stick            | `core/src/shared/cookie.ts`                          |
| Headers added or stripped              | `core/src/shared/headers.ts`, `core/src/fetch/`      |
| A request that took the wrong path     | `core/src/fetch/fetch.ts`, `core/src/fetch/parse.ts` |
| A patched global misbehaving on a site | `core/src/client/`                                   |
| HTML that came out wrong               | `core/src/shared/htmlRules.ts`, the rewriter         |
| JavaScript that came out wrong         | `core/rewriter/` (Rust)                              |
| Something the service worker did       | `controller/src/sw.ts`                               |
| Something the page side did            | `controller/src/index.ts`                            |
| A proxied document's bootstrap         | `controller/src/inject.ts`                           |
| A shipped plugin                       | `utils/src/`                                         |

`core/src/shared/snapshot.ts` is the file that surprises people. Scramjet
captures native functions (`_URL`, `_Map`, `JSON_parse`, `Promise_all`) at load
and uses those captures everywhere, because a proxied page is free to replace
`URL` or `Array.prototype.map` with something hostile. Code that calls the live
global instead of the snapshot is a bug, and there is an ESLint rule
(`scramjet-core/no-globals`) that says so.

---

## The rewriter is Rust

The part that rewrites JavaScript is not JavaScript. `packages/core/rewriter/`
is a Cargo workspace built on [oxc](https://oxc.rs), compiled to
`wasm32-unknown-unknown` and shipped as `scramjet.wasm`.

| Crate            | Job                                              |
| ---------------- | ------------------------------------------------ |
| `transform`      | The rewrite rules over the oxc AST               |
| `js`             | The JavaScript-facing entry, wraps `transform`   |
| `native`         | A native build, for profiling and fast iteration |
| `wasm`           | The wasm build and `build.sh`                    |
| `coverage-macro` | Instrumentation for coverage runs                |

Building it needs four things, and `build.sh` checks for the last three before
it starts:

| Tool               | Why                                                                          |
| ------------------ | ---------------------------------------------------------------------------- |
| Rust **nightly**   | `rust-toolchain.toml` pins it, with `wasm32-unknown-unknown` and `rust-src`  |
| `wasm-bindgen-cli` | Exactly `0.2.105`. The script compares the version and refuses a mismatch    |
| `wasm-opt`         | From [binaryen](https://github.com/WebAssembly/binaryen)                     |
| `wasm-snip`        | The [r58playz fork](https://github.com/r58playz/wasm-snip), not the original |

`codespace-basic-setup.sh` in the repository root installs all four and then
runs the build, and is the fastest way to get a working environment.

```bash
cd packages/core/rewriter/wasm
bash build.sh          # debug build, with the `debug` feature on
RELEASE=1 bash build.sh
```

`build.sh` hashes every source file and skips the build when the hash matches
`out/.build-hash` and `dist/scramjet.wasm` exists. That cache is why an edit to
a `.rs` file sometimes appears to do nothing: touch nothing else and the hash
changes, but a checkout that restores an older file can hit a stale hit. Delete
`out/.build-hash` when in doubt.

**There is no Rust-free path through a source build.** Even a change confined to
the TypeScript needs the wasm on disk first, because the rspack config reads it
at evaluation time. Build the rewriter once, and after that you can stay in
JavaScript; `pnpm dev` rebuilds only the bundles.

---

## What gets built

`rspack.config.ts` at the root produces every artifact, and the same source file
is emitted several ways:

| Output                  | Format    | Wasm     | Global                |
| ----------------------- | --------- | -------- | --------------------- |
| `scramjet.js`           | IIFE      | separate | `$scramjet`           |
| `scramjet_bundled.js`   | IIFE      | inlined  | `$scramjet`           |
| `scramjet.mjs`          | ES module | separate | none                  |
| `scramjet_bundled.mjs`  | ES module | inlined  | none                  |
| `scramjet-external.mjs` | ES module | none     | reads `$scramjet`     |
| `controller.api.js`     | IIFE      | none     | `$scramjetController` |
| `controller.sw.js`      | IIFE      | none     | `$scramjetController` |
| `controller.inject.js`  | IIFE      | none     | `$scramjetController` |
| `scramjet-utils.js`     | IIFE      | none     | `$scramjetUtils`      |

`scramjet-external.mjs` is the one that causes the most confusion downstream. It
is generated by an rspack plugin, it is what npm's `main` points at, and its
entire body destructures `globalThis.$scramjet`. That is the file behind the
`Cannot destructure property 'BareResponse'` error; see
[reading Scramjet's exports](../reference/plugins-and-hooks.md#reading-scramjets-exports).

Version strings are injected at build time through `DefinePlugin`: `VERSION`,
`COMMITHASH`, and `BUILDDATE` become `versionInfo`, and the controller gets
`SCRAMJET_EXPECTED_VERSION` so it can assert the pair at load.

---

## Testing

`packages/runway` is the browser harness. It drives real Chromium through
Playwright against a real proxy, because nearly everything Scramjet does is only
observable in a browser.

```bash
cd packages/runway
pnpm test           # headless
pnpm test:headed    # watch it happen
pnpm test:coverage  # v8 coverage, mapped back through istanbul
pnpm inspect        # one page, left open, for poking at
```

The suites under `src/tests/` are worth knowing by name, because a good bug
report says which one your case belongs next to:

| Suite                                         | Covers                                          |
| --------------------------------------------- | ----------------------------------------------- |
| `sanity.ts`                                   | The proxy loads at all                          |
| `rewrites.ts`, `rewriter-css.ts`              | Rewriter output                                 |
| `cookies.ts`                                  | Jar behaviour end to end                        |
| `eval.ts`, `documentwrite.ts`                 | Dynamic code paths                              |
| `postmessage.ts`, `foreigncontext.ts`         | Cross-context messaging                         |
| `websockets.ts`                               | Tunnelled sockets                               |
| `referer.ts`, `incumbent.ts`, `linkheader.ts` | Header and origin semantics                     |
| `custom-schemes.ts`, `encoding.ts`            | URL handling                                    |
| `adversarial/`                                | Pages that actively try to escape               |
| `wpt/`                                        | Vendored Web Platform Tests                     |
| `regressions.ts`                              | Everything that broke once                      |
| `site/`                                       | Real sites, which fail for reasons of their own |

The harness serves two of its own targets (`harness/scramjet`, `harness/bare`)
so most tests do not depend on the public internet. `site/` does, and a failure
there is often the site changing rather than a regression; see
[site compatibility](../reference/site-compatibility.md).

There is also `pnpm test:package` at the root, an ava suite that validates the
published package layout. It catches "the tarball is missing a file", which is a
real and recurring class of break.

---

## Reporting something upstream

A report that gets fixed quickly has, roughly in order of value:

1. **The exact versions of all three packages** and `versionInfo.build`. Alpha
   version numbers move faster than they look; the commit hash is the fact.
2. **Which layer it is.** A URL that came out wrong is the rewriter; a request
   that never left is the fetch pipeline or the transport; a page that loaded
   and then broke is the client patches. The table above turns a symptom into a
   directory.
3. **A minimal page**, ideally one that fits in `runway/src/tests/`. A failing
   test case is the difference between a fix this week and a fix eventually.
4. **What the browser did**, not what you think it did: the failing request in
   the network tab, the console error with `captureErrors` on, and the rewritten
   source if the complaint is about rewriting. Turning on `rewriterLogs` and
   `debugSourceURL` makes that readable; see
   [getting the rewriter to tell you what it is doing](../reference/troubleshooting.md#getting-the-rewriter-to-tell-you-what-it-is-doing).

Scramjet is AGPL-3.0-only, and so is anything you build on it that users can
reach over a network. What that obliges you to publish is summarised in
[official docs and licensing](../reference/official-docs.md).

---

## Where to go next

- [Core API and types](../reference/core-api.md). The exported surface of the
  code described here.
- [Controller and Frame API](../reference/controller-api.md). The layer above
  it.
- [How a proxy works](how-proxies-work.md). The same system from the outside, if
  this page was the wrong end to start from.
