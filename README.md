# ProxDocs

Documentation and a modular generator for modern web proxies: Scramjet, Wisp,
Bare, and their transport layers.

Two things live here:

- **`docs/`**. An explanation of the whole stack, written to be read. Plain
  markdown, so it renders fine on GitHub, and there is a
  [site](https://docs.crllect.dev) that renders it with navigation and
  search-friendly structure.
- **`builder/`**. A generator that composes a working proxy from parts. Tick the
  features you want; the generated README gives the commands for your selected
  package manager.

Ask development questions or show your project in the **Night Network** Discord:
<https://discord.gg/algebra>. For more direct support, message me on discord:
`@crllect`

---

## Run the documentation site

```bash
bun install
bun start
```

The documentation is served at `/`, and the interactive builder is served at
`/build`, on the configured port.

The site renders the Markdown in `docs/`, so you can
[read the guides on GitHub](docs/index.md).

## Deploy the documentation

The site also builds to static files with the builder kept working, so it can be
hosted for people who would rather read it in a browser than on GitHub.

```bash
bun run build:site
```

That writes `dist/`: every page prerendered to `<slug>.html`, the search index,
and `site/public` copied to `/static`. It also writes
`functions/_generated/parts.js`, a frozen copy of `builder/parts/` that the
Cloudflare Functions import, since a Worker cannot read them off disk.

To preview the built site with its Functions exactly as Cloudflare runs them:

```bash
bun run preview:site
```

That fetches `wrangler` through `bunx` on first use rather than carrying it as a
dependency, since deploying from GitHub does not need it locally.

### Cloudflare Pages

Create a Pages project pointed at this repository and set:

| Setting             | Value                |
| ------------------- | -------------------- |
| Build command       | `bun run build:site` |
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
bun builder/cli.js --out ./my-proxy --preset minimal
cd my-proxy && bun install && bun start
```

### Presets

| Preset        | Frontend       | Toolchain                       | Server  | Transports           | Purpose                          |
| ------------- | -------------- | ------------------------------- | ------- | -------------------- | -------------------------------- |
| `minimal`     | Vanilla        | JavaScript, no build step       | Express | libcurl              | Smallest readable build          |
| `standard`    | Vanilla        | Bun, TypeScript, Vite, Tailwind | Fastify | libcurl, epoxy       | The recommended setup            |
| `everything`  | Vanilla        | Bun, TypeScript, Vite, Tailwind | Express | libcurl, epoxy, bare | Every optional feature           |
| `serverless`  | Vanilla        | JavaScript, no build step       | Express | bare                 | No WebSocket needed              |
| `react`       | React          | TypeScript, Vite                | Express | libcurl              | Hydrated React shell             |
| `astroPreact` | Astro + Preact | TypeScript, Astro               | Express | libcurl              | Static page with a Preact island |

Selecting more than one transport turns on runtime switching automatically.

Every preset uses Scramjet with manual wiring.

Or answer the questions yourself:

```bash
bun builder/cli.js --out ./my-proxy \
    --language ts --runtime bun --server express \
    --frontend react --bundler vite --styling tailwind \
    --transport libcurl,epoxy \
    --features browserControls,tabs,settings,transportSwitch,history,bookmarks
```

### Build options

| Question            | Options                                      |
| ------------------- | -------------------------------------------- |
| `--language`        | `ts`, `js`                                   |
| `--package-manager` | `npm`, `pnpm`, `yarn`, `bun`                 |
| `--runtime`         | `node`, `bun`                                |
| `--server`          | `express`, `fastify`                         |
| `--frontend`        | `vanilla`, `react`, `astro`                  |
| `--bundler`         | `vite`, `none`                               |
| `--styling`         | `plain`, `scss`, `tailwind`                  |
| `--transport`       | `libcurl`, `epoxy`, `bare` (comma separated) |
| `--features`        | Comma-separated feature identifiers below.   |

Two more flags exist but are not part of the normal path. `--wiring manual`
(default) or `bootstrap` picks how Scramjet's browser files are served; only
manual is offered in the web builder, and `bootstrap` cannot use the Bare
transport. See [wiring](docs/guides/wiring.md). `--host node` (default) or
`vercel` targets a serverless function, which forces the Bare transport.

| Feature identifier   | Adds                                                 |
| -------------------- | ---------------------------------------------------- |
| `browserControls`    | Back, forward, and reload controls                   |
| `tabs`               | Multiple isolated proxy sessions                     |
| `settings`           | Persisted proxy and search settings                  |
| `transportSwitch`    | Runtime transport selection                          |
| `history`            | Persisted browsing history                           |
| `bookmarks`          | Persisted bookmarks                                  |
| `cloak`              | Title, icon, and `about:blank` cloaking              |
| `quietServiceWorker` | Silence log/info/debug inside the service worker     |
| `aboutPages`         | Navigable custom-protocol pages inside the proxy tab |

Combinations that cannot work are corrected and explained rather than generated
broken. Framework frontends need a build step, and TypeScript needs one unless
you are happy shipping it uncompiled. Tailwind without a build step loads from
the Tailwind CDN. Fastify on Bun falls back to Express because `@fastify/static`
serves empty bodies there.

Serverless hosting forces the Bare transport, because functions cannot hold
Wisp's persistent WebSocket open. It works, and it is a reasonable choice if you
have no server and no budget. It costs you WebSocket sites and puts target TLS
on your server, and a proxy is almost pure egress while serverless bills egress
per GB, so the economics stop working as traffic grows. A static host can serve
the client instead, with Wisp on a cheap VPS.

Run `bun builder/cli.js --help` for the full list.

Pre-generated output for each preset is committed under [`examples/`](examples/)
if you would rather just read it.

---

## What the docs cover

**Concepts**: [how a proxy works](docs/concepts/how-proxies-work.md),
[proxy engines](docs/concepts/engines.md),
[wisp vs bare](docs/concepts/wisp-vs-bare.md),
[transports](docs/concepts/transports.md),
[bare-mux and proxy-transports](docs/concepts/bare-mux.md),
[cross-origin isolation](docs/concepts/cross-origin-isolation.md),
[inside Scramjet](docs/concepts/scramjet-internals.md).

**Guides**: [quickstart](docs/guides/quickstart.md),
[multiple tabs](docs/guides/multiple-tabs.md),
[settings](docs/guides/settings.md),
[URL parsing and history](docs/guides/url-parsing-and-history.md),
[custom protocols](docs/guides/custom-protocols.md),
[search engines](docs/guides/search-engines.md),
[bootstrap or manual wiring](docs/guides/wiring.md),
[serverless deployment](docs/guides/serverless.md),
[other frameworks](docs/guides/frameworks.md),
[deployment](docs/guides/deployment.md),
[practices worth knowing](docs/guides/site-best-practices.md).

**Reference**. [config and flags](docs/reference/scramjet-config.md),
[plugins and hooks](docs/reference/plugins-and-hooks.md),
[Controller and Frame API](docs/reference/controller-api.md),
[core API and types](docs/reference/core-api.md),
[known bugs](docs/reference/known-bugs.md),
[site compatibility](docs/reference/site-compatibility.md),
[version matrix](docs/reference/versions.md),
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

Tabs, settings, history, and bookmarks are written against that interface, so
they never touch the engine directly. Changing transports also changes
dependencies and server mounts; regenerate instead of editing only `engine.ts`.

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
examples/        pre-generated presets (regenerate with bun run examples)
scripts/check.js validates docs links and that every combination compiles
```

---

## Checks

```bash
bun run check
```

Verifies documentation files, links, Markdown rendering, URL classification,
generated JSON and JavaScript, client TypeScript semantics, template directives,
all 57 option combinations, and whether the committed examples match the
generator.

```bash
bun run examples
```

That command regenerates `examples/` from the presets.

---

## Versions

Package constraints live in [`builder/versions.js`](builder/versions.js),
verified against npm on **2026-08-04**. The two combinations that work:

```text
scramjet 2.0.67-alpha.2 + controller 0.0.14 + utils 0.0.3
libcurl ^2  epoxy ^3  bare-transport ^1   (proxy-transports generation)
```

There is an older bare-mux generation (libcurl ^1, epoxy ^2, bare-as-module3)
that Ultraviolet used. Mixing the two generations causes your proxy to shit
itself. See [the version matrix](docs/reference/versions.md).

Note that installing `@mercuryworkshop/scramjet` without a version gives you
**1.1.0**; 2.x is published under the `alpha` tag, not `latest`.

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
a PR. Run `bun run check` before submitting, and read
[CONTRIBUTING.md](CONTRIBUTING.md) for what a documentation change has to prove.

## License

This repository and its generated projects are AGPL-3.0-only. Several upstream
components are AGPL as well. Review `LICENSE` before distributing or deploying a
modified project; this is not legal advice.
