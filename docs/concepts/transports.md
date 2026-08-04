# Transports

A **transport** is the client-side code that performs a request. The
[rewriter](how-proxies-work.md) hands it "GET `https://crllect.dev/`, with these
headers" and expects a response back. How it gets one is the transport's
business.

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

### bare

The original: it talks to a [Bare server](wisp-vs-bare.md) over plain HTTP. No
WebAssembly, no WebSocket, and no client TLS stack.

- **The all-in-one option on request/response hosts.**
- Tiny, no startup cost.
- Your server sees all traffic in plaintext.

**Get the package name right.** The one you want is
`@mercuryworkshop/bare-transport`. There is an older
`@mercuryworkshop/bare-as-module3`, still on npm, which implements the bare-mux
interface instead and which Scramjet cannot use. Same project, renamed, and the
version numbers make it worse: the live one is `1.0.0` and the dead one is
`2.2.5`, so the wrong answer looks newer.

`proxy-bootstrap` cannot wire it either; it ships a stub that throws
`"Bare transport not implemented yet"`. Bare builds use
[manual wiring](../guides/wiring.md).

The constructor takes the Bare server URL directly, not a `{ wisp }` object like
the other two:

```js
const { default: BareClient } = await import("/baremod/index.mjs");
const transport = new BareClient(new URL("/bare/", location.href).href);
```

---

## Choosing

```text
Deploying everything to a serverless function?
├── Yes → bare, and read the tradeoffs first. It is the only one that
│         works without a WebSocket, and it costs you WebSocket sites
│         plus TLS terminating on your server.
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

| Interface          | Used by                  | epoxy | libcurl |
| ------------------ | ------------------------ | ----- | ------- |
| `proxy-transports` | Scramjet 2.x, use these  | `^3`  | `^2`    |
| `bare-mux`         | Ultraviolet 3.x, and old | `^2`  | `^1`    |

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

> Older proxies did this through **bare-mux**, which held one transport in a
> SharedWorker and named modules by path rather than passing objects. If you are
> reading code that calls `connection.setTransport("/epoxy/index.mjs", [...])`,
> that is what you are looking at. See
> [bare-mux and proxy-transports](bare-mux.md).

> **Bootstrap cannot do this.** `@mercuryworkshop/proxy-bootstrap` fixes the
> transport at server start and only serves that one client, so runtime
> switching is unavailable. Use manual wiring if you want it, the builder
> enforces this for you.

### Switch only when the choice actually changed

Every `setTransport` call costs a transport. A new `LibcurlClient` is a fresh
curl-in-WebAssembly instance that opens its own wisp connection; the one it
replaces stays alive until it is garbage collected. Do that on each navigation,
or from a settings listener that fires for every field, and a browser that looks
idle is holding several WebAssembly clients and several sockets open.

The fix is to make the swap idempotent inside the engine rather than filtering
at each call site. Resolve the config to the values the transport is actually
built from, compare against the last applied set, and return early when nothing
moved:

```js
let activeTransport = "";

const resolveTransport = config => ({
	path: transportModules[config.kind] ?? transportModules.libcurl,
	wisp: config.wisp || defaultWispUrl()
});

const buildTransport = async config => {
	const { path, wisp } = resolveTransport(config);
	const { default: Transport } = await import(path);
	activeTransport = JSON.stringify([path, wisp]);
	return new Transport({ wisp });
};

const applyTransport = async config => {
	const { path, wisp } = resolveTransport(config);
	if (JSON.stringify([path, wisp]) === activeTransport) return;
	controller.setTransport(await buildTransport(config));
};
```

Compare the resolved values, not the raw config. A blank `wisp` setting and an
explicit `wss://this-host/wisp/` are the same endpoint, and treating them as
different rebuilds the transport on the first save after boot for no reason.

The same guard belongs in front of `connection.setTransport()` on bare-mux. It
is cheaper there, because the SharedWorker owns the connection, but a redundant
call still tears down and re-establishes it for every tab at once.

### Seed the transport before boot, not after

A saved transport choice has to reach the engine _before_ it constructs its
first client. This ordering builds two:

```js
await engine.init();
await engine.setTransport({ kind: settings.get("transport") });
```

`init()` builds the default transport, then `setTransport` throws it away and
builds the saved one. Any frame created in between is on the wrong transport.
Record the choice first and let boot consume it:

```js
void engine.setTransport({ kind: settings.get("transport") });
await engine.init();
```

That requires `setTransport` to be callable before `init()`, it stores the
config, and only swaps when a controller already exists.

---

## Writing your own

WOULD NOT RECOMMEND UNLESS YOU KNOW WHAT YOU ARE DOING

There are little reasons for building your own transport, but some common ones
are: routing through infrastructure you already have, a different tunnel
protocol, or instrumentation such as logging, metrics, and request rewriting.

Before you start, know what the hard part is. It is not the interface, which is
two methods. It is HTTP correctness: redirects, chunked encoding, content
negotiation, and header edge cases are where naive implementations break on real
sites. libcurl exists precisely because that is a lot of work.

### The contract

Four members, from `@mercuryworkshop/proxy-transports`:

| Member    | Purpose                                                  |
| --------- | -------------------------------------------------------- |
| `ready`   | `false` until `init()` has finished                      |
| `init()`  | One-time setup. Callers await it when `ready` is `false` |
| `request` | One HTTP request, resolving to a `TransferrableResponse` |
| `connect` | One WebSocket, returning `[send, close]`                 |

`request` resolves to a plain object rather than a `Response`, because it may
have to cross a `postMessage` boundary:

```ts
type TransferrableResponse = {
	body: ReadableStream | ArrayBuffer | Blob | string;
	headers: [string, string][];
	status: number;
	statusText: string;
};
```

Headers are `[name, value]` pairs, not a `Headers` object, for the same reason.

### An instrumenting wrapper

The most useful custom transport is usually not a new one. It is a wrapper that
delegates to a real transport and does something on the way past:

```js
class LoggingTransport {
	#inner;

	constructor(inner) {
		this.#inner = inner;
	}

	get ready() {
		return this.#inner.ready;
	}

	init() {
		return this.#inner.init();
	}

	async request(remote, method, body, headers, signal) {
		const started = performance.now();
		const response = await this.#inner.request(
			remote,
			method,
			body,
			headers,
			signal
		);
		console.log(
			method,
			remote.href,
			response.status,
			`${Math.round(performance.now() - started)}ms`
		);
		return response;
	}

	connect(
		url,
		protocols,
		requestHeaders,
		onopen,
		onmessage,
		onclose,
		onerror
	) {
		return this.#inner.connect(
			url,
			protocols,
			requestHeaders,
			onopen,
			onmessage,
			onclose,
			onerror
		);
	}
}
```

Hand it over the same way as any other transport:

```js
const { default: LibcurlClient } = await import("/libcurl/index.mjs");
const transport = new LoggingTransport(new LibcurlClient({ wisp: wispUrl }));

const controller = new Controller({ serviceworker, transport });
```

`ready` has to be a getter rather than a copied boolean, or it goes stale the
moment the inner transport finishes initialising.

### Writing one from scratch

If you are implementing the network layer yourself rather than wrapping one, the
parts that catch people out:

- **Redirects are yours to follow.** Nothing above you does it. Cap the chain,
  20 is the conventional limit, and resolve each `location` against the URL you
  just requested rather than the original.
- **`body` can be a stream.** Returning a fully buffered `ArrayBuffer` works but
  holds whole responses in memory, which is noticeable on video.
- **`signal` must actually abort.** Frames are destroyed while requests are in
  flight, and ignoring it leaks a request per closed tab.
- **`connect` returns synchronously** with `[send, close]`, before the socket is
  open. Queue anything sent before `onopen` fires.

For a reference implementation at a readable size, the transports in
[`@mercuryworkshop/proxy-transports`](https://github.com/MercuryWorkshop/proxy-transports)
are the ones to read. Prefer wrapping over rewriting unless you genuinely need a
different tunnel.
