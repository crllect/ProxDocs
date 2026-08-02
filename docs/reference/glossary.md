# Glossary

---

**Bare**. An HTTP protocol where your server performs requests on the client's
behalf. The destination goes in an `X-Bare-URL` header. TLS terminates on your
server, so it can inspect target request and response data. It works on
request/response serverless hosts. See
[Wisp vs Bare](../concepts/wisp-vs-bare.md).

**bare-mux**. A library that puts one transport in a SharedWorker and lets every
context (window, iframes, service worker) share it. Introduced in Ultraviolet
3.0 to make transports swappable. Deprecated as of 2.1.9 in favour of
proxy-transports. See [bare-mux and proxy-transports](../concepts/bare-mux.md).

**bare-as-module3**. The bare-mux transport that speaks the Bare protocol. The
only transport that works without WebSockets.

**Chemical**. A meta-framework wrapping Ultraviolet, Scramjet and Rammerhead
behind one API. Fastest path if you do not care which engine you get; less
useful if you want to understand the stack.

**Codec**. The function pair encoding a real URL into a proxied path and back.
Ultraviolet defaults to `xor`; Scramjet's controller defaults to
`encodeURIComponent`. **Obfuscation, not encryption**, the key is in the client
bundle.

**Controller**. In Scramjet 2.x, the window-side object that owns the service
worker connection, the transport, the cookie jar, and the frames.
`new Controller({ serviceworker, transport })`.

**COOP / COEP**. `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy`. Response headers required for cross-origin
isolation, which is required for `SharedArrayBuffer`, which Scramjet's wasm
rewriter needs. See
[Cross-origin isolation](../concepts/cross-origin-isolation.md).

**Cross-origin isolation**. A browser state where a page has proven no untrusted
cross-origin content shares its process. Grants access to `SharedArrayBuffer`.
Check with `crossOriginIsolated`.

**epoxy**. A TLS and HTTP stack written in Rust, compiled to WebAssembly,
speaking wisp. Lighter and faster than libcurl, slightly pickier on unusual
servers. See [Transports](../concepts/transports.md).

**Frame**. In Scramjet 2.x, one browsing context: an iframe plus its own URL
prefix plus its plugins. `controller.createFrame(element, { plugins })`. Each
frame is routed independently, which is what makes real tabs cheap.

**Interception proxy**. The current architecture: a service worker on your
origin intercepts requests from proxied pages and rewrites the responses. Named
in contrast to server-side rewriting proxies, which cannot see requests made by
JavaScript at runtime.

**libcurl**. A build of curl compiled to WebAssembly, speaking wisp. The
best-compatibility transport, and the heaviest.

**Plugin**. In Scramjet 2.x, a class extending `ManagedPlugin` whose `install()`
taps a frame's hooks. The supported way to observe navigation, handle errors, or
add caching. `HttpCachePlugin`, `UrlWatcherPlugin`, `CatchEscapedLinksPlugin`
ship in `scramjet-utils`.

**Prefix**. The path all proxied URLs live under. `__uv$config.prefix` in
Ultraviolet (one, global); `controller.prefix + frameId` in Scramjet 2.x (one
per frame).

**proxy-bootstrap**. `@mercuryworkshop/proxy-bootstrap`. Resolves and caches its
Scramjet package set at runtime, then serves everything the browser needs. The
shortest path to a working proxy; fixes the transport at server start, so no
runtime switching.

**proxy-transports**. `@mercuryworkshop/proxy-transports`. The interface
transports implement (`request` and `connect`). Successor to bare-mux's
transport interface; a direct dependency of Scramjet 2.x.

**Rammerhead**. A different proxy design, server-side session-based rather than
service-worker-based. Occasionally works where interception proxies do not.

**Rewriter**. The component that transforms HTML, CSS and JavaScript so URLs and
trapped globals point back through the proxy. Ultraviolet's is JavaScript;
Scramjet's is Rust compiled to WebAssembly. Rewriting JavaScript correctly and
quickly is the hard problem in this space.

**Scramjet**. The current-generation interception proxy from Mercury Workshop.
Rust/WASM rewriter, wisp transport, frames and plugins. Successor to
Ultraviolet.

**Service worker**. A browser-provided worker that can intercept network
requests from pages on its origin and synthesise responses. The primitive the
whole architecture rests on. Requires HTTPS, and has a scope that limits which
URLs it controls.

**SharedArrayBuffer**. Memory shared between JavaScript and WebAssembly without
copying. Disabled after Spectre; re-enabled only for cross-origin isolated
pages. Scramjet needs it; Ultraviolet does not.

**Session**. Not an engine term. In this documentation's generated code, the
uniform per-tab object that both engine adapters expose (`go`, `back`,
`forward`, `reload`, `destroy`), so features work on either engine.

**Transport**. Client-side code that performs requests. epoxy, libcurl, bare.
Chosen independently of the rewriter. See
[Transports](../concepts/transports.md).

**Ultraviolet**. The previous-generation interception proxy from
TitaniumNetwork. JavaScript rewriter, bare-mux transports. Archived October 2024
at 3.2.10. Still widely deployed, and the option for an all-in-one build whose
backend cannot host Wisp.

**UrlWatcherPlugin**. The Scramjet 2.x plugin that reports the real URL of a
frame. There is no `urlchange` event; this is how you know where the page went.
Fires for navigations, hash changes, and `history.pushState`.

**Wisp**. A multiplexing protocol carrying many TCP/UDP streams over one
WebSocket. For HTTPS destinations, target TLS terminates in the browser and the
relay sees ciphertext plus connection metadata. HTTP destinations are not
encrypted end to end. Wisp requires a persistent WebSocket, which rules out most
request/response serverless hosting. See
[Wisp vs Bare](../concepts/wisp-vs-bare.md).
