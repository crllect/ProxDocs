# Glossary

---

**Bare**. An HTTP protocol where your server performs requests on the client's
behalf. The destination goes in an `X-Bare-URL` header. TLS terminates on your
server, so it can inspect target request and response data. It works on
request/response serverless hosts. See
[Wisp vs Bare](../concepts/wisp-vs-bare.md).

**bare-mux**. A library that puts one transport in a SharedWorker and lets every
context (window, iframes, service worker) share it. Introduced in Ultraviolet
3.0 to make transports swappable. Deprecated as of 2.1.9 in favor of
proxy-transports. See [bare-mux and proxy-transports](../concepts/bare-mux.md).

**bare-as-module3**. The Bare-protocol transport for **bare-mux**, so
Ultraviolet only. Last published 2.2.5, October 2024. The name decodes as "the
TompHTTP **Bare** client, packaged **as a** bare-mux **module**, speaking Bare
protocol version **3**". The `3` is the protocol version, not a package version:
the client builds its endpoint as `/bare/v3/`, and there was never a
`bare-as-module` or `bare-as-module2` on npm. Superseded by `bare-transport`,
below.

**bare-transport**. `@mercuryworkshop/bare-transport`. The Bare-protocol
transport for **proxy-transports**, so usable from Scramjet 2.x. Published 1.0.0
in December 2025. The only transport that works without a WebSocket, which makes
it the one that lets a proxy run all-in-one on request/response serverless
hosts. `proxy-bootstrap` can't wire it yet.

Same project as `bare-as-module3`, renamed in both places: the GitHub repository
is now `MercuryWorkshop/bare-transport`, and the npm package is a **new name**,
which is why it restarted at 1.0.0 while the dead one sits at 2.2.5. The rename
happened because "as a bare-mux module" stopped being true once it was rewritten
against `proxy-transports`. See [Transports](../concepts/transports.md#bare).

**Chemical**. A meta-framework wrapping Ultraviolet, Scramjet and Rammerhead
behind one API. Fastest path if you don't care which engine you get; less useful
if you want to understand the stack.

**Codec**. The function pair encoding a real URL into a proxied path and back.
Ultraviolet defaults to `xor`; Scramjet's controller defaults to
`encodeURIComponent`. **Obfuscation, not encryption**, the key is in the client
bundle. See [Config and flags](scramjet-config.md) and
[URL parsing and history](../guides/url-parsing-and-history.md).

**CookieJar**. In Scramjet 2.x, the single cookie store the controller owns,
keyed by destination origin rather than yours. Persisted to IndexedDB and synced
between tabs over a `BroadcastChannel`. Proxied pages never touch the browser's
real cookie store. See
[Cookies and sessions](../guides/cookies-and-sessions.md).

**Controller**. In Scramjet 2.x, the window-side object that owns the service
worker connection, the transport, the cookie jar, and the frames.
`new Controller({ serviceworker, transport })`. One per page. See
[Wiring Scramjet](../guides/wiring.md) and
[Multiple tabs](../guides/multiple-tabs.md).

**COOP / COEP**. `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy`. Response headers required for cross-origin
isolation, which is required for `SharedArrayBuffer`. Neither engine needs them
to run, but both re-send them onto proxied responses when your shell is
isolated, which is what lets a proxied site use `SharedArrayBuffer` itself. See
[Cross-origin isolation](../concepts/cross-origin-isolation.md).

**Cross-origin isolation**. A browser state where a page has proven no untrusted
cross-origin content shares its process. Grants access to `SharedArrayBuffer`.
Check with `crossOriginIsolated`.

**epoxy**. A TLS and HTTP stack written in Rust, compiled to WebAssembly,
speaking wisp. Lighter and faster than libcurl, slightly pickier on unusual
servers. See [Transports](../concepts/transports.md).

**Flag**. A boolean switch on Scramjet's rewriter, set in
`scramjetConfig.flags`. Thirteen exist in 2.0.67-alpha.2, covering source maps,
error handling, worker encapsulation, and debug output. Flags copied from other
projects are often ones that no longer exist. See
[Config and flags](scramjet-config.md).

**Frame**. In Scramjet 2.x, one browsing context: an iframe plus its own URL
prefix plus its plugins. `controller.createFrame(element, { plugins })`. Each
frame is routed independently, which is what makes real tabs cheap. Upstream has
no removal API, so closing a tab means splicing `controller.frames` yourself.
See [Multiple tabs](../guides/multiple-tabs.md).

**Hook**. A named point in Scramjet's request or page lifecycle where a plugin
can intervene. Fetch hooks (`intercept`, `request`, `preresponse`, `response`)
fire per request; frame hooks (`init.pre`, `init.post`, `error.request`) fire
per document or failure. Each callback gets a read-only `context` and a mutable
`props`. See [Plugins and hooks](plugins-and-hooks.md).

**Interception proxy**. The current architecture: a service worker on your
origin intercepts requests from proxied pages and rewrites the responses. Named
in contrast to server-side rewriting proxies, which can't see requests made by
JavaScript at runtime.

**libcurl**. A build of curl compiled to WebAssembly, speaking wisp. The
best-compatibility transport, and the heaviest. See
[Transports](../concepts/transports.md).

**Plugin**. In Scramjet 2.x, a class extending `ManagedPlugin` whose `install()`
taps a frame's hooks. The supported way to observe navigation, handle errors, or
add caching. `HttpCachePlugin`, `UrlWatcherPlugin`, `CatchEscapedLinksPlugin`
ship in `scramjet-utils`. A bare `Plugin` is a different thing: it can tap a
hook but can't be passed to `createFrame`. See
[Plugins and hooks](plugins-and-hooks.md).

**Prefix**. The path all proxied URLs live under. `__uv$config.prefix` in
Ultraviolet (one, global); `controller.prefix + frameId` in Scramjet 2.x (one
per frame). The service worker's scope has to cover it. See
[Config and flags](scramjet-config.md).

**proxy-bootstrap**. `@mercuryworkshop/proxy-bootstrap`. Resolves and caches its
Scramjet package set at runtime, then serves everything the browser needs. The
shortest path to a working proxy; fixes the transport at server start, so no
runtime switching, and its packages never reach your lockfile. See
[Wiring Scramjet](../guides/wiring.md).

**proxy-transports**. `@mercuryworkshop/proxy-transports`. The interface
transports implement (`request` and `connect`). Successor to bare-mux's
transport interface; a direct dependency of Scramjet 2.x.

**Rammerhead**. A different proxy design, server-side session-based rather than
service-worker-based. Occasionally works where interception proxies don't.

**Rewriter**. The component that transforms HTML, CSS and JavaScript so URLs and
trapped globals point back through the proxy. Ultraviolet's is JavaScript;
Scramjet's is Rust compiled to WebAssembly. Rewriting JavaScript correctly and
quickly is the hard problem in this space. See
[How a proxy works](../concepts/how-proxies-work.md).

**Scramjet**. The current-generation interception proxy from Mercury Workshop.
Rust/WASM rewriter, wisp transport, frames and plugins. Successor to
Ultraviolet. See [Scramjet vs Ultraviolet](../concepts/engines.md).

**Service worker**. A browser-provided worker that can intercept network
requests from pages on its origin and synthesise responses. The primitive the
whole architecture rests on. Requires HTTPS, and has a scope that limits which
URLs it controls. See [How a proxy works](../concepts/how-proxies-work.md).

**SharedArrayBuffer**. Memory shared between JavaScript and WebAssembly without
copying. Disabled after Spectre; re-enabled only for cross-origin isolated
pages. Neither engine's rewriter uses it, and neither do the epoxy or libcurl
transports, all of which are built single-threaded. Scramjet touches it in
exactly one place, behind the `syncxhr` flag. What it matters for is _proxied_
sites that use it themselves. See
[Cross-origin isolation](../concepts/cross-origin-isolation.md).

**Session**. Not an engine term. In this documentation's generated code, the
uniform per-tab object the engine adapter exposes (`go`, `back`, `forward`,
`reload`, `destroy`), so feature code never touches the engine directly.

**siteFlags**. Per-origin flag overrides, keyed by regular expression source
strings tested against the full URL. First match wins, and only for flags
present in that entry. The right tool when one site needs different rewriter
behavior. See [Config and flags](scramjet-config.md).

**Transport**. Client-side code that performs requests. epoxy, libcurl, bare.
Chosen independently of the rewriter. See
[Transports](../concepts/transports.md).

**Ultraviolet**. The previous-generation interception proxy from
TitaniumNetwork. JavaScript rewriter, bare-mux transports. Unmaintained, last
released October 2024 at 3.2.10; the repository is open but its README points at
Scramjet. Still widely deployed, and the option for an all-in-one build whose
backend can't host Wisp. See [Scramjet vs Ultraviolet](../concepts/engines.md).

**UrlWatcherPlugin**. The Scramjet 2.x plugin that reports the real URL of a
frame. There is no `urlchange` event; this is how you know where the page went.
Fires for navigations, hash changes, and `history.pushState`. See
[Plugins and hooks](plugins-and-hooks.md).

**Wisp**. A multiplexing protocol carrying many TCP/UDP streams over one
WebSocket. For HTTPS destinations, target TLS terminates in the browser and the
relay sees ciphertext plus connection metadata. HTTP destinations aren't
encrypted end to end. Wisp requires a persistent WebSocket, which rules out most
request/response serverless hosting. See
[Wisp vs Bare](../concepts/wisp-vs-bare.md).
