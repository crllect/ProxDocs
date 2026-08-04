# bare-mux and proxy-transports

If you have read any proxy tutorial from the last three years, you have seen
this line:

```js
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
await connection.setTransport("/libcurl/index.mjs", [{ wisp: wispUrl }]);
```

This page explains how it makes [transports](transports.md) swappable.

---

## The problem bare-mux solves

A proxied page makes requests from many places at once: the top-level document,
nested iframes, web workers, and the service worker itself. Every one of those
needs to reach the network.

Without coordination each context builds its own transport. That means:

- **Several TLS stacks in memory.** Each wasm instance is megabytes.
- **Several Wisp WebSockets** to your server, per user.
- **Split state.** Connection reuse, cookies, and settings do not line up
  between contexts.
- **Nothing to switch.** Changing transports would mean rebuilding it
  everywhere, in contexts you do not hold a reference to.

**bare-mux** ("bare multiplexer") fixes this by putting the transport in one
**SharedWorker** and giving every context a thin client that talks to it over a
`MessagePort`.

```text
   window          iframe          service worker
      │               │                   │
      └───────────────┴───────────────────┘
                      │  MessagePort
              ┌───────▼────────┐
              │  SharedWorker  │  ← one transport instance lives here
              └───────┬────────┘
                      │  one Wisp WebSocket
                  your server
```

The SharedWorker provides one transport instance and one place to switch it.

## What the two arguments mean

```js
await connection.setTransport("/libcurl/index.mjs", [{ wisp: wispUrl }]);
```

The first argument is a module path and the array contains constructor
arguments. The transport is constructed inside the SharedWorker, so it cannot
receive an instance created by the page.

That also explains a common confusion: the transport module gets fetched by the
worker, so the path must be one your **server** serves, not a bundler specifier.

---

## proxy-transports: the replacement

**`@mercuryworkshop/bare-mux` 2.1.9 carries a deprecation notice** pointing at
`@mercuryworkshop/proxy-transports`. Scramjet 2.x depends on proxy-transports
directly and does not use bare-mux at all.

The name change reflects a scope change:

- **bare-mux** was "swap out your _bare client_", the name is a fossil from when
  bare was the only option. It owned both the interface _and_ the SharedWorker
  multiplexing.
- **proxy-transports** is just the **interface**: the `ProxyTransport` type that
  [transports](transports.md) implement. Multiplexing is the engine's problem
  now.

In Scramjet 2.x the `Controller` owns the transport and distributes it to frames
and the service worker itself, over its own message channels. So you construct
the transport directly, in your own code, and hand it over:

```js
const { default: LibcurlClient } = await import("/libcurl/index.mjs");
const transport = new LibcurlClient({ wisp: wispUrl });

const controller = new Controller({ serviceworker, transport });
```

Later, when the user picks a different one:

```js
controller.setTransport(await buildTransport("epoxy", wispUrl));
```

This is simpler and easier to debug. The transport is a normal object in your
page, so you can inspect it, wrap it, or log through it.

It also means the lifetime is yours to manage. bare-mux kept one connection in a
SharedWorker no matter how often you called it; here, every `setTransport` is
another WebAssembly client and another socket, so
[only call it when the choice changed](transports.md).

---

## Which one do I use?

| You are using   | Use                                                                  |
| --------------- | -------------------------------------------------------------------- |
| Ultraviolet 3.x | **bare-mux.** UV has no other option; it is what UV 3.x is built on. |
| Scramjet 1.x    | **bare-mux.** Same generation.                                       |
| Scramjet 2.x    | **proxy-transports.** Already a dependency; do not add bare-mux.     |

Do not mix them. bare-mux-era transports (libcurl `^1`, epoxy `^2`) and
proxy-transports-era transports (libcurl `^2`, epoxy `^3`) are separate package
majors. See [Version matrix](../reference/versions.md).

The interfaces are close enough that mismatched versions sometimes appear to
work, which is worse than failing outright. Pin the pair that matches your
engine.

---

## Serving it

bare-mux is the one package here that still has a clean Node path helper:

```js
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

app.use("/baremux/", express.static(baremuxPath));
```

That directory contains `index.js` (the `BareMux` global for your page) and
`worker.js` (the SharedWorker). Both must be reachable at the paths you pass to
`BareMuxConnection`.

---

## Debugging

**"BareMux is not defined"**. `/baremux/index.js` is not loaded, or loaded after
your script. It is a classic script, not a module, so ordering in your HTML
matters.

**Requests hang with no error**. The SharedWorker probably failed to construct
the transport. SharedWorker errors do not appear in the page console; open
`chrome://inspect/#workers` (or Firefox's `about:debugging`) and inspect it
directly.

**Transport switch appears to do nothing**. `setTransport` resolves when the
worker has swapped it, but pages already loaded keep their existing connections.
Reload the frame to see the change.

**Safari**. SharedWorker support has historically been the shakiest here. If a
setup works everywhere but Safari, this is the first thing to check.
