# Building a web proxy

This is documentation for building an interception-based web proxy with
**Scramjet**. Plus a generator that hands you a working project configured the
way you want it.

It fills the gap between short setup READMEs and reading every upstream package.

Two ways to use this:

**You want a working proxy now.** Go to [Quickstart](guides/quickstart.md), or
open the builder at `/build` after starting this repository. The downloaded
project README gives the commands for your selected package manager.

**You want to understand the stack.** Start with
[How a proxy works](concepts/how-proxies-work.md) and read the Concepts section
in order. It builds up from the two jobs a proxy performs to why the current
architecture looks the way it does.

---

## The one thing to understand first

A proxy has two independent jobs, and nearly every confusing question comes from
conflating them:

1. **Fetching** bytes from a server the browser will not let you reach directly.
2. **Rewriting** those bytes so every URL, script, and cookie inside them points
   back through the proxy.

**Wisp, Bare, epoxy, and libcurl** solve problem 1.

**Scramjet** solves problem 2. It is the [engine](concepts/engines.md).

They are chosen independently. "Should I use Scramjet or wisp?" is not a
question. You use Scramjet _over_ wisp.

---

## What to read

### Concepts

| Page                                                         | What it answers                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| [How a proxy works](concepts/how-proxies-work.md)            | The four layers, and one request traced end to end           |
| [Proxy engines](concepts/engines.md)                         | What the rewriter does, and why this site documents Scramjet |
| [Wisp vs Bare](concepts/wisp-vs-bare.md)                     | The two tunnel protocols, and why wisp won                   |
| [Transports](concepts/transports.md)                         | epoxy, libcurl, bare. What they are and how to choose        |
| [bare-mux and proxy-transports](concepts/bare-mux.md)        | What bare-mux is, and what replaced it                       |
| [Cross-origin isolation](concepts/cross-origin-isolation.md) | Why Scramjet needs COOP/COEP and what breaks without them    |

### Guides

| Page                                                         | What you build                                           |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| [Quickstart](guides/quickstart.md)                           | A working proxy in about two minutes                     |
| [Multiple tabs](guides/multiple-tabs.md)                     | Real tabs that keep their pages alive                    |
| [Settings](guides/settings.md)                               | Validated, persisted settings that cannot brick your app |
| [URL parsing and history](guides/url-parsing-and-history.md) | An address bar that behaves like a browser's             |
| [Custom protocols](guides/custom-protocols.md)               | Internal pages on your own scheme                        |
| [Cookies and sessions](guides/cookies-and-sessions.md)       | Where logins live, and the three ways they break         |
| [Search engines](guides/search-engines.md)                   | Which ones survive a proxy, and which only work in dev   |
| [Wiring Scramjet](guides/wiring.md)                          | Serving the engine, its service worker, and Wisp         |
| [Serverless deployment](guides/serverless.md)                | An all-in-one deployment over Bare, and what it costs    |
| [Framework integrations](guides/frameworks.md)               | React, Astro, Fastify, Vite, Next.js, SvelteKit, Bun     |
| [Deployment](guides/deployment.md)                           | Hosting, HTTPS, and platform limits                      |
| [Running a proxy](guides/running-a-proxy.md)                 | Bandwidth, blocking, abuse, and logging, after launch    |
| [Practices worth knowing](guides/site-best-practices.md)     | Shared storage, performance, accessibility               |

### Reference

| Page                                                  | What it answers                                    |
| ----------------------------------------------------- | -------------------------------------------------- |
| [Config and flags](reference/scramjet-config.md)      | Every Scramjet option, what it does, what breaks   |
| [Plugins and hooks](reference/plugins-and-hooks.md)   | The extension surface, and how to write against it |
| [Site compatibility](reference/site-compatibility.md) | Why a given site fails, and whether you can fix it |

[Version matrix](reference/versions.md) ·
[Breaking changes](reference/breaking-changes.md) ·
[Troubleshooting](reference/troubleshooting.md) ·
[Official docs and licensing](reference/official-docs.md) ·
[Glossary](reference/glossary.md)

---

## The builder

The builder at `/build` composes a project from parts. Every part is a real file
in `builder/parts/`, readable on its own. The generator only strips the blocks
you did not ask for and fills in a few names.

It asks about the stack:

| Question         | Options                           |
| ---------------- | --------------------------------- |
| Language         | TypeScript or JavaScript          |
| Package manager  | npm, pnpm, yarn, bun              |
| Runtime          | Node or Bun                       |
| Server framework | Express or Fastify                |
| Frontend         | Vanilla, React, or Astro + Preact |
| Build step       | Vite, or none at all              |
| Styling          | Plain CSS, SCSS, or Tailwind      |
| Transports       | libcurl, epoxy, bare, or any mix  |

It also asks about the features:

- **Browser controls:** back, forward, and reload wired to the frame's history
- **Multiple tabs:** one proxy session per tab, kept alive in the background
- **Settings:** validated and persisted, shown in a popup unless custom
  protocols are enabled
- **Transport switching:** any transport you shipped, at runtime, plus a custom
  Wisp server
- **History:** a visit log, separate from per-tab back and forward
- **Bookmarks and history menus:** popup overlays or navigable custom protocol
  pages
- **Cloaking and custom protocol pages**
- **Quiet service worker:** silence log, info and debug inside the worker

Choices that cannot work together are greyed out with the reason, rather than
letting you pick them and quietly changing them afterwards. Picking an
all-in-one serverless host selects the Bare transport, because those hosts
cannot hold Wisp's WebSocket open; a static frontend may instead point at Wisp
hosted elsewhere. See [Serverless deployment](guides/serverless.md).

Or from the terminal:

```bash
node builder/cli.js --out ./my-proxy --preset standard

node builder/cli.js --out ./my-proxy \
    --language ts --runtime bun --server express \
    --bundler vite --styling tailwind \
    --features browserControls,tabs,settings,history
```

Generated projects are structured so that `engine.ts` is the only file that
talks to the proxy engine. Everything else, tabs, settings, history, is written
against a small interface, so swapping transports or upgrading the engine does
not touch your feature code.

The generated UI is a compact dark interface with a monospace typeface and plain
controls. It works on narrow screens and is intended to be easy to edit.

---

## Running this documentation locally

```bash
npm install
npm start
```

The documentation opens at `/` on the configured port. The guides render from
the same Markdown files that GitHub displays; the interactive builder is
local-site functionality.

---

## Limits

- URL codecs are **obfuscation, not encryption**. The key is in the client
  bundle.
- `about:blank` cloaking hides a URL from someone looking at your screen. It
  adds no network privacy. What an observer sees depends on whether the proxy
  uses Wisp or Bare; a managed-browser extension can still inspect the page.
- Serverless hosting forces the Bare transport, which means your server
  terminates target TLS and WebSocket sites stop working. It is free to start
  and fine at small scale, but every proxied byte is billed egress, so it stops
  adding up as traffic grows. A static frontend pointed at Wisp on a cheap VPS
  avoids all of it.
- The published Scramjet docs currently describe the 1.x API while the
  repository has moved on. [Breaking changes](reference/breaking-changes.md)
  tracks the difference.
- This repository and generated projects use AGPL-3.0-only. See
  [licensing](reference/official-docs.md) for upstream links and the license
  notice.

If something here is wrong or out of date, open an issue or a PR.

Questions are best asked in the **Night Network** Discord,
<https://discord.gg/algebra>, which is also where a lot of this ecosystem gets
built.
