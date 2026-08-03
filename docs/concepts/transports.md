# Transports

A **transport** is the client-side code that performs a request. The rewriter
hands it "GET `https://crllect.dev/`, with these headers" and expects a response
back. How it gets one is the transport's business.

That indirection is the point: the rewriter does not care whether the bytes came
over wisp, over bare, or from somewhere else entirely.

---

## The interface

Every transport implements the same small interface, defined by
[`@mercuryworkshop/proxy-transports`](bare-mux.md):

```ts
interface ProxyTransport {
	ready: boolean;
	init(): Promise<void>;

	request(
		remote: URL,
		method: string,
		body: BodyInit | null,
		headers: RawHeaders,
		signal: AbortSignal | undefined
	): Promise<TransferrableResponse>;

	connect(
		url: URL,
		protocols: string[],
		requestHeaders: RawHeaders,
		onopen: (protocol: string, extensions: string) => void,
		onmessage: (data: Blob | ArrayBuffer | string) => void,
		onclose: (code: number, reason: string) => void,
		onerror: (error: string) => void
	): [send: Function, close: Function];
}
```

Two methods: one for HTTP, one for WebSockets. If you can implement those, you
can write a transport, and every proxy engine that speaks this interface will
work with it.

---

## The three that exist

### libcurl

**[libcurl.js](https://github.com/ading2210/libcurl.js)**, a build of curl
compiled to WebAssembly, running in your browser, with its network layer wired
to [wisp](wisp-vs-bare.md).

It is curl. That means decades of accumulated correctness about HTTP: redirect
edge cases, chunked encoding, content negotiation, cookie handling, HTTP/2,
weird server behaviour that only shows up on real sites.

- **Broad protocol compatibility.** It includes curl's handling for redirects,
  content negotiation, and unusual HTTP behavior.
- **Heaviest.** It is curl plus Mbed TLS in WebAssembly; the initial load is
  noticeable.
- Supports an upstream HTTP proxy via a `proxy` option, which epoxy does not.

```js
const { default: LibcurlClient } = await import("/libcurl/index.mjs");
const transport = new LibcurlClient({ wisp: "wss://proxy.crllect.dev/wisp/" });
```

### epoxy

**[epoxy-tls](https://github.com/MercuryWorkshop/epoxy-tls)**, a TLS and HTTP
stack written in Rust, compiled to WebAssembly, also over wisp.

Purpose-built rather than ported, so it is smaller and starts faster. The
tradeoff is that it has seen less of the internet's weirdness than curl has, so
occasionally a site works under libcurl and not epoxy.

- **Lighter and faster to initialise.**
- Slightly pickier on unusual servers.
- Exposes wisp-level tuning (`wisp_v2`, buffer sizes, redirect limits).

```js
const { default: EpoxyTransport } = await import("/epoxy/index.mjs");
const transport = new EpoxyTransport({ wisp: "wss://proxy.crllect.dev/wisp/" });
```

### bare-as-module3

The original: it talks to a [Bare server](wisp-vs-bare.md) over plain HTTP. No
WebAssembly, no WebSocket, and no client TLS stack.

- **The all-in-one option on request/response hosts.**
- Tiny, no startup cost.
- Your server sees all traffic in plaintext.
- Only works with Ultraviolet. Scramjet has no bare transport, the bootstrap
  package has a stub that throws.

```js
await connection.setTransport("/baremod/index.mjs", [
	new URL("/bare/", location.href).href
]);
```

---

## Choosing

```text
Deploying all components to Vercel or Netlify Functions?
├── Yes → bare, with Ultraviolet. No other option.
└── No  → wisp. Then:
          ├── Default to libcurl. Best compatibility.
          └── Offer epoxy as a user-switchable alternative.
```

Shipping **both** Wisp transports gives users a fallback when a site behaves
differently between their HTTP/TLS implementations. That is why
[transport switching](../guides/settings.md) is a feature in the builder.

---

## Version compatibility

This trips people up constantly. There are **two generations** of the transport
packages, and they are not interchangeable:

| Engine          | Transport interface | epoxy | libcurl |
| --------------- | ------------------- | ----- | ------- |
| Ultraviolet 3.x | bare-mux            | `^2`  | `^1`    |
| Scramjet 2.x    | proxy-transports    | `^3`  | `^2`    |

The new majors also **removed the Node-side path helpers**:

```js
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
```

Those imports work with libcurl 1.x and epoxy 2.x, but throw with libcurl 2.x
and epoxy 3.x.

With the newer packages you resolve the directory yourself:

```js
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const libcurlDist = path.dirname(
	require.resolve("@mercuryworkshop/libcurl-transport")
);

app.use("/libcurl/", express.static(libcurlDist));
```

See [Version matrix](../reference/versions.md) and
[Breaking changes](../reference/breaking-changes.md).

---

## Two module formats

Both transports ship as UMD (`dist/index.js`, attaching
`window.LibcurlTransport` / `window.EpoxyTransport`) and as ESM
(`dist/index.mjs`, with a default export).

Prefer the ESM build with dynamic `import()`. It is unambiguous, and it means a
transport is only downloaded when selected:

```js
const transportModules = {
	libcurl: "/libcurl/index.mjs",
	epoxy: "/epoxy/index.mjs"
};

const buildTransport = async (kind, wispUrl) => {
	const { default: Transport } = await import(transportModules[kind]);
	return new Transport({ wisp: wispUrl });
};
```

---

## Switching at runtime

With Scramjet 2.x, hand the controller a new instance:

```js
controller.setTransport(await buildTransport("epoxy", wispUrl));
```

Existing frames keep their DOM and their loaded pages; their _next_ request goes
over the new transport. To have the current page re-fetched, reload it.

With Ultraviolet and bare-mux, you name the module instead, bare-mux loads it
inside its SharedWorker so every tab and the service worker share one
connection:

```js
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
await connection.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
```

> **Bootstrap cannot do this.** `@mercuryworkshop/proxy-bootstrap` fixes the
> transport at server start and only serves that one client, so runtime
> switching is unavailable. Use manual wiring if you want it, the builder
> enforces this for you.

---

## Writing your own

Implement `request` and `connect`. Common reasons for a custom transport are:

- Routing through infrastructure you already have.
- A different tunnel protocol.
- Instrumentation. Logging, metrics, request rewriting.

Before you start: the hard part of a transport is not the interface, it is HTTP
correctness. Redirects, chunked encoding, and header edge cases are where naive
implementations break on real sites. libcurl exists precisely because that is a
lot of work.
