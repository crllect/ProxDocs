# Core API and types

Everything on the `$scramjet` global: the classes you construct, the functions
you call, and every type that appears in a signature you will ever write.

This is the layer under the [controller](controller-api.md). The controller owns
the service worker and the frames; core owns the rewriter, the cookie jar, the
fetch pipeline, and the per-document client. Plugins touch both.

Verified against `@mercuryworkshop/scramjet` 2.0.67-alpha.2. See the
[version matrix](versions.md).

---

## Reaching it

`scramjet.js` is a classic script that assigns `globalThis.$scramjet`. The npm
package's default export is a stub that destructures that global at module
evaluation time, so importing values from it races the script tag and loses
under most dev servers. Read the global inside a function, and import types
separately:

```ts
import type { ScramjetClient, URLMeta } from "@mercuryworkshop/scramjet";

const scramjet = () => globalThis.$scramjet;
```

The full failure, its error message, and why type-only imports are safe are in
[reading Scramjet's exports](plugins-and-hooks.md#reading-scramjets-exports).

**You need `skipLibCheck: true` for the type-only import to work.** The
published `dist/types/` still contains the build's internal path aliases,
`@/shared`, `@/fetch`, `@rewriters/url`, `@client/events`, and nothing resolves
them on your side, so a strict `tsconfig.json` reports a wall of `TS2307` errors
from inside `node_modules` and then claims `@mercuryworkshop/scramjet` has no
exported member `ScramjetFetchHandler`. The controller's declarations have the
same problem plus an import of `./types`, which is not shipped at all. With
`skipLibCheck` on, the default in most setups and in every project this builder
generates, all of it is suppressed and the exported classes type correctly. What
you lose is covered in
[every type in the package](controller-api.md#every-type-in-the-package).

Two other entry points exist for bundler users, declared in the package's
`exports` map:

| Subpath          | What it is                                   |
| ---------------- | -------------------------------------------- |
| `./bundled`      | The real module, wasm fetched separately     |
| `./bundled-wasm` | The module with the wasm inlined as base64   |
| `./path`         | Node-only, resolves `dist/` for static hosts |

`./bundled-wasm` is the one that lets you skip serving `scramjet.wasm`, at the
cost of a much larger JavaScript payload. Most projects should serve the files
and use the classic script; see [Wiring Scramjet](../guides/wiring.md).

---

## What is on the global

| Export                 | Kind     | One line                                                    |
| ---------------------- | -------- | ----------------------------------------------------------- |
| `ScramjetClient`       | class    | One per proxied document, owns the patched globals          |
| `ScramjetFetchHandler` | class    | The request pipeline, one per frame                         |
| `ScramjetHeaders`      | class    | Header bag that survives `postMessage`                      |
| `CookieJar`            | class    | Cookie storage, parsing, and matching                       |
| `Plugin`               | class    | Base class for anything that taps a hook                    |
| `Tap`                  | class    | The hook system itself, all static                          |
| `BareResponse`         | class    | Transport-level response, re-exported from proxy-transports |
| `rewriteUrl`           | function | Real URL to proxied URL                                     |
| `unrewriteUrl`         | function | Proxied URL back to real URL                                |
| `rewriteBlob`          | function | Blob URL rewriting                                          |
| `unrewriteBlob`        | function | Blob URL unrewriting                                        |
| `flagEnabled`          | function | Resolve a flag for a URL, `siteFlags` included              |
| `setWasm`              | function | Hand the rewriter its wasm bytes                            |
| `defaultConfig`        | const    | The shipped `ScramjetConfig`                                |
| `defaultConfigDev`     | const    | Same, with the debugging flags flipped                      |
| `versionInfo`          | const    | `{ version, build, date }`                                  |

The controller calls `setWasm()` for you during `wait()`. You need it only when
you construct a `ScramjetFetchHandler` yourself, which is what the injected
worker bootstrap does.

---

## `ScramjetClient`

One instance per proxied document, created by the injected bootstrap. You never
construct it; you receive it as `context.client` in
[`init.pre` and `init.post`](plugins-and-hooks.md#initpre-and-initpost).

| Member                | Type                             | What it is                                     |
| --------------------- | -------------------------------- | ---------------------------------------------- |
| `url`                 | `URL` (get/set)                  | The real URL, already decoded                  |
| `global`              | `GlobalThis`                     | The document's `window` or worker `self`       |
| `meta`                | `URLMeta`                        | Base and origin used for rewriting             |
| `context`             | `ScramjetContext`                | Config, prefix, cookie jar, codec              |
| `initHeaders`         | `ScramjetHeaders`                | Response headers the document arrived with     |
| `history`             | `TrackedHistoryState[]`          | Tracked history for this document              |
| `bare`                | `BareCompatibleClient`           | The transport, as the page sees it             |
| `serviceWorker`       | `ServiceWorkerContainer`         | The proxied page's fake registration container |
| `natives`             | `NativeStore`                    | Unpatched originals, keyed by path             |
| `descriptors`         | `DescriptorStore`                | Unpatched property descriptors                 |
| `hooks.rewriter.html` | `TapInstance<HtmlRewriterHooks>` | Per-document HTML rewrite hooks                |
| `hooks.lifecycle`     | `TapInstance<LifecycleHooks>`    | In-page navigation                             |

Methods worth knowing:

```ts
client.rewriteUrl(url: string | URL, options?: RewriteUrlOptions): string;
client.unrewriteUrl(url: string | URL): string;
client.flagEnabled(flag: keyof ScramjetConfig["flags"]): boolean;
```

`client.url` is the one you reach for most: it answers "where is this document
actually pointed" without any unrewriting of your own. Assigning to it
navigates.

`client.flagEnabled()` resolves `siteFlags` for the document's real origin, so
it can disagree with `controller.scramjetConfig.flags` on a site that has an
override. Read flags through it rather than off the config object; see
[siteFlags](scramjet-config.md#siteflags).

`natives` and `descriptors` are how you call something the page may have
overwritten. They are the escape hatch behind every "the site broke my plugin"
problem, and they are also the fastest way to break a page if you write to them.

Constructing a second client for a global that already has one throws. That is
the `attempted to initialize a scramjet client, but one is already loaded`
error; it means two copies of Scramjet reached the same document.

---

## `ScramjetFetchHandler`

The request pipeline. The controller creates one per `Frame` and exposes it as
[`frame.fetchHandler`](controller-api.md#frame-members); the injected worker
bootstrap creates its own.

```ts
new ScramjetFetchHandler(init: FetchHandlerInit);
await handler.handleFetch(request: ScramjetFetchRequest): Promise<ScramjetFetchResponse>;
```

| `FetchHandlerInit` field | Type                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- |
| `transport`              | `ProxyTransport`                                                             |
| `context`                | `ScramjetContext`                                                            |
| `crossOriginIsolated`    | `boolean?`                                                                   |
| `sendSetCookie`          | `(cookies: CookieSyncEntry[], options?: CookieSyncOptions) => Promise<void>` |
| `fetchDataUrl`           | `(dataUrl: string) => Promise<BareResponse>`                                 |
| `fetchBlobUrl`           | `(blobUrl: string) => Promise<BareResponse>`                                 |

| Handler member        | Type                                      |
| --------------------- | ----------------------------------------- |
| `client`              | `BareCompatibleClient`                    |
| `context`             | `ScramjetContext`                         |
| `crossOriginIsolated` | `boolean`                                 |
| `trackedClients`      | `Map<string, ScramjetFetchTrackedClient>` |
| `hooks.fetch`         | `TapInstance<FetchHooks>`                 |
| `hooks.rewriter.html` | `TapInstance<HtmlRewriterHooks>`          |

`handler.client.transport` is what `controller.setTransport()` reassigns. If you
hold a handler yourself, that is the field to swap, not `init.transport`, which
is only read in the constructor.

`trackedClients` maps a service worker `clientId` to its navigation history, and
is how a redirect chain keeps its `Sec-Fetch-Site` classification honest across
documents. It grows for the life of the frame.

---

## `CookieJar`

```ts
jar.setCookies(cookieString: string, url: URL): void;
jar.getCookies(url: URL, fromJs: boolean, sameSiteContext?: "strict" | "lax" | "cross-site"): string;
jar.load(cookies: string | Record<string, Cookie>): void;
jar.dump(): string;
jar.clear(): void;
```

`dump()` returns JSON, and `load()` accepts either that JSON or an
already-parsed record. Those two are what the controller persists to IndexedDB
and what the inject script carries into each document.

`fromJs` distinguishes a `document.cookie` read from a request header build, so
`httpOnly` cookies are withheld from the page. Pass it correctly or you hand
scripts a session cookie the real browser would have hidden.

`sameSiteContext` defaults to `"strict"`, which is the conservative choice: it
withholds `SameSite=Lax` and `None` cookies that a cross-site navigation should
have sent. Pass the real context when you know it.

A `Cookie` is:

| Field      | Type       | Notes                                     |
| ---------- | ---------- | ----------------------------------------- |
| `name`     | `string`   |                                           |
| `value`    | `string`   |                                           |
| `path`     | `string?`  | Defaults to the URL's directory           |
| `expires`  | `number?`  | Epoch milliseconds                        |
| `maxAge`   | `number?`  |                                           |
| `domain`   | `string?`  | Stored without the leading dot            |
| `hostOnly` | `boolean?` | Set when the cookie carried no `Domain`   |
| `secure`   | `boolean?` | Parsed but **not enforced**, see below    |
| `httpOnly` | `boolean?` | Enforced against `fromJs` reads           |
| `sameSite` | `string?`  | Case varies by parser, compare lowercased |

`secure` is deliberately not enforced on retrieval. Scramjet presents every
proxied origin as HTTPS regardless of the real scheme, so enforcing it would
drop cookies that the real browser would have sent. It is parsed and stored, so
a plugin can still read it.

Cookie storage is per controller, not per frame. What that means for logins, and
the three ways sessions break, is in
[Cookies and sessions](../guides/cookies-and-sessions.md).

---

## `ScramjetHeaders`

A case-insensitive header bag that survives structured cloning.

```ts
headers.set(key: string, value: string): void;
headers.get(key: string): string | null;
headers.has(key: string): boolean;
headers.delete(key: string): void;
headers.clone(): ScramjetHeaders;
headers.toRawHeaders(): RawHeaders;
headers.toNativeHeaders(): Headers;
ScramjetHeaders.fromRawHeaders(raw: RawHeaders): ScramjetHeaders;
ScramjetHeaders.fromNativeHeaders(native: Headers): ScramjetHeaders;
```

`RawHeaders` is `[name, value][]`, from `proxy-transports`. It is the only
header shape that crosses a `postMessage` boundary intact, which is why
[`TransferResponse`](controller-api.md#types-you-will-actually-touch) uses it
and why putting a `Headers` object there silently produces `{}`.

Convert at the boundary and work with whichever type the surrounding code uses.
Mixing them in one function is where the header bugs come from.

---

## `Tap` and `Plugin`

The hook system. `Tap` is entirely static; `Plugin` is what you subclass.

```ts
class Plugin {
	constructor(name: string, tapOrder?: TapOrder);
	tap<T>(hook: T, callback: (context, props) => void | Promise<void>, order?: TapOrder): void;
}

Tap.create<T>(): TapInstance<T>;
Tap.tap<T>(hook, callback, plugin?, order?): void;
Tap.dispatch<T>(hook, context, props): Promise<void[]> | null;
Tap.getTappers<T>(hook): Plugin[];
```

`TapOrder` is `{ before?: readonly string[]; after?: readonly string[] }`, both
lists of **plugin names**. A plugin's constructor order applies to every hook it
taps; passing `order` to a single `tap()` call overrides it for that callback
only.

```js
class Blocker extends utils().ManagedPlugin {
	constructor() {
		super("blocker", []);
	}
	install(frame) {
		this.tap(frame.hooks.fetch.request, onRequest, {
			before: ["scramjet-http-cache"]
		});
	}
}
```

Three behaviours to know, because none of them are obvious from the signatures:

- **`dispatch()` returns `null`** when nothing is tapped, not an empty promise.
  Awaiting it is fine; branching on truthiness is not.
- **Callbacks run concurrently**, through `Promise.all`. Ordering constrains the
  order they are _called_ in, not the order they finish. Two async callbacks
  that both mutate `props` can interleave.
- **Ordering is by name against tapped plugins only.** A `before` naming a
  plugin that never tapped this hook is silently ignored, which is usually what
  you want, and is occasionally the reason your callback ran first anyway.

`Tap.getTappers()` throws rather than returning `[]` when nothing has tapped the
hook, because it indexes the callback record before mapping it. Guard it.

`Tap.create()` returns a `Proxy`, so every property access on a hook map yields
a hook object whether or not anyone has tapped it. There is no "unknown hook"
error to catch: a typo in a hook name gives you a hook nobody dispatches.

Writing plugins, the two base classes, and the shipped ones are covered in
[Plugins and hooks](plugins-and-hooks.md).

---

## URL rewriting

```ts
rewriteUrl(url: string | URL, context: ScramjetContext, meta: URLMeta, options?: RewriteUrlOptions): string;
unrewriteUrl(url: string | URL, context: ScramjetContext): string;
rewriteBlob(url: string, context: ScramjetContext, meta: URLMeta): string;
unrewriteBlob(url: string, context: ScramjetContext, meta: URLMeta): string;
```

From a plugin, prefer `client.rewriteUrl()` and `client.unrewriteUrl()`, which
fill in `context` and `meta` from the document. Call the module-level functions
when you have no client, which is the case on the controller side.

`URLMeta` is the answer to "relative to what":

| Field             | Type      | What it is                         |
| ----------------- | --------- | ---------------------------------- |
| `origin`          | `URL`     | The document's real origin         |
| `base`            | `URL`     | What relative URLs resolve against |
| `topFrameName`    | `string?` | Frame targeting for `_top`         |
| `parentFrameName` | `string?` | Frame targeting for `_parent`      |
| `referrerPolicy`  | `string?` | Policy in force for this document  |

`origin` and `base` are usually the same, and are not when the document carries
a `<base href>`. Getting these wrong produces URLs that look right and resolve
against the wrong host, which is the single most common way a hand-rolled
rewrite goes wrong.

`RewriteUrlOptions` carries request metadata into the encoded URL, so the
service worker can reconstruct it later:

| Field            | Type              |
| ---------------- | ----------------- |
| `referrerPolicy` | `string?`         |
| `isModule`       | `boolean?`        |
| `navigateType`   | `NavigationType?` |
| `topFrame`       | `string?`         |
| `parentFrame`    | `string?`         |
| `isIframe`       | `string?`         |
| `mode`           | `string?`         |
| `credentials`    | `string?`         |

These become the extra query parameters you see on proxied URLs, which is what
`parsed.hadExtraParams` reports on. Do not strip them: they are how
`Sec-Fetch-*` and module-versus-classic script handling survive the round trip.

`javascript:` URLs are special-cased at the top of both functions. `rewriteUrl`
rewrites the body as JavaScript and re-prefixes it; `unrewriteUrl` currently
returns the input unchanged, marked `TODO` upstream. Do not rely on round
tripping one.

---

## Context types

`ScramjetContext` is what every rewriting function needs. `Frame` builds one per
access; see [`frame.context`](controller-api.md#framecontext).

| Field       | Type                     | What it is                             |
| ----------- | ------------------------ | -------------------------------------- |
| `config`    | `ScramjetConfig`         | Flags, globals, siteFlags, maskedfiles |
| `prefix`    | `URL`                    | Absolute prefix for this frame         |
| `interface` | `ScramjetInterface`      | Codec plus inject-script builders      |
| `cookieJar` | `CookieJar`              | Shared with the controller             |
| `hooks?`    | `{ rewriter: { html } }` | Assigned by whoever owns the pipeline  |

`ScramjetInterface` is the seam a host fills in:

```ts
type ScramjetInterface = {
	codecEncode: (input: string) => string;
	codecDecode: (input: string) => string;
	getInjectScripts(meta, handler, htmlcontext, script): Element[];
	getWorkerInjectScripts?(meta, isModule, script): string;
};
```

`getInjectScripts` is what decides which files land in every proxied document,
in what order. The controller's implementation is serialized into the page as
source text, which is why it is written as a standalone function that closes
over nothing: anything it captures would not survive `toString()`.

`ScramjetConfig` itself, its `flags`, `globals`, `siteFlags`, and `maskedfiles`,
is documented value by value in [Config and flags](scramjet-config.md).
`ScramjetVersionInfo` is `{ version, build, date }`, where `build` is the commit
hash the bundle was built from. Quote it in bug reports; alpha versions move
faster than the version string suggests.

`ScramjetInitConfig` is a 1.x leftover in `types.ts`: it extends
`ScramjetConfig` with a `codec` and a partial `flags`. Nothing in 2.x constructs
one. If you find it in a guide, that guide is for 1.x; see
[breaking changes](breaking-changes.md).

---

## Fetch pipeline types

These four appear in every fetch hook. What each hook can do with them is in
[the hooks](plugins-and-hooks.md#the-hooks); this is what the objects contain.

**`ScramjetFetchRequest`**, the request as it entered the pipeline:

| Field            | Type                 | Notes                                      |
| ---------------- | -------------------- | ------------------------------------------ |
| `rawUrl`         | `URL`                | Proxied URL, prefix included               |
| `rawReferrer`    | `string \| null`     | Proxied referrer                           |
| `rawDestination` | `RequestDestination` | Use `parsed.destination` instead           |
| `mode`           | `RequestMode`        |                                            |
| `referrer`       | `string`             |                                            |
| `method`         | `string`             |                                            |
| `body`           | `BodyType \| null`   |                                            |
| `cache`          | `RequestCache`       |                                            |
| `initialHeaders` | `ScramjetHeaders`    | Not `RawHeaders`, unlike `TransferRequest` |
| `rawClientUrl`   | `URL?`               | The client that made the request           |
| `clientId`       | `string`             | Service worker `FetchEvent.clientId`       |

`rawDestination` carries an upstream comment telling you not to use it, because
a `$dest` parameter can override it. Read `parsed.destination`.

**`ScramjetFetchParsed`**, everything derived from it:

| Field                     | Type                                            | Notes                                    |
| ------------------------- | ----------------------------------------------- | ---------------------------------------- |
| `url`                     | `URL`                                           | The **real** destination                 |
| `clientUrl`               | `URL?`                                          | Real URL of the requesting document      |
| `referrerSourceUrl`       | `URL \| null`                                   |                                          |
| `destination`             | `RequestDestination`                            | Honours `$dest`                          |
| `meta`                    | `URLMeta`                                       | Origin and base for this request         |
| `isModule`                | `boolean`                                       | ES module versus classic script          |
| `isFakeDataURL`           | `boolean`                                       |                                          |
| `hadExtraParams`          | `boolean`                                       | Whether metadata rode on the URL         |
| `crossSiteRedirect`       | `boolean`                                       |                                          |
| `fetchSiteState`          | `"same-origin" \| "same-site" \| "cross-site"?` | Worst case across redirects              |
| `fetchInitiatorOrigin`    | `string?`                                       | `Sec-Fetch-Site` tracking only           |
| `fetchCredentialsInclude` | `boolean?`                                      |                                          |
| `fetchMode`               | `ScramjetRequestMode?`                          |                                          |
| `isIframe`                | `boolean?`                                      | Scramjet's definition, not the browser's |
| `referrerPolicy`          | `string?`                                       |                                          |
| `trackedClient`           | `ScramjetFetchTrackedClient?`                   | Navigation history for this client       |

`parsed.url` is the field you filter on. Matching a hostname against `rawUrl`
matches your own origin on every request.

`fetchInitiatorOrigin` carries an upstream warning: it diverges from `clientUrl`
in some cases and exists only to keep `Sec-Fetch-Site` correct. Use `clientUrl`
for anything else.

**`ScramjetFetchResponse`** is
`{ body: BodyType; headers: ScramjetHeaders; status: number; statusText: string }`.

**`BodyType`** is `string | ArrayBuffer | Blob | ReadableStream<any>`. Streams
are transferred, not copied.

Two supporting types:

```ts
type CookieSyncEntry = { url: URL; cookie: string };
type CookieSyncOptions = { clear?: boolean; destination?: RequestDestination };
type TrackedHistoryState = { url: string; refererPolicy?: string };
```

`CookieSyncEntry` takes a real `URL`; its serialized cousin on the controller
side takes a string. `refererPolicy` is spelled with the historical single `r`
in this type and with two elsewhere; that inconsistency is upstream, and copying
the wrong spelling silently drops the field.

---

## Hook type maps

Four maps describe everything tappable. Field-level docs and examples are in
[Plugins and hooks](plugins-and-hooks.md); this is where they live and what
generic they take.

| Map                                 | Instance on                                     | Hooks                                                             |
| ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| `FetchHooks`                        | `fetchHandler.hooks.fetch`, `frame.hooks.fetch` | `intercept`, `request`, `preresponse`, `response`                 |
| `HtmlRewriterHooks`                 | `client.hooks.rewriter.html`                    | `pre`, `post`                                                     |
| `LifecycleHooks`                    | `client.hooks.lifecycle`                        | `navigate`                                                        |
| `FrameInitHooks`, `FrameErrorHooks` | `frame.hooks`                                   | Controller package, see [there](controller-api.md#the-hook-types) |

`HtmlRewriterHooks` is reachable in two places that are not the same object. The
frame's handler has one (`fetchHandler.hooks.rewriter.html`), and each proxied
document's client has its own. Tapping the handler's copy from a plugin's
`install()` covers every document that frame fetches; tapping
`context.client.hooks.rewriter.html` from an init hook covers one document. Pick
the first unless you need per-document state.

```ts
type LifecycleHooks = {
	navigate: {
		context: { type: "location" | "history" | "hashchange" };
		props: { url: string };
	};
};
```

That is the whole lifecycle map in 2.0.67-alpha.2. There is no `load`, no
`beforeunload`, and no `urlchange`. For URL tracking use `UrlWatcherPlugin`; for
document lifecycle use `frame.hooks.init.post` and add your own listeners to
`context.window`.

---

## Where to go next

- [Controller and Frame API](controller-api.md). The layer that owns the service
  worker, the frames, and the cookie persistence.
- [Plugins and hooks](plugins-and-hooks.md). What to do with the hook maps
  above.
- [Config and flags](scramjet-config.md). Every value inside `ScramjetConfig`.
- [Known bugs](known-bugs.md). The parts of this surface that are broken
  upstream, with symptoms.
- [Inside Scramjet](../concepts/scramjet-internals.md). Where these files live
  upstream, and how to build and test the thing you are reading about.
