# Known bugs

Upstream bugs in the packages this site documents, each with the symptom you
would actually see, the code responsible, and what to do about it.

Nothing here is a bug in your project. If a symptom on this page matches what
you are looking at, stop debugging your own code.

Every entry was verified against the **published** package, not `main`. Versions
in each heading. When upstream ships a fix, the entry stays with a note rather
than disappearing, because most people are running an older release than you
think.

> **Found another one?** Open an issue with the symptom, the snippet, and the
> version. The rule for this page is symptom first, then proof: an entry without
> a line of code behind it is a rumour.

---

## `@mercuryworkshop/wisp-js` 0.4.1

### Writing to a socket that just closed throws

**Symptom.** An error in your Wisp server log, most often while switching
transports or when a site hangs up mid-request:

```text
error: (a7fe064d) a ws to tcp/udp task encountered an error -
TypeError: null is not an object (evaluating 'this.socket.write')
```

On Node the same error reads `Cannot read properties of null (reading 'write')`.
The JavaScriptCore wording above means the server is running under Bun.

**The code**, in `src/server/net.mjs`:

```js
async send(data) {
	await new Promise(resolve => {
		this.socket.write(data, resolve); // no null check
	});
}
```

Three separate paths set `this.socket = null`: the socket's `close` handler, its
`end` handler, and `close()`. Any queued WebSocket-to-TCP write that lands after
the destination hung up dereferences null.

**It is benign.** `ServerStream.setup()` wraps both pump tasks in `.catch()`, so
the error is caught, that one stream closes, and the process and the Wisp
connection are unaffected. The paired `tcp_to_ws` task still calls
`close_stream(id, Voluntary)`, so the client is told and the stream table does
not leak. The only cost is that bytes still queued for that stream are dropped,
which does not matter because the peer was already gone.

**Worry only if it repeats in a tight loop.** That is a client retry storm or a
peer resetting every connection, and the log line is the symptom rather than the
cause.

**Fix**, if you are patching locally or sending a PR upstream:

```js
async send(data) {
	if (!this.socket) return;
	await new Promise(resolve => this.socket.write(data, resolve));
}
```

### `client_ip_blacklist` and `client_ip_whitelist` do nothing

**Symptom.** You set them, and blocked clients connect anyway. No error, no log
line.

**The code**, in `src/server/options.mjs`:

```js
	//client connection restrictions
	client_ip_blacklist: null, //not implemented!
	client_ip_whitelist: null, //not implemented!
```

Nothing reads them. Block client addresses at your reverse proxy or firewall
instead. See [running a proxy](../guides/running-a-proxy.md).

---

## `@mercuryworkshop/scramjet` 2.0.67-alpha.2

### `history.pushState` with fewer than three arguments navigates to `/undefined`

**Symptom.** A single-page app navigates itself to `/undefined`. Affects any
site, not one search engine, and SPAs call this constantly.

**The code**, in `core/src/client/dom/history.ts`:

```js
const url = String(ctx.args[2]);

if (url || url === "") ctx.args[2] = relevantclient.rewriteUrl(url);
```

Omitting the URL argument is legal and means "keep the current URL".
`String(undefined)` is the string `"undefined"`, which is truthy, so the guard
passes and a missing argument is rewritten into a real path.

**Status: fixed on `main`, not in any published release.** The fix only
stringifies when the argument is present:

```js
const url = ctx.args[2] ? String(ctx.args[2]) : undefined;
```

Generated projects ship a compatibility plugin that supplies the frame's current
URL when either History method omits it. The full workaround, including its
top-level-only scope, is in
[troubleshooting](troubleshooting.md#sites-become-undefined).

### `syncxhr` is unimplemented, not merely off

**Symptom.** With the flag off, which is the default, a synchronous
`XMLHttpRequest` is dropped and the console says
`ignoring request - sync xhr disabled in flags`. Turn the flag on to fix that
and it throws instead.

**The code**, in `core/src/client/shared/requests/xmlhttprequest.ts`:

```js
export default function (client: ScramjetClient, self: Self) {
	let worker;
	// if (self.Worker && flagEnabled("syncxhr", client.url)) {
	// 	worker = client.natives.construct("Worker", config.files.sync);
	// }
```

`worker` stays `undefined`, and the enabled path posts to it. The scaffolding is
there and will probably land in a later alpha. Until then, sites that need sync
XHR break either way. See [config and flags](scramjet-config.md#flags).

### The published type declarations do not resolve

**Symptom.** A TypeScript project with `skipLibCheck: false` gets a wall of
errors from inside `node_modules`, ending with the confusing claim that the
package exports nothing:

```text
node_modules/@mercuryworkshop/scramjet/dist/types/client/client.d.ts(4,69):
  error TS2307: Cannot find module '@/shared' or its corresponding type declarations.
node_modules/@mercuryworkshop/scramjet-controller/dist/types/index.d.ts(3,10):
  error TS2305: Module '"@mercuryworkshop/scramjet"' has no exported member 'ScramjetFetchHandler'.
```

**The cause.** `dist/types/` still contains the build's internal path aliases,
`@/shared`, `@/fetch`, `@rewriters/url`, `@client/events`, and nothing on your
side resolves them.

**Workaround: `skipLibCheck: true`**, which is the default in most setups and in
every project this builder generates. The exported classes then type correctly.

### `unrewriteUrl` does not round-trip `javascript:` URLs

**Symptom.** You unrewrite a `javascript:` URL and get back exactly what you
passed in, rewritten body and all.

**The code**, in `core/src/shared/rewriters/url.ts`:

```js
export function unrewriteUrl(url: string | URL, context: ScramjetContext) {
	url = String(url);
	if (url.startsWith("javascript:")) {
		//TODO
		return url;
	}
```

`rewriteUrl` does handle them, rewriting the body as JavaScript. Only the
reverse is missing. Do not rely on round-tripping one. See
[core API](core-api.md#url-rewriting).

### An idle service worker forgets every route

**Symptom.** The proxy works, the tab sits quiet for a minute or two, and the
next navigation shows your own server's 404:

```text
Cannot GET /~/sj/<controller>/<frame>/https%3A%2F%2F...
```

The worker keeps its routable prefixes in module scope, so a browser-terminated
worker wakes up with an empty table and `shouldRoute()` returns `false` for
every proxied URL. The `$controller$swrevive` handshake exists for this and does
not fire in time for the navigation that woke the worker.

**Workaround.** Ping the worker every 15 seconds, which is what generated
projects do. Measurements, recovery matrix and the ping itself are in
[troubleshooting](troubleshooting.md#cannot-get-sj-after-the-tab-has-been-sitting-idle).

---

## `@mercuryworkshop/scramjet-controller` 0.0.14

### `controller.isReady` is always `false`

**Symptom.** You branch on it and the branch never runs, even long after the
controller is up.

**The code**, in `controller/src/index.ts`:

```ts
public isReady: boolean = false;
```

That is the only occurrence in the file. Nothing ever assigns it. Use
`await controller.wait()`.

### `createFrame()` cannot catch you calling it too early

**Symptom.** A frame created before the controller is ready comes back normally,
and then the first navigation lands on your own 404 because the worker is not
routing that prefix yet.

**The code**:

```ts
createFrame(element?: HTMLIFrameElement, options: FrameOptions = {}): Frame {
	if (!this.ready) {
		throw new Error("Controller is not ready! Try awaiting controller.wait()");
	}
```

`this.ready` is a `Promise` the constructor always assigns, so it is always
truthy and the guard can never fire. The error message describes a check that
does not happen. Await `wait()`; nothing will remind you.

### The controller's own `allowFailedIntercepts` is reverted by the merge

**Symptom.** You read `controller.scramjetConfig.flags.allowFailedIntercepts`
expecting `true`, because the controller sets it for itself, and it is `false`.

**The code**:

```ts
const scramjetConfig: Partial<ScramjetConfig> = {
	flags: { ...scramjetDefaultConfig.flags, allowFailedIntercepts: true },
	maskedfiles: ["inject.js", "scramjet.wasm.js"]
};

// later, in the constructor
this.scramjetConfig = deepMerge(scramjetConfig, scramjetDefaultConfig);
```

`@fastify/deepmerge` lets the second argument win, so upstream's default `false`
is applied _after_ the controller's `true`. Set it yourself if you want it. Full
merge behaviour, including why `maskedfiles` survives, is in
[config and flags](scramjet-config.md#flags).

### Most of the package's types cannot be imported

**Symptom.**
`import type { TransferRequest } from "@mercuryworkshop/scramjet-controller"`
fails. Deriving the type through the class compiles and silently gives you
`any`:

```ts
// resolves to `any`, so nothing is type-checked
type Req = Frame["hooks"]["error"]["request"]["context"]["rawrequest"];
```

**The cause.** `index.ts` imports from `./types` without re-exporting, so those
names never reach `typesEntry.d.ts`, and the published package does not ship
`types.d.ts` at all while `dist/types/index.d.ts` still imports from it. The
`exports` map declares only `"."`, so there is no deep import either.

Restate the shapes locally. They are listed field by field in
[the controller API](controller-api.md#every-type-in-the-package).

---

## `@mercuryworkshop/scramjet-utils` 0.0.3

### `EventHandlerPlugin` ignores its `events` option

**Symptom.** You pass `{ events: ["click", "keydown"] }`, and no listener you
register ever fires, because nothing is being captured.

**The code**, in `utils/src/event-handler-plugin.ts`:

```ts
export type EventHandlerPluginOptions = {
	/** Bubble-phase event types to track. Defaults to click, auxclick, and contextmenu. */
	events?: string[];
};

// ...
private eventsToCapture: string[] = [];
constructor(private options: EventHandlerPluginOptions = {}) {
```

The documented default never happens: the list starts empty and only
`addEventToCapture(name)` adds to it. Call that for each type you need, before
the frame loads a document, since the list is consulted as the page registers
listeners.

### `UrlWatcherPlugin` fires twice on a hash change

**Symptom.** Duplicate URL callbacks, so a naive history log records the same
entry twice.

**The code**, in `utils/src/url-watcher.ts`, with upstream's own note:

```ts
this.tap(context.client.hooks.lifecycle.navigate, (_context, props) => {
	this.onUrlChange(props.url);
});

// TODO: this will probably make it fire twice if it was triggered by location.hash
context.window.addEventListener("hashchange", notify, { capture: true });
```

Make your handler idempotent. The generated `record()` already is. See
[URL parsing and history](../guides/url-parsing-and-history.md).

---

## `@tomphttp/bare-server-node` 2.0.6

### The default local-IP filter misses IPv6 literals

**Symptom.** With `blockLocal` at its default `true`, a request to
`http://127.0.0.1:9200` is refused and `http://[::1]:9200` is not.

**The code**, in `src/createServer.ts`:

```js
init.filterRemote ??= url => {
	if (isValid(url.hostname) && parse(url.hostname).range() !== "unicast")
		throw new RangeError("Forbidden IP");
};
```

`url.hostname` keeps the square brackets for an IPv6 literal, and
`ipaddr.isValid("[::1]")` is `false`, so the check is skipped. The DNS-side
`lookup` guard still covers hostnames that _resolve_ to a local address; this
only affects literals.

**Fix**, which is what generated projects ship:

```js
filterRemote(url) {
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	if (ipaddr.isValid(hostname) && ipaddr.parse(hostname).range() !== "unicast") {
		throw new RangeError("Forbidden IP");
	}
}
```

Supplying your own `filterRemote` replaces the default one but leaves the
default `lookup` in place. See
[serverless deployment](../guides/serverless.md#configuring-the-bare-server).

---

## `@mercuryworkshop/epoxy-transport` 3.0.1

### `epoxyPath` is shipped but unreachable

**Symptom.** `import { epoxyPath } from "@mercuryworkshop/epoxy-transport/node"`
fails to resolve, and importing the package root in Node throws instead, because
that is the browser bundle.

**The cause.** The package still contains `lib/index.cjs` exporting `epoxyPath`,
but its `exports` map declares only `"."`:

```json
{ ".": { "import": "./dist/index.mjs", "require": "./dist/index.js" } }
```

Resolve the directory yourself instead of reaching around it:

```js
const require = createRequire(import.meta.url);
const dirOf = specifier => path.dirname(require.resolve(specifier));
app.use("/epoxy/", express.static(dirOf("@mercuryworkshop/epoxy-transport")));
```

libcurl 2.x dropped its helper outright. See
[breaking changes](breaking-changes.md#transport-path-helpers-removed).

---

## Where to go next

- [Troubleshooting](troubleshooting.md). Symptoms whose cause is your setup
  rather than an upstream bug.
- [Site compatibility](site-compatibility.md). Sites that fail for reasons no
  bug fix will change.
- [Version matrix](versions.md). What to pin, and what a mismatched pair does.
- [Inside Scramjet](../concepts/scramjet-internals.md). How to confirm any of
  this yourself, and what a good upstream report contains.
