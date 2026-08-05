# Plugins and hooks

Plugins are how you change what Scramjet does without forking it. A plugin
registers callbacks on **hooks**, which are named points in the request and page
lifecycle where Scramjet stops and asks whether anyone wants to intervene.

That is the whole extension surface of Scramjet 2.x. Anything the shipped
plugins do (caching, URL watching, catching escaped links) you can do yourself
with the same API.

Verified against `@mercuryworkshop/scramjet` 2.0.67-alpha.2 and
`@mercuryworkshop/scramjet-controller` 0.0.14. See the
[version matrix](versions.md).

---

## Reading Scramjet's exports

Start here. Getting this wrong produces an error that points nowhere near the
line that caused it.

Scramjet ships as a classic script that assigns a `$scramjet` global. The npm
package's `main`, `module`, and `exports["."]` all point at
`dist/scramjet-external.mjs`. That file isn't the library. Its entire body is a
re-export of the global:

```js
const __external = globalThis.$scramjet;
export const { BareResponse, CookieJar, Plugin, Tap /* … */ } = __external;
```

That destructuring runs at **module evaluation time**. If the module graph
evaluates before the classic script has run, `globalThis.$scramjet` is still
`undefined` and you get:

```text
Cannot destructure property 'BareResponse' of 'globalThis.$scramjet' as it is undefined
```

Under a bundler's dev server the ordering isn't guaranteed either way. ESM
module-graph evaluation isn't sequenced against `<script defer>` tags, so the
same code can work in a production build and fail in dev, or work on one machine
and fail on another.

**Read the globals at call time instead**, inside a constructor or method:

```js
const scramjet = () => globalThis.$scramjet;
const utils = () => globalThis.$scramjetUtils;

class MyPlugin extends utils().ManagedPlugin {
	install(frame) {
		const { BareResponse } = scramjet();
	}
}
```

The same applies to `@mercuryworkshop/scramjet-utils`. Its source imports
`@mercuryworkshop/scramjet` at the top level, so importing it from your page
code drags the stub into your module graph and reintroduces the problem.

Type-only imports are always safe, because they are erased before the code runs:

```ts
import type { BareResponse } from "@mercuryworkshop/scramjet";
```

The globals become available once `scramjet.js` and `controller.api.js` have
loaded. If you follow [manual wiring](../guides/wiring.md), that is inside
`boot()`, before anything else touches them.

---

## Two plugin base classes

There are two, they aren't interchangeable, and picking the wrong one produces a
confusing failure.

| Class           | From                  | Constructor            | Use for                             |
| --------------- | --------------------- | ---------------------- | ----------------------------------- |
| `Plugin`        | `$scramjet`           | `(name, tapOrder?)`    | Tapping a hook on an existing frame |
| `ManagedPlugin` | `$scramjetController` | `(name, dependencies)` | Anything passed to `createFrame()`  |

`ManagedPlugin` is defined in `scramjet-controller` and re-exported by
`scramjet-utils`, so `$scramjetUtils.ManagedPlugin` works too. You don't need to
load utils to subclass it.

`ManagedPlugin` extends `Plugin` and adds two things: a `dependencies` array and
an `install(frame)` method.

When you pass plugins to `createFrame()`, the `Frame` constructor does this:

```js
for (const plugin of this.plugins) {
	for (const dependency of plugin.dependencies) {
		const found = this.plugins.find(p => p.name === dependency);
		if (!found) throw new Error(`Dependency ${dependency} not found …`);
	}
	plugin.install(this);
}
```

Two things follow from that:

- A bare `Plugin` in that array throws on `plugin.dependencies` being
  `undefined`, because `for…of` can't iterate it.
- Dependencies are checked by **name against the same array**, not resolved from
  anywhere else. It asserts load order within one
  [frame](../guides/multiple-tabs.md) and does no resolution.

`LinkHandlerPlugin` is the real example. It declares
`super("link-handler", ["event-handler"])` and then looks its dependency up by
name from inside its `init.post` tap, so the lookup happens per proxied document
rather than once at install:

```js
const eventHandler = frame.plugins.find(p => p.name === "event-handler");
```

So passing `LinkHandlerPlugin` without also passing `EventHandlerPlugin` throws
`Dependency event-handler not found for plugin link-handler` before the frame is
usable. The mechanism is doing its job there: a missing dependency fails loudly
at construction instead of silently doing nothing later.

### Writing one

```js
class TitlePlugin extends globalThis.$scramjetUtils.ManagedPlugin {
	#onTitle;

	constructor(onTitle) {
		super("title-watcher", []);
		this.#onTitle = onTitle;
	}

	install(frame) {
		super.install(frame);

		this.tap(frame.hooks.init.post, context => {
			if (!context.isTopLevel) return;
			const doc = context.window.document;
			this.#onTitle(doc.title);
			new MutationObserver(() => this.#onTitle(doc.title)).observe(
				doc.querySelector("title") ?? doc.head,
				{ childList: true, subtree: true, characterData: true }
			);
		});
	}
}
```

What that shape is obeying:

1. **Pass both constructor arguments.** `dependencies` has no default.
2. **Tap inside `install`, not in the constructor.** The frame doesn't exist yet
   when the constructor runs, and hooks live on the frame.
3. **One instance per frame.** `ManagedPlugin.install(frame)` stores
   `this.frame`, so sharing an instance across frames leaves it pointing at
   whichever installed last. The class can be shared; the instance can't.
4. **Call `super.install(frame)` if you override `install`.** That is what sets
   `this.frame`. Some of the shipped plugins skip it and close over the `frame`
   argument instead, which works but leaves `this.frame` unset.

> A `MutationObserver` watches for DOM changes and fires a callback
> ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)). It
> is used here because Scramjet has no title event.

### Ordering between plugins

Every `tap` call takes an optional `tapOrder` describing which plugins to run
around:

```js
this.tap(frame.hooks.fetch.request, callback, {
	before: ["scramjet-http-cache"],
	after: ["url-watcher"]
});
```

Names refer to other plugins' `name` values. Use it when two taps on the same
hook would otherwise fight. An early-response tap has to run before a caching
tap, or the cache stores a response that was never fetched.

`Plugin` also takes a `tapOrder` as its second constructor argument, which
becomes the default for every tap that doesn't pass its own. `ManagedPlugin`
doesn't: its second argument is `dependencies`, and it passes only the name up
to `Plugin`. On a `ManagedPlugin`, set ordering per tap.

---

## The hooks

Hooks live in three places. **Fetch hooks** fire per request. **Frame hooks**
fire on the frame. **Client hooks** live on the proxied page's own Scramjet
client and are only reachable once a document exists.

```text
frame.hooks.fetch.intercept     ─┐
frame.hooks.fetch.request        │  per request
frame.hooks.fetch.preresponse    │
frame.hooks.fetch.response      ─┘

frame.hooks.init.pre            ─┐  per proxied document,
frame.hooks.init.post           ─┘  including subframes

frame.hooks.error.request        ─   per failed request

context.client.hooks.lifecycle.navigate  ─┐  reached from inside
context.client.hooks.rewriter.html       ─┘  an init hook
```

Every callback has the same signature:

```js
(context, props) => {};
```

`context` is read-only information about what is happening. `props` is the part
you mutate to change the outcome. Callbacks may be async; Scramjet awaits them.

### `fetch.intercept`

Fires first, before Scramjet has decided anything. Set `props.response` to
answer the request without any of Scramjet's normal handling.

| Field             | Type                    |
| ----------------- | ----------------------- |
| `context.request` | `ScramjetFetchRequest`  |
| `context.parsed`  | `ScramjetFetchParsed`   |
| `props.response`  | `ScramjetFetchResponse` |

Use it to block a request outright, or to serve something Scramjet shouldn't
touch. It is the earliest and bluntest of the four.

### `fetch.request`

Fires after parsing, before the transport is called. Most of what you write will
go here.

| Field                 | Type                   |
| --------------------- | ---------------------- |
| `context.request`     | `ScramjetFetchRequest` |
| `context.parsed`      | `ScramjetFetchParsed`  |
| `context.client`      | `BareCompatibleClient` |
| `props.init`          | `BareRequestInit`      |
| `props.url`           | `URL`                  |
| `props.earlyResponse` | `BareResponse`         |

- Rewrite `props.url` to send the request somewhere else.
- Mutate `props.init` to change method, headers, or body.
- Set `props.earlyResponse` to answer locally and skip the network entirely.

`earlyResponse` is what makes [fake origins](../guides/custom-protocols.md)
work: you invent an origin, match on `context.parsed.url.origin`, and hand back
a `Response` for a site that has no server. A native `Response` is fine here;
Scramjet converts it with `BareResponse.fromNativeResponse` if you didn't
already hand it a `BareResponse`.

```js
this.tap(frame.hooks.fetch.request, (context, props) => {
	if (blocklist.has(props.url.hostname)) {
		props.earlyResponse = new Response("Blocked", { status: 403 });
	}
});
```

### `fetch.preresponse`

Fires after the transport returns, before Scramjet rewrites the body. You get
the raw upstream response.

| Field             | Type                   |
| ----------------- | ---------------------- |
| `context.request` | `ScramjetFetchRequest` |
| `context.parsed`  | `ScramjetFetchParsed`  |
| `props.response`  | `BareResponse`         |

Response caching belongs here, along with any header change that would otherwise
affect rewriting, a `content-type` correction being the usual one.

Do not strip security headers here. Scramjet already removes CSP, HSTS,
`x-frame-options` and the `cross-origin-*` policies from every response on its
own. See [site compatibility](site-compatibility.md#content-security-policy).

### `fetch.response`

Fires after rewriting, immediately before the response reaches the page.

| Field             | Type                    |
| ----------------- | ----------------------- |
| `context.request` | `ScramjetFetchRequest`  |
| `context.parsed`  | `ScramjetFetchParsed`   |
| `props.response`  | `ScramjetFetchResponse` |

Use it for logging and metrics. Rewriting the body here means undoing work
Scramjet just did, so prefer `preresponse` for content changes.

### `init.pre` and `init.post`

Fire once per proxied document as its environment is built. `pre` runs before
Scramjet's own patches are applied, `post` runs after.

| Field                | Type             |
| -------------------- | ---------------- |
| `context.window`     | `Window`         |
| `context.client`     | `ScramjetClient` |
| `context.isTopLevel` | `boolean`        |

`props` is empty. You are here to touch `context.window`.

**`isTopLevel` matters more than it looks.** These hooks fire for every
document, including nested iframes the proxied site created. A plugin that
patches `history` or reads `document.title` without checking `isTopLevel` will
also do it inside every ad frame on the page.

```js
this.tap(frame.hooks.init.post, context => {
	if (!context.isTopLevel) return;
	context.window.addEventListener("beforeunload", () => this.save());
});
```

Use `pre` when you need to install something before the site's own code can see
Scramjet's patches. Use `post` for almost everything else.

### `error.request`

Fires when a request fails. This is how you serve an error page instead of a
blank frame.

| Field                 | Type               |
| --------------------- | ------------------ |
| `context.rawrequest`  | `TransferRequest`  |
| `context.error`       | `unknown`          |
| `props.setResponse`   | `TransferResponse` |
| `props.suppressError` | `boolean`          |

Set both: `suppressError` stops Scramjet from propagating the failure, and
`setResponse` supplies what to show instead. Setting only `setResponse` still
lets the error surface.

```js
this.tap(frame.hooks.error.request, (context, props) => {
	if (context.error?.name === "AbortError") return;
	if (context.rawrequest?.destination !== "document") return;

	props.suppressError = true;
	props.setResponse = {
		body: "<h1>Could not load</h1>",
		headers: [["content-type", "text/html; charset=utf-8"]],
		status: 502,
		statusText: "Bad Gateway"
	};
});
```

Both filters matter. `AbortError` fires whenever someone navigates away
mid-load, so without that check every fast click shows an error page. The
`destination` check stops a failed image or tracking pixel from replacing the
whole document.

`TransferResponse` is a plain object rather than a `Response`. It has to cross a
`postMessage` boundary to the service worker, and a `Response` isn't
[structured-cloneable](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm).

### `client.hooks.lifecycle.navigate`

Not on the frame. It lives on the proxied page's own client, so you reach it
through an init hook:

```js
this.tap(frame.hooks.init.post, context => {
	if (!context.isTopLevel) return;
	this.tap(context.client.hooks.lifecycle.navigate, (context, props) => {
		console.log(context.type, props.url);
	});
});
```

| Field          | Type                                      |
| -------------- | ----------------------------------------- |
| `context.type` | `"location" \| "history" \| "hashchange"` |
| `props.url`    | `string`                                  |

This fires for in-page navigation (`history.pushState`, hash changes, `location`
assignments) which `init.post` misses, because no new document gets created.
`UrlWatcherPlugin` wraps this same pattern, so unless you need `context.type`
use the plugin instead of tapping it yourself.

### `client.hooks.rewriter.html`

The other client hook, and the one to reach for when you want to change a
proxied page's markup. It has `pre` and `post`, firing either side of the HTML
rewrite:

| Hook   | Field                 | Type                       |
| ------ | --------------------- | -------------------------- |
| both   | `context.handler`     | `DomHandler` (htmlparser2) |
| both   | `context.origHtml`    | `string`                   |
| both   | `context.meta`        | `URLMeta`                  |
| both   | `context.htmlcontext` | `HtmlContext`              |
| `post` | `props.setRawHtml`    | `string` (optional)        |

`pre` gives you the parsed document before Scramjet rewrites it; mutate
`context.handler`'s tree and the rewrite runs over your changes. `post` runs
after, and setting `props.setRawHtml` replaces the output wholesale.

Reach for `pre` and the DOM tree rather than string surgery on `setRawHtml`;
regex over rewritten HTML breaks in ways that are hard to attribute.

### What else is on the client

`context.client` in an init hook is a `ScramjetClient`, one per proxied
document. Beyond the hooks, the parts worth knowing:

| Member                 | What it is                                         |
| ---------------------- | -------------------------------------------------- |
| `client.url`           | The real URL of this document, already decoded     |
| `client.global`        | The document's `window` / `self`                   |
| `client.meta`          | `URLMeta`, the base and origin used for rewriting  |
| `client.history`       | Tracked history state for this document            |
| `client.initHeaders`   | The response headers the document arrived with     |
| `client.flagEnabled()` | Resolves a flag for this URL, `siteFlags` included |

`client.url` is the one you will use most: it is how a plugin answers "where is
this frame actually pointed", without unrewriting anything yourself.

---

## The plugins you get for free

From `$scramjetUtils`. All are `ManagedPlugin`s, so they go straight into
`createFrame()`.

| Plugin                    | Constructor               | Name                  | Depends on      |
| ------------------------- | ------------------------- | --------------------- | --------------- |
| `HttpCachePlugin`         | `(options?)`              | `scramjet-http-cache` | nothing         |
| `UrlWatcherPlugin`        | `(onUrlChange, options?)` | `url-watcher`         | nothing         |
| `CatchEscapedLinksPlugin` | `(toLocation)`            | `catch-escaped-links` | nothing         |
| `EventHandlerPlugin`      | `(options?)`              | `event-handler`       | nothing         |
| `LinkHandlerPlugin`       | `(onNewTab, options?)`    | `link-handler`        | `event-handler` |

- **`HttpCachePlugin`** caches subresources so a reload doesn't pull every asset
  back through the tunnel.
- **`UrlWatcherPlugin`** calls back with the frame's URL on every change.
- **`CatchEscapedLinksPlugin`** takes `(url: URL) => string | URL` and redirects
  navigations that would leave the proxy to whatever you return.
- **`EventHandlerPlugin`** lets you register listeners that run _after_ the
  page's own, including after `stopPropagation()`. Its `options.events` is
  documented upstream as defaulting to `click`, `auxclick` and `contextmenu`,
  but 0.0.3 never reads the option: the captured-event list starts empty and
  only `addEventToCapture(name)` adds to it. Call that for each event type you
  need. The list is consulted live, but only as the page registers listeners, so
  anything the page registered before you added the type is already missed.
  Register your types before the frame loads a document.
- **`LinkHandlerPlugin`** turns anchor clicks and middle-clicks into a
  `onNewTab(url)` callback instead of a navigation. Requires
  `EventHandlerPlugin` on the same frame.

```js
const utils = globalThis.$scramjetUtils;

const frame = controller.createFrame(iframe, {
	plugins: [
		new utils.HttpCachePlugin(),
		new utils.UrlWatcherPlugin(url => (address.value = url)),
		new utils.CatchEscapedLinksPlugin(url => new URL("/", location.origin))
	]
});
```

**You almost certainly want `UrlWatcherPlugin`.** Scramjet 2.x has no
`urlchange` event, so it is the only reliable way to know where a frame went. It
fires on real navigations, hash changes, and `history.pushState`. See
[URL parsing and history](../guides/url-parsing-and-history.md).

**`CatchEscapedLinksPlugin` takes a function that returns a URL**, and that URL
is where the escaping navigation gets sent instead. Returning
`new URL(location.href)` cancels it in place; returning a `data:` URL shows a
message; routing back through your own shell lets you open it in a new tab.

---

## Where to go next

- [Config and flags](scramjet-config.md). The other half of controlling
  Scramjet, and the one that decides how the rewriter behaves.
- [Controller and Frame API](controller-api.md). What `frame` is, beyond the
  hooks you tap on it.
- [Known bugs](known-bugs.md). The shipped plugins have two of them.
- [Custom protocols](../guides/custom-protocols.md). `fetch.request` and
  `earlyResponse` applied to internal pages.
- [Cookies and sessions](../guides/cookies-and-sessions.md). What the controller
  owns, and why plugins shouldn't manage cookies themselves.
- [`packages/utils/src/`](https://github.com/MercuryWorkshop/scramjet/tree/main/packages/utils/src)
  upstream is five readable plugins, and the best templates you will find. When
  this page and that source disagree, the source wins.
