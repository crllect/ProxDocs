# Proxy engines

An **engine** is the part that rewrites the web. It takes HTML, CSS and
JavaScript on the way back from a site and edits it so every URL and every
trapped global points back through your proxy instead of out to the real
internet. Everything else in the stack, the transport, the service worker, your
UI, exists to feed the engine or to display what it produces.

This site documents **Scramjet**, and the builder generates Scramjet projects
only. This page explains why, and what the other names you will run into
actually were, so that reading someone else's proxy does not leave you guessing.

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
_expressions_ that produce URLs at runtime. To handle them an engine must:

1. Parse the JavaScript into a syntax tree.
2. Find every reference to a trapped global. `location`, `fetch`, `parent`,
   `document.cookie`, `Worker`, `XMLHttpRequest`, `WebSocket`, `import()`.
3. Rewrite them to go through the proxy's shims.
4. Emit valid JavaScript, preserving semantics exactly.
5. Do all of that fast enough that pages do not visibly stall.

Step 5 is where engines have historically diverged. **Every large site ships
megabytes of JavaScript**, and all of it goes through this on every load.

---

## Scramjet

The current generation, from Mercury Workshop. Its rewriter is written in **Rust
and compiled to WebAssembly**, which is what lets it do the work above at a
speed a JavaScript rewriter cannot match on large bundles.

What you get beyond the rewriter:

- **Frames.** `controller.createFrame(element, { plugins })`, each with its own
  URL prefix, which is what makes [multiple tabs](../guides/multiple-tabs.md)
  cheap.
- **Plugins and hooks.** Tap into page init, request errors, and navigation.
  This is how you get URL-change events, HTTP caching, and custom error pages
  without hacking around the engine. The fetch hooks can also answer a request
  locally instead of sending it, which lets a plugin serve an entire origin that
  has no server behind it. See
  [fake origins](../guides/custom-protocols.md#fake-origins-and-why-internal-pages-do-not-use-them).
- **Cookie handling** synchronised across frames and persisted in IndexedDB.
- **Escaped-link interception**, so `window.open` and `target="_blank"` stay
  inside your proxy.

It runs over [Wisp](wisp-vs-bare.md) by default, and over
[Bare](wisp-vs-bare.md) when your host cannot hold a WebSocket open. See
[Serverless deployment](../guides/serverless.md).

The costs, stated plainly: the rewriter wasm is **203 KB gzipped** on top of an
88 KB bundle, so roughly 291 KB before your own code. And 2.x ships under the
`alpha` dist-tag, with an API that has changed between patch releases. Pin your
versions. See [the version matrix](../reference/versions.md).

---

## The engines you will see referenced

You will run into these in other people's code, in old guides, and in Discord
answers. None of them are documented here as a path to build on, and the builder
will not generate them. This is only so you can recognise what you are looking
at.

### Ultraviolet

TitaniumNetwork's engine, and the one every proxy ran before Scramjet. A
JavaScript rewriter using `meriyah` to parse and `astring` to generate.

**It is dead.** Last release 3.2.10 in October 2024, README pointing at Scramjet
as its successor, and an ecosystem that has largely moved on and would like the
copy-pasted UV forks to stop appearing. Its one remaining virtue is being about
**126 KB gzipped** against Scramjet's 291 KB, which is not a good enough reason
to build on an engine nobody is fixing.

You are here because you know UV and want to know what the Scramjet equivalent
is. Roughly:

| Ultraviolet                                   | Scramjet 2.x                                         |
| --------------------------------------------- | ---------------------------------------------------- |
| `__uv$config` global                          | `config` and `scramjetConfig` passed to `Controller` |
| `__uv$config.prefix`, one global              | `frame.prefix`, one per frame                        |
| `Ultraviolet.codec.xor`                       | `config.codec`, `encodeURIComponent` by default      |
| `iframe.src = prefix + encodeUrl(url)`        | `frame.go(url)`                                      |
| Poll `contentWindow.location` for the URL     | `UrlWatcherPlugin`                                   |
| No hooks; fork the engine                     | `frame.hooks.*` and plugins                          |
| One shared iframe namespace                   | A `Frame` per tab, routed independently              |
| bare-mux, `connection.setTransport(path, [])` | `controller.setTransport(new Transport({ wisp }))`   |
| `__uv$config.bare`                            | Nothing. It was already dead weight in UV 3.x        |

The short version: everything UV made you build by hand, Scramjet has an API
for. Start at [wiring](../guides/wiring.md), then
[plugins and hooks](../reference/plugins-and-hooks.md).

Version-specific gotchas, if you are reading old UV code, are in
[breaking changes](../reference/breaking-changes.md).

### Rammerhead

A different design entirely: server-side and session-based rather than
service-worker-based. It rewrites on the server and keeps per-session state
there. Occasionally works on sites where interception proxies do not, and fails
on things they handle easily. Worth knowing it exists; not comparable
feature-for-feature.

### Chemical

Not an engine. A meta-framework that wraps Ultraviolet, Scramjet and Rammerhead
behind one API. It is the fastest way to get something running if you do not
care what is underneath, which is precisely the opposite of what this site is
for. If you want to understand your own proxy, do not start here.

---

## Where to go next

- [How a proxy works](how-proxies-work.md). The four layers and one request
  traced through all of them.
- [Transports](transports.md). The other half of the stack, chosen independently
  of the engine.
- [Wiring Scramjet](../guides/wiring.md). Actually serving it.
- [Config and flags](../reference/scramjet-config.md). Everything you can change
  about the rewriter.
