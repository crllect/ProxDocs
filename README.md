# ProxDocs

Documentation and a modular generator for modern web proxies: Scramjet,
Ultraviolet, Wisp, Bare, and their transport layers.

Two things live here:

- **`docs/`**. An explanation of the whole stack, written to be read. Plain
  markdown, so it renders fine on GitHub, and there is a local site that renders
  it with navigation and search-friendly structure.
- **`builder/`**. A generator that composes a working proxy from parts. Pick an
  engine and tick the features you want; the generated README gives the commands
  for your selected package manager.

Ask development questions or show your project in the **Night Network** Discord:
<https://discord.gg/algebra>. For more direct support, message me on discord:
`@crllect`

---

## Run the documentation site

```bash
npm install
npm start
```

The documentation is served at `/`, and the interactive builder is served at
`/build`, on the configured port.

The site renders the Markdown in `docs/`, so you can
[read the guides on GitHub](docs/index.md).

## Deploy the documentation

The site also builds to static files with the builder kept working, so it can be
hosted for people who would rather read it in a browser than on GitHub.

```bash
npm run build:site
```

That writes `dist/`: every page prerendered to `<slug>.html`, the search index,
and `site/public` copied to `/static`. It also writes
`functions/_generated/parts.js`, a frozen copy of `builder/parts/` that the
Cloudflare Functions import, since a Worker cannot read them off disk.

To preview the built site with its Functions exactly as Cloudflare runs them:

```bash
npm run preview:site
```

That fetches `wrangler` through `npx` on first use rather than carrying it as a
dependency, since deploying from GitHub does not need it locally.

### Cloudflare Pages

Create a Pages project pointed at this repository and set:

| Setting             | Value                |
| ------------------- | -------------------- |
| Build command       | `npm run build:site` |
| Build output        | `dist`               |
| Compatibility flags | `nodejs_compat`      |

`wrangler.toml` already carries the output directory and the compatibility flag,
so a `wrangler pages deploy` picks them up without further arguments. The flag
is not optional: `/api/preview` and `/api/download` bundle `typescript` to emit
JavaScript builds, and it reaches for node builtins.

Pushes to `main` redeploy. Docs are served as static files; only the two builder
endpoints run as Functions, so reading the documentation costs no invocations.

## Generate a proxy

```bash
node builder/cli.js --out ./my-proxy --preset barebones
cd my-proxy && npm install && npm start
```

### Presets

| Preset        | Frontend       | Toolchain               | Engine                  | Purpose                          |
| ------------- | -------------- | ----------------------- | ----------------------- | -------------------------------- |
| `barebones`   | Vanilla        | JavaScript, no bundler  | Scramjet with bootstrap | Smallest readable build          |
| `standard`    | Vanilla        | TypeScript, Vite, SCSS  | Scramjet                | Most browser features            |
| `everything`  | Vanilla        | Bun, Vite, Tailwind CSS | Scramjet                | Every optional feature           |
| `staticHost`  | Vanilla        | JavaScript, no bundler  | Ultraviolet over Bare   | All-in-one Vercel deployment     |
| `react`       | React          | TypeScript, Vite        | Scramjet                | Hydrated React shell             |
| `astroPreact` | Astro + Preact | TypeScript, Astro       | Scramjet                | Static page with a Preact island |

Or answer the questions yourself:

```bash
node builder/cli.js --out ./my-proxy \
    --language ts --runtime bun --server express \
    --frontend react --bundler vite --styling tailwind \
    --engine scramjet --wiring manual --transport libcurl \
    --features browserControls,tabs,settings,transportSwitch,history,bookmarks
```

### Build options

| Question            | Options                                    |
| ------------------- | ------------------------------------------ |
| `--language`        | `ts`, `js`                                 |
| `--package-manager` | `npm`, `pnpm`, `yarn`, `bun`               |
| `--runtime`         | `node`, `bun`                              |
| `--server`          | `express`, `fastify`                       |
| `--frontend`        | `vanilla`, `react`, `astro`                |
| `--bundler`         | `vite`, `none`                             |
| `--styling`         | `plain`, `scss`, `tailwind`                |
| `--engine`          | `scramjet`, `ultraviolet`                  |
| `--wiring`          | `manual`, `bootstrap`                      |
| `--transport`       | `libcurl`, `epoxy`, `bare`                 |
| `--host`            | `node`, `vercel`                           |
| `--features`        | Comma-separated feature identifiers below. |

| Feature identifier | Adds                                                 |
| ------------------ | ---------------------------------------------------- |
| `browserControls`  | Back, forward, and reload controls                   |
| `tabs`             | Multiple isolated proxy sessions                     |
| `settings`         | Persisted proxy and search settings                  |
| `transportSwitch`  | Runtime transport selection                          |
| `history`          | Persisted browsing history                           |
| `bookmarks`        | Persisted bookmarks                                  |
| `cloak`            | Title, icon, and `about:blank` cloaking              |
| `aboutPages`       | Navigable custom-protocol pages inside the proxy tab |

Combinations that cannot work are corrected and explained rather than generated
broken. Framework frontends and TypeScript require a build step. The all-in-one
Vercel build uses Ultraviolet over Bare because Vercel Functions cannot host
Wisp's persistent WebSocket. A Scramjet client can be served by Vercel when Wisp
is hosted separately. Fastify on Bun falls back to Express because
`@fastify/static` serves empty bodies there.

Run `node builder/cli.js --help` for the full list.

Pre-generated output for each preset is committed under [`examples/`](examples/)
if you would rather just read it.

---

## What the docs cover

**Concepts**: [how a proxy works](docs/concepts/how-proxies-work.md),
[Scramjet vs Ultraviolet](docs/concepts/scramjet-vs-ultraviolet.md),
[wisp vs bare](docs/concepts/wisp-vs-bare.md),
[transports](docs/concepts/transports.md),
[bare-mux and proxy-transports](docs/concepts/bare-mux.md),
[cross-origin isolation](docs/concepts/cross-origin-isolation.md).

**Guides**: [quickstart](docs/guides/quickstart.md),
[multiple tabs](docs/guides/multiple-tabs.md),
[settings](docs/guides/settings.md),
[URL parsing and history](docs/guides/url-parsing-and-history.md),
[custom protocols](docs/guides/custom-protocols.md),
[search engines](docs/guides/search-engines.md),
[bootstrap or manual wiring](docs/guides/wiring.md),
[Ultraviolet on Vercel](docs/guides/ultraviolet-vercel.md),
[other frameworks](docs/guides/frameworks.md),
[deployment](docs/guides/deployment.md),
[practices worth knowing](docs/guides/site-best-practices.md).

**Reference**. [version matrix](docs/reference/versions.md),
[breaking changes](docs/reference/breaking-changes.md),
[troubleshooting](docs/reference/troubleshooting.md),
[official docs and licensing](docs/reference/official-docs.md),
[glossary](docs/reference/glossary.md).

---

## How the generator works

Every part under `builder/parts/` is a real, readable source file. The generator
strips the blocks you did not ask for and substitutes a few names, it does not
assemble code out of strings:

```js
//#if transportSwitch
const transportModules = {
	libcurl: "/libcurl/index.mjs",
	epoxy: "/epoxy/index.mjs"
};
//#else
const transportModules = { libcurl: "/libcurl/index.mjs" };
//#endif
```

So you can read `builder/parts/engine/scramjet.ts` directly and copy it by hand
if you never touch the builder.

The parts are written in TypeScript. Choosing JavaScript transpiles those parts
rather than maintaining a second implementation.

The generated client feature modules use a small interface implemented by
`engine.ts`:

```js
await engine.init();
const session = await engine.createSession(iframeElement, handlers);
await engine.setTransport({ kind, wisp });

session.go(url);
session.back();
session.forward();
session.reload();
session.destroy();
```

Tabs, settings, history, and bookmarks therefore work with either engine.
Changing engines also changes dependencies, server mounts, service-worker files,
and transport setup; regenerate instead of replacing only `engine.ts`.

### Layout

```text
docs/            markdown documentation, readable on GitHub
site/            the local docs site + builder UI (Node, no build step)
builder/
  options.js     what can be configured, and which combinations are legal
  versions.js    package constraints, with the date they were verified
  template.js    the //#if directive processor
  parts/         real source files that get composed
  cli.js         Node entry point for generated projects
examples/        pre-generated presets (regenerate with npm run examples)
scripts/check.js validates docs links and that every combination compiles
```

---

## Checks

```bash
npm run check
```

Verifies documentation files, links, Markdown rendering, URL classification,
generated JSON and JavaScript, client TypeScript semantics, template directives,
all 54 option combinations, and whether the committed examples match the
generator.

```bash
npm run examples
```

That command regenerates `examples/` from the presets.

---

## Versions

Package constraints live in [`builder/versions.js`](builder/versions.js),
verified against npm on **2026-08-02**. The two combinations that work:

```text
Scramjet 2.x    scramjet 2.0.67-alpha.2 + controller 0.0.14 + utils 0.0.3
                libcurl ^2  epoxy ^3   (proxy-transports generation)

Ultraviolet 3.x ultraviolet ^3.2.10 + bare-mux ^2.1.9
                libcurl ^1  epoxy ^2   (bare-mux generation)
```

Mixing the transport generations is the most common cause of a proxy that
installs cleanly and then does nothing. See
[the version matrix](docs/reference/versions.md).

Note that `npm install @mercuryworkshop/scramjet` gives you **1.1.0**, 2.x is
published under the `alpha` tag, not `latest`.

---

## Credits

**Night Network**, where I personally help in building really cool stuff.
<https://discord.gg/algebra>

**Mercury Workshop** for Scramjet, wisp, epoxy and the transport layer.

**TitaniumNetwork** for Ultraviolet, which I would argue is the catalyst for the
entire proxy community.

## Contributing

Corrections are the most valuable contribution. If something here is wrong, out
of date, or describes a fork's behavior as if it were upstream, open an issue or
a PR. Run `npm run check` before submitting.

## License

This repository and its generated projects are AGPL-3.0-only. Several upstream
components are AGPL as well. Review `LICENSE` before distributing or deploying a
modified project; this is not legal advice.
