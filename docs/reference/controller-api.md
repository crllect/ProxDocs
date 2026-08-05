# Controller and Frame API

The class surface of `@mercuryworkshop/scramjet-controller`. Two classes and a
handful of module-level functions: `Controller` owns the service worker
connection, the transport, and the cookie jar; `Frame` owns one iframe and its
plugins.

This page is the reference for the objects themselves. What the config values
mean lives in [Config and flags](scramjet-config.md), what you can tap lives in
[Plugins and hooks](plugins-and-hooks.md), and how to get any of it running
lives in [Wiring Scramjet](../guides/wiring.md).

Verified against `@mercuryworkshop/scramjet-controller` 0.0.14 and
`@mercuryworkshop/scramjet` 2.0.67-alpha.2. See the
[version matrix](versions.md).

---

## Where the API comes from

The package ships three separate bundles, and all three assign the same global
name in their own scope. Which one you get depends on which file you loaded.

| File                   | Loaded in     | Gives you                                                             |
| ---------------------- | ------------- | --------------------------------------------------------------------- |
| `controller.api.js`    | the page      | `Controller`, `Frame`, `ManagedPlugin`, `config`, the version helpers |
| `controller.sw.js`     | the worker    | `shouldRoute()`, `route()`                                            |
| `controller.inject.js` | proxied pages | `load()`, called by injected bootstrap only                           |

So `$scramjetController.Controller` in a service worker is `undefined`, and
`$scramjetController.route` on the page is too. They aren't the same object.

Read the global at call time, never at module scope. The npm entry point is a
stub that destructures the global when the module evaluates, which loses a race
against the classic script under most dev servers. That failure and its error
message are covered in
[reading Scramjet's exports](plugins-and-hooks.md#reading-scramjets-exports);
the same applies to every name on this page.

You never call `controller.inject.js` yourself. Scramjet injects it into each
proxied document, and its `load()` receives a serialized copy of the config,
prefix, and cookie jar. It is listed here so you recognize it in a network tab.

---

## `new Controller(init)`

| Key              | Type                      | Required | What it is                                  |
| ---------------- | ------------------------- | -------- | ------------------------------------------- |
| `serviceworker`  | `ServiceWorker`           | yes      | The **active** worker, not a `Registration` |
| `transport`      | `ProxyTransport`          | yes      | An epoxy, libcurl, or bare client instance  |
| `config`         | `Partial<Config>`         | no       | Paths, prefix, codec                        |
| `scramjetConfig` | `Partial<ScramjetConfig>` | no       | Rewriter flags and globals                  |

`serviceworker` has to be a `ServiceWorker` object. Passing the registration is
the common mistake, and it fails later and elsewhere, when the first
`postMessage` goes nowhere. Get it from `navigator.serviceWorker.controller`,
falling back to `registration.active`. See
[client boot](../guides/wiring.md#client-boot).

The constructor is synchronous and starts three async jobs: the worker
handshake, the wasm fetch, and the first cookie-jar load. All three are what
[`wait()`](#wait) waits for.

It throws immediately, before any of that, if `$scramjet` is missing or its
version doesn't match the build. See [version guards](#version-guards).

### How the two configs merge

Both go through `@fastify/deepmerge`, but not in the same direction, and the
difference is visible in behavior.

**`config` merges the way you expect.** Your values win over the defaults, key
by key, so passing `{ prefix: "/p/" }` leaves every path default intact.

**`scramjetConfig` does not.** The controller starts from its own preset, merges
Scramjet's defaults **over** it, then merges yours on top. Since the defaults
are applied last of the two, the controller's own preset loses:

```js
const scramjetConfig = {
	flags: { ...scramjetDefaultConfig.flags, allowFailedIntercepts: true },
	maskedfiles: ["inject.js", "scramjet.wasm.js"]
};
```

That `allowFailedIntercepts: true` never survives. `defaultConfig.flags` sets it
to `false`, the merge applies that afterwards, and the flag is `false` on every
controller that doesn't set it explicitly. If you want the behavior the
controller appears to be asking for, pass it yourself:

```js
new Controller({
	serviceworker,
	transport,
	scramjetConfig: { flags: { allowFailedIntercepts: true } }
});
```

**Arrays concatenate, they do not replace.** `maskedfiles` survives the same
merge because concatenating onto an empty array is a no-op, and your own entries
are appended to the built-in two rather than replacing them:

```js
new Controller({
	serviceworker,
	transport,
	scramjetConfig: { maskedfiles: ["mine.js"] }
});
// controller.scramjetConfig.maskedfiles
// → ["inject.js", "scramjet.wasm.js", "mine.js"]
```

There is no way to remove `inject.js` or `scramjet.wasm.js` from that list
through config, which is fine, because unmasking them breaks the frame.

---

## `Controller` members

| Member                     | Type             | What it is                                          |
| -------------------------- | ---------------- | --------------------------------------------------- |
| `id`                       | `string`         | Random 8-character id, second segment of the prefix |
| `prefix`                   | `string`         | `config.prefix + id + "/"`                          |
| `config`                   | `Config`         | The merged path/codec config                        |
| `scramjetConfig`           | `ScramjetConfig` | The merged rewriter config                          |
| `transport`                | `ProxyTransport` | Current transport, swap it with `setTransport()`    |
| `cookieJar`                | `CookieJar`      | One jar for every frame on this controller          |
| `frames`                   | `Frame[]`        | Every frame ever created, never pruned              |
| `serviceWorkerController`  | `ServiceWorker`  | Whatever you passed as `init.serviceworker`         |
| `rpc`                      | `RpcHelper`      | The channel to the worker, internal                 |
| `isReady`                  | `boolean`        | Always `false`, see below                           |
| `guardServiceWorkerRevive` | `boolean`        | Suppresses revive handling, see below               |

### `wait()`

```js
await controller.wait();
```

Resolves once the worker has acknowledged the handshake and the wasm has been
fetched and installed. Call it before creating frames.

It does **not** wait for the cookie jar. That loads lazily and the controller
holds proxied requests until it is ready, so you don't have to sequence it. See
[Cookies and sessions](../guides/cookies-and-sessions.md).

### `createFrame(element?, options?)`

```js
const frame = controller.createFrame(iframe, {
	plugins: [new utils.HttpCachePlugin()]
});
```

`element` is **optional**. Omit it and the controller creates a detached
`<iframe>` for you, reachable as `frame.element`. You still have to append it to
the document yourself or nothing renders.

`options.plugins` is a `ManagedPlugin[]`. The constructor validates each
plugin's `dependencies` against the names in that same array and throws
`Dependency X not found for plugin Y` if one is missing, then calls
`install(frame)` in array order. Nothing is resolved from anywhere else; see
[the two plugin base classes](plugins-and-hooks.md#two-plugin-base-classes).

Every frame is pushed onto `controller.frames` and never removed.

**Nothing stops you calling this too early.** The method opens with a readiness
guard, but it tests a promise that the constructor always assigns, so the guard
can never fire:

```js
if (!this.ready) throw new Error("Controller is not ready! …");
```

A frame created before `wait()` resolves is therefore returned normally, with
the wasm possibly not yet installed and the worker possibly not yet routing its
prefix. The symptom is a frame that loads nothing, or a first navigation that
lands on your own 404. Await `wait()`; the error you were counting on to catch
this doesn't exist.

### `setTransport(transport)`

```js
controller.setTransport(new LibcurlClient({ wisp: wispUrl }));
```

Replaces the transport on the controller and walks `controller.frames`,
reassigning it on every frame's fetch handler. Existing in-flight requests are
not migrated, and the old transport isn't closed. Dropping the reference is your
job.

Because `frames` never shrinks, this walks every frame you have ever created,
including ones whose iframes are long gone. Call it on an actual transport
change, not per navigation. See [Transports](../concepts/transports.md) and
[Multiple tabs](../guides/multiple-tabs.md).

### `persistCookies()` and `propagateCookieSync(cookies, options?)`

Both are public, and both are already called for you on every `set-cookie` that
comes back through a frame. You need them only when you mutate `cookieJar`
yourself.

```js
controller.cookieJar.setCookies(
	"session=abc; Path=/",
	new URL("https://example.com")
);
await controller.persistCookies();
```

`persistCookies()` writes the jar to IndexedDB (database
`__scramjet_controller`, store `state`, key `cookies`) under a monotonic
`updatedAt`, then announces it on the `__scramjet_controller_channel`
`BroadcastChannel` so other tabs reload it. Without the call, your mutation
lives only in memory and dies with the tab.

`propagateCookieSync(cookies, options)` pushes entries into the worker so
already-loaded proxied documents update their own jars. `cookies` is a
`SerializedCookieSyncEntry[]`; `options` accepts `clear` (wipe before applying)
and `destination` (a `RequestDestination`, which the worker uses to decide
whether to wait for an acknowledgement).

### `isReady` and `guardServiceWorkerRevive`

`isReady` is declared `false` and assigned nowhere in 0.0.14. Reading it tells
you nothing about the controller. Use `await wait()`, or keep your own flag next
to it.

`guardServiceWorkerRevive` exists because a freshly spawned worker announces
itself as revived even though it never died. The controller ignores revive
messages for the first five seconds after construction, then clears the flag.
Setting it to `true` yourself suppresses message-port re-establishment after a
genuine worker death, which is the bug the
[keepalive ping](../guides/wiring.md#the-keepalive) exists to avoid. Leave it
alone.

---

## `Frame` members

| Member         | Type                     | What it is                              |
| -------------- | ------------------------ | --------------------------------------- |
| `id`           | `string`                 | Random 8-character id                   |
| `prefix`       | `string`                 | `controller.prefix + id + "/"`          |
| `element`      | `HTMLIFrameElement`      | The iframe, yours or the one it created |
| `controller`   | `Controller`             | The owning controller                   |
| `plugins`      | `ManagedPlugin[]`        | Exactly what you passed                 |
| `options`      | `FrameOptions`           | The options object you passed           |
| `hooks`        | `{ fetch, init, error }` | Everything tappable, see below          |
| `fetchHandler` | `ScramjetFetchHandler`   | The per-frame request pipeline          |
| `context`      | `ScramjetContext`        | Getter, rebuilt on every access         |

`hooks.fetch` isn't the frame's own object. It is `fetchHandler.hooks.fetch`,
re-exposed. `hooks.init` and `hooks.error` are `Tap` instances the frame creates
itself. All three are documented field by field in
[the hooks](plugins-and-hooks.md#the-hooks).

### Navigation

```js
frame.go("https://crllect.dev");
frame.back();
frame.forward();
frame.reload();
```

`go()` is synchronous: it rewrites the URL against the frame's context and
assigns `element.src`. It doesn't wait for the load, and it doesn't validate the
input. Pass it a bare `example.com` and you get a relative navigation. Parse
before you call it, per
[URL parsing and history](../guides/url-parsing-and-history.md).

The other three drive `element.contentWindow.history` directly and silently do
nothing when the frame hasn't loaded a document yet. There is no
`canGoBack`-style state to read; Scramjet doesn't expose one, and reading
`history.length` from the parent gives you the proxied document's own count.

### `getPlugin(name)`

```js
const cache = frame.getPlugin("scramjet-http-cache");
```

Looks a plugin up by its registered name and throws `Plugin X not found` if it
is absent. Prefer it to `frame.plugins.find(...)` in your own code, because you
get an error naming the plugin instead of `undefined` surfacing three frames
later.

Inside a plugin that runs per document you still want `frame.plugins.find(...)`,
because that is what the shipped plugins do and the lookup has to happen at tap
time rather than install time.

### `frame.context`

A getter that rebuilds a fresh `ScramjetContext` on every access:

| Field       | What it is                                              |
| ----------- | ------------------------------------------------------- |
| `config`    | The controller's `ScramjetConfig`                       |
| `prefix`    | `frame.prefix` as an absolute `URL`                     |
| `cookieJar` | The controller's jar, shared                            |
| `interface` | Inject-script builders plus `codecEncode`/`codecDecode` |

This is what you pass to `rewriteUrl` and friends when you need to encode or
decode a URL the same way the frame does:

```js
const { rewriteUrl } = globalThis.$scramjet;
const encoded = rewriteUrl(url, frame.context, {
	origin: new URL(location.href),
	base: new URL(location.href)
});
```

Because it is rebuilt per access, mutating `frame.context` accomplishes nothing.
Change `controller.scramjetConfig` instead, and note that flags are read per
request, so the change lands on the next navigation and not on the current
document.

### There is no `frame.destroy()`

Removing the iframe from the DOM is all you can do. The `Frame` stays in
`controller.frames`, its plugins stay installed, and its prefix stays registered
in the worker. This is the leak behind the guidance in
[Multiple tabs](../guides/multiple-tabs.md#memory): a long session that opens
and closes tabs accumulates frames, and `setTransport()` walks all of them.

---

## Every type in the package

The package's type entry point re-exports `index.ts` and declares the global, so
a type-only import gives you the classes without touching the runtime:

```ts
import type { Frame, Config } from "@mercuryworkshop/scramjet-controller";
```

That import is erased at compile time, which is why it is safe when
[reading the value side isn't](plugins-and-hooks.md#reading-scramjets-exports).

**Most of the package's types are not importable by name.** They live in
`src/types.d.ts`, and `index.ts` imports them without re-exporting, so they
never reach `typesEntry.d.ts`. The `exports` map declares only `"."`, so there
is no deep import path to reach around it either. The table below says which is
which.

| Type                        | Importable | Where you meet it                       |
| --------------------------- | ---------- | --------------------------------------- |
| `Controller`                | yes        | The class                               |
| `Frame`                     | yes        | The class                               |
| `ManagedPlugin`             | yes        | Plugin base class                       |
| `Config`                    | yes        | `init.config`, `controller.config`      |
| `TransferRequest`           | no         | `error.request` context, worker payload |
| `TransferResponse`          | no         | `error.request` props, worker payload   |
| `BodyType`                  | no         | Request and response bodies             |
| `SerializedCookieSyncEntry` | no         | `propagateCookieSync()`                 |
| `FrameInitHooks`            | no         | `frame.hooks.init`                      |
| `FrameErrorHooks`           | no         | `frame.hooks.error`                     |
| `WebSocketData`             | no         | Transport RPC payloads                  |
| `WebSocketMessage`          | no         | Transport RPC payloads                  |
| `Controllerbound`           | no         | RPC method map, worker to page          |
| `SWbound`                   | no         | RPC method map, page to worker          |
| `TransportToController`     | no         | RPC method map, in-frame transport      |
| `ControllerToTransport`     | no         | RPC method map, in-frame transport      |
| `ControllerInit`            | no         | The constructor argument                |
| `FrameOptions`              | no         | The `createFrame()` options             |

Everything from `TransferRequest` down is unreachable for a different reason
than the last two. The `types.d.ts` group is exported from its own file and then
dropped on the way out of the package; `ControllerInit` and `FrameOptions` are
declared in `index.ts` without `export` at all. The effect is the same.

It is worse than a missing export. The published package doesn't ship
`types.d.ts` at all, and `dist/types/index.d.ts` still imports from `./types`,
so that import dangles. Under `skipLibCheck: true`, the default in most setups
and in every project this builder generates, TypeScript swallows the dangling
import and everything that came from that file silently becomes `any`.

**So deriving them through the class does not work either**, even though it
compiles:

```ts
import type { Frame } from "@mercuryworkshop/scramjet-controller";

// resolves to `any`, not to TransferRequest
type Req = Frame["hooks"]["error"]["request"]["context"]["rawrequest"];
```

`Controller` and `Frame` themselves are typed properly: misspell a member and
`tsc` catches it. Anything reached through `frame.hooks` isn't. Restate the
shape from the tables below instead, which at least type-checks:

```ts
type TransferResponse = {
	body: string | ArrayBuffer | Blob | ReadableStream<Uint8Array>;
	status: number;
	statusText: string;
	headers: [string, string][];
};
```

None of these has changed since 0.0.10. Exporting them upstream is a one-line
change to `index.ts` plus shipping `types.d.ts`, and it is a reasonable first
pull request.

### Types you will actually touch

`TransferRequest` and `TransferResponse` cross a `postMessage` boundary between
the worker and the page, which is why they are plain objects rather than
`Request` and `Response`, neither of which is
[structured-cloneable](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm).

You get a `TransferRequest` as `context.rawrequest` in
[`error.request`](plugins-and-hooks.md#errorrequest):

| Field                      | Type                 | Notes                                    |
| -------------------------- | -------------------- | ---------------------------------------- |
| `rawUrl`                   | `string`             | The **proxied** URL, prefix included     |
| `rawReferrer`              | `string \| null`     | Proxied referrer                         |
| `referrer`                 | `string`             | The request's referrer                   |
| `destination`              | `RequestDestination` | `document`, `image`, `script`, …         |
| `mode`                     | `RequestMode`        | `navigate`, `cors`, …                    |
| `method`                   | `string`             |                                          |
| `body`                     | `BodyType \| null`   | String, `ArrayBuffer`, `Blob`, or stream |
| `cache`                    | `RequestCache`       |                                          |
| `initialHeaders`           | `RawHeaders`         | Array of `[name, value]` pairs           |
| `forceCrossOriginIsolated` | `boolean`            |                                          |
| `rawClientUrl`             | `string?`            | URL of the client that made the request  |
| `clientId`                 | `string?`            |                                          |

`rawUrl` is the proxied URL. Filtering on the real destination means decoding it
with `config.codec.decode` after stripping `frame.prefix`, or reading
`client.url` from an init hook instead.

`TransferResponse` is what you hand back:

| Field        | Type         |
| ------------ | ------------ |
| `body`       | `BodyType`   |
| `status`     | `number`     |
| `statusText` | `string`     |
| `headers`    | `RawHeaders` |

`RawHeaders` is `[name, value][]`, not a `Headers` object, for the same cloning
reason. A `Headers` instance here silently serialises to `{}`.

`SerializedCookieSyncEntry` is `{ url: string; cookie: string }`, the shape
`propagateCookieSync()` takes. The `url` is the real destination URL, and the
`cookie` is one raw `set-cookie` string.

`BodyType` is
`string | ArrayBuffer | Blob | ReadableStream<Uint8Array<ArrayBufferLike>>`. A
`ReadableStream` or `ArrayBuffer` body is **transferred**, not copied, so the
sending side loses it. Handing the same body to two places fails on the second.

### The RPC method maps

Four types describe the message plumbing. You never call these methods yourself;
they are here so the types make sense when you read the source or a stack trace,
and so a fork knows what it has to keep compatible.

Each entry is a tuple: `[argument]` for a call with no return, or
`[argument, result]` for one that resolves with something.

**`Controllerbound`**, what the worker can call on the page:

| Method                | Signature                             | Purpose                                        |
| --------------------- | ------------------------------------- | ---------------------------------------------- |
| `ready`               | `[]`                                  | Handshake, resolves `wait()`                   |
| `request`             | `[TransferRequest, TransferResponse]` | The proxied request itself                     |
| `initRemoteTransport` | `[MessagePort]`                       | Hands the page a port for a subframe transport |

**`SWbound`**, what the page can call on the worker:

| Method          | Signature                                                                 |
| --------------- | ------------------------------------------------------------------------- |
| `sendSetCookie` | `[{ cookies: SerializedCookieSyncEntry[]; options?: CookieSyncOptions }]` |

**`TransportToController`** and **`ControllerToTransport`** describe the second
channel, the one a proxied document uses when it needs the tunnel directly:

| Method          | Direction               | Signature                                                        |
| --------------- | ----------------------- | ---------------------------------------------------------------- |
| `request`       | transport to controller | `[{ remote, method, body, headers }, TransferrableResponse]`     |
| `sendSetCookie` | transport to controller | `[{ cookies, options }]`                                         |
| `connect`       | transport to controller | `[{ url, protocols, requestHeaders, port }, success \| failure]` |
| `ready`         | controller to transport | `[]`                                                             |

`connect` resolves with `{ result: "success", protocol, extensions }` or
`{ result: "failure", error }`. It never rejects, so a failed WebSocket comes
back as a value and not a thrown error. That is deliberate: the RPC layer can't
clone an `Error` with its stack.

Data on an open socket then flows over the `MessagePort` as `WebSocketMessage`:

```ts
type WebSocketData = string | ArrayBuffer | Blob;

type WebSocketMessage =
	| { type: "data"; data: WebSocketData }
	| { type: "close"; code: number; reason: string };
```

Both sides post the same union, so one handler covers send and receive. There is
no `open` message; the `connect` result is the open signal.

### The hook types

`FrameInitHooks` and `FrameErrorHooks` are the two `Tap` maps the frame creates
itself. `FetchHooks` comes from core and is re-exposed on `frame.hooks.fetch`.
All three are documented field by field in
[the hooks](plugins-and-hooks.md#the-hooks); the shapes are:

```ts
type FrameInitHooks = {
	pre: {
		context: {
			window: Window;
			client: ScramjetClient;
			isTopLevel: boolean;
		};
		props: {};
	};
	post: {
		context: {
			window: Window;
			client: ScramjetClient;
			isTopLevel: boolean;
		};
		props: {};
	};
};

type FrameErrorHooks = {
	request: {
		context: { rawrequest: TransferRequest; error: unknown };
		props: { setResponse?: TransferResponse; suppressError?: boolean };
	};
};
```

`props: {}` on the init hooks isn't a placeholder for a future field. There is
nothing to set, and the second callback argument is an empty object at runtime.
Everything you do in an init hook, you do to `context.window`.

Types that come from elsewhere and appear in these signatures, `ScramjetConfig`,
`ScramjetClient`, `CookieJar`, `CookieSyncOptions`, `RawHeaders`,
`TransferrableResponse`, are covered in [the core API](core-api.md).

---

## The service worker module

Two exports, both from `controller.sw.js`:

```js
importScripts("/controller/controller.sw.js");

self.addEventListener("fetch", event => {
	if ($scramjetController.shouldRoute(event)) {
		event.respondWith($scramjetController.route(event));
	}
});
```

`shouldRoute(event)` returns `true` when the request path starts with a
registered frame prefix. Check it before calling `route()`, or the worker
intercepts its own runtime files.

`route(event)` forwards the request to the owning page over the message port and
resolves with the response. It never rejects: on failure it logs and returns a
500 whose body is `Internal Service Worker Error: <message>`. Seeing that string
in a frame means the page side threw, so look at the tab's console, not the
worker's.

The worker keeps its routing table in module scope, so a terminated worker
forgets every prefix. That is the whole reason for the keepalive ping, and the
messages below are how the two sides recover.

| Message                      | Direction | Purpose                                           |
| ---------------------------- | --------- | ------------------------------------------------- |
| `$controller$init`           | page → SW | Registers a prefix and hands over a `MessagePort` |
| `$controller$swrevive`       | SW → page | "I just started, send me a new port"              |
| `$controller$setCookie`      | SW → page | Cookie sync into loaded documents                 |
| `$sw$setCookieDone`          | page → SW | Acknowledgement, keyed by id                      |
| `$sw$initRemoteTransport`    | page → SW | Hands a transport port to the right controller    |
| `"keepalive"` (plain string) | page → SW | Resets the idle timer and runs no handler         |

Both worker-side listeners return early on anything that isn't an object, which
is why the keepalive is deliberately a bare string.

---

## Version guards

`controller.api.js` exports two things you can use directly:

```js
console.log($scramjetController.VERSION);
$scramjetController.assertRuntimeScramjetVersion();
```

`VERSION` is the controller's own version, baked in at build time.

`assertRuntimeScramjetVersion()` compares the version of
`@mercuryworkshop/scramjet` the controller was built against with the one
actually loaded, and throws on a mismatch:

```text
@mercuryworkshop/scramjet version mismatch: this build expects 2.0.67-alpha.2, but the loaded runtime is 2.0.66
```

or, if the core bundle never loaded at all:

```text
@mercuryworkshop/scramjet is not loaded. Load scramjet before the controller.
```

**The `Controller` constructor calls this for you**, first thing, so a skewed
install fails at construction rather than on the first navigation. Both errors
mean the same class of problem: a stale `node_modules`, a cached `scramjet.js`
served by a service worker that outlived a deploy, or script tags in the wrong
order. Load order is core, controller, then utils. See the
[version matrix](versions.md) for the combinations that are known to work.

---

## Where to go next

- [Known bugs](known-bugs.md). The members on this page that don't do what they
  look like, collected with the code behind each one.
- [Config and flags](scramjet-config.md). What every value in `config` and
  `scramjetConfig` actually changes.
- [Plugins and hooks](plugins-and-hooks.md). The contents of `frame.hooks`,
  field by field.
- [Wiring Scramjet](../guides/wiring.md). Where the controller comes from, and
  the keepalive it needs.
- [Multiple tabs](../guides/multiple-tabs.md). One controller, many frames, and
  what that costs.
