# Scramjet vs Ultraviolet

Short version: **use Scramjet**. For an all-in-one deployment whose backend
cannot hold a WebSocket open, use Ultraviolet over Bare instead.

Scramjet supports more current sites, while Ultraviolet supports a serverless
Bare deployment. Hosting constraints determine which tradeoff is available.

---

## They solve the same problem differently

Both are interception proxies: a service worker on your origin catches requests
from a proxied page and rewrites the response so the page stays inside the
proxy. See [How a proxy works](how-proxies-work.md).

The main implementation difference is how they rewrite JavaScript.

---

## Why rewriting JavaScript is the hard part

Rewriting HTML is easy. `<a href="/foo">` becomes
`<a href="/prefix/https%3A%2F%2Fcrllect.dev%2Ffoo">`, and you are done.

JavaScript is not like that. Consider:

```js
location.href = "/dashboard";
const res = await fetch("/api/" + userId);
window.parent.postMessage(data, "https://crllect.dev");
new Worker("/worker.js");
document.cookie = "session=abc";
```

None of these are URLs in the source you can find and replace. They are
_expressions_ that produce URLs at runtime. To handle them you must:

1. Parse the JavaScript into a syntax tree.
2. Find every reference to a trapped global. `location`, `fetch`, `parent`,
   `document.cookie`, `Worker`, `XMLHttpRequest`, `WebSocket`, `import()`.
3. Rewrite them to go through the proxy's shims.
4. Emit valid JavaScript, preserving semantics exactly.
5. Do all of that fast enough that pages do not visibly stall.

Step 5 is where the engines diverge. **Every large site ships megabytes of
JavaScript**, and all of it goes through this on every load.

### Ultraviolet's approach

A JavaScript rewriter using `meriyah` to parse and `astring` to generate code.
Response rewriting usually runs in the service worker rather than on the page's
main thread.

Large bundles still require more JavaScript work, and some syntax and semantic
edge cases are not handled. Test the sites you need on both engines.

### Scramjet's approach

The rewriter is written in **Rust and compiled to WebAssembly**. Scramjet traps
more globals and handles more current syntax and runtime cases than the archived
Ultraviolet release.

Ultraviolet's README points at Scramjet as its successor.

---

## What Scramjet gives you beyond the rewriter

**A larger client API.** Ultraviolet primarily gives the client an encoded URL
to assign to `iframe.src`. Navigation tracking, error pages, and caching need
separate code.

Scramjet 2.x has:

-   **Frames.** `controller.createFrame(element, { plugins })`, each with its
    own URL prefix for [multiple tabs](../guides/multiple-tabs.md).
-   **Plugins and hooks.** Tap into page init, request errors, and navigation.
    This is how you get URL-change events, HTTP caching, and custom error pages
    without hacking around the engine. The fetch hooks can also answer a request
    locally instead of sending it, which lets a plugin serve an entire origin
    that has no server behind it. See
    [fake origins](../guides/custom-protocols.md#fake-origins-and-why-internal-pages-do-not-use-them).
-   **Cookie handling** synchronised across frames and persisted in IndexedDB.
-   **Escaped-link interception**, so `window.open` and `target="_blank"` stay
    inside your proxy.

With Ultraviolet you reimplement each of these. The generated Ultraviolet
adapter in this repo polls `iframe.contentWindow.location` on a timer to detect
navigation, because there is no event to listen to. It works; it is not nice.

---

## What Ultraviolet still has

**It supports an all-in-one request/response deployment.** Ultraviolet can use
Bare without Wisp.

Scramjet requires:

-   `SharedArrayBuffer`, therefore
    [cross-origin isolation](cross-origin-isolation.md), therefore COOP/COEP
    headers on every response and HTTPS.
-   [Wisp](wisp-vs-bare.md), therefore a persistent WebSocket, therefore a host
    that can hold one open.

Ultraviolet requires none of that. Its rewriter is plain JavaScript, so no
`SharedArrayBuffer` and no isolation headers. And because it can use a
[bare](wisp-vs-bare.md) transport over ordinary HTTP, an all-in-one build can
deploy to request/response platforms such as Vercel Functions. Vercel can still
serve a Scramjet client when Wisp is hosted separately.

Ultraviolet over Bare avoids the rewriter WebAssembly and client TLS stack.
Ultraviolet over libcurl or epoxy still downloads a WebAssembly TLS stack.

---

## The comparison

|                              | Scramjet 2.x               | Ultraviolet 3.x                        |
| ---------------------------- | -------------------------- | -------------------------------------- |
| Rewriter                     | Rust → WebAssembly         | JavaScript                             |
| Site compatibility           | Handles more current sites | Breaks on more current sites           |
| Rewriter runtime             | WebAssembly                | JavaScript                             |
| Client API                   | Frames, plugins, hooks     | Set `iframe.src`                       |
| URL change events            | `UrlWatcherPlugin`         | None; poll for it                      |
| Per-frame isolation          | Yes, own prefix per frame  | No, one shared prefix                  |
| Requires `SharedArrayBuffer` | Yes                        | No                                     |
| Requires COOP/COEP           | Yes                        | No                                     |
| Requires HTTPS               | Yes (service worker)       | Yes (service worker)                   |
| Requires WebSockets          | Yes (Wisp only)            | No (Bare works)                        |
| All-in-one on Vercel         | **No**                     | **Yes**, over Bare                     |
| Initial download             | Rewriter wasm + TLS stack  | Lighter over Bare; TLS stack over Wisp |
| Maintained                   | Yes, actively              | **No**, archived Oct 2024              |

---

## Choosing

```text
Can your host hold a WebSocket open?
│
├── Yes  → Scramjet. Better rewriting, better API, still maintained.
│
└── No   → Can you move hosts?
           │
           ├── Yes → Move to a long-running Node host or VPS.
           │
           └── No  → Ultraviolet over bare.
                     Accept: worse compatibility, no WebSocket sites, and your
                     server can inspect target request and response data.
```

If an all-in-one serverless deployment is not required, a long-running Node host
supports the maintained engine and WebSocket sites.
[Deployment](../guides/deployment.md) covers the options.

---

## On Ultraviolet being archived

Archived does not mean broken. UV 3.2.10 works today, is deployed on a large
number of live sites, and will keep working as long as browsers do not change
underneath it.

What it means is:

-   **No fixes.** When a site changes something UV's rewriter gets wrong, it
    stays wrong.
-   **No security patches.** Consider that carefully if you run a public site.
-   **No new browser support.** If a future browser change breaks it, that is
    permanent.

Building something new on Ultraviolet is a reasonable choice for an all-in-one
serverless constraint. If you can host Wisp separately, that constraint does not
require Ultraviolet.

---

## Can I support both?

The generator can produce either engine. Its client feature modules use a small
interface implemented by an engine adapter:

```js
await engine.init();
const session = await engine.createSession(iframeElement, handlers);
await engine.setTransport(config);

session.go(url);
session.back();
session.forward();
session.reload();
session.destroy();
```

Tabs, history, settings, and bookmarks are written against that interface, so
their code works with either adapter. Changing engines also requires the
matching dependencies, server mounts, service worker, classic scripts, and
transport generation; regenerate the project rather than replacing one file.

Because Ultraviolet has no navigation events, the shared interface reports URL
changes on a 250 ms poll rather than instantly. Abstractions over uneven
capabilities always cost something; here the cost is small and worth it.
