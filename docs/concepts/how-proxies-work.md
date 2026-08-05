# How a modern web proxy works

The stack has four layers. Identifying the layer responsible for a URL, login,
or WebSocket problem narrows down where to debug it.

Unfamiliar term? The [glossary](../reference/glossary.md) defines every one of
them in a line, with a link to the page that goes deeper.

---

## The problem being solved

You want `https://crllect.dev` to render inside a page you control, on a domain
you control. The browser will not let you do that directly:

- **CORS** blocks reading `fetch("https://crllect.dev")` cross-origin.
- **`X-Frame-Options` / `frame-ancestors`** blocks putting it in an `<iframe>`.
- Even if you got the HTML, every relative URL inside it (`/style.css`,
  `/api/user`) would resolve against _your_ domain, not theirs.

So a proxy has to do two separate jobs, and people constantly conflate them:

1. **Fetch** the bytes from the remote server, from somewhere that isn't
   restricted by the browser's origin rules. → _the transport problem_
2. **Rewrite** those bytes so that every URL, every script, every cookie inside
   them points back through the proxy instead of at the real site. → _the
   rewriting problem_

Wisp, Bare, epoxy, libcurl are all answers to **problem 1**. Scramjet is the
answer to **problem 2**.

Architecture questions are easier once you identify which of those two jobs a
component performs.

---

## Layer 1: the frontend

Plain HTML/CSS/JS that you write. A URL bar, a settings page, an `<iframe>`.
Nothing proxy-specific. This is the part you design.

Its only proxy-related job is to turn user input into a real URL and hand it to
layer 2. See [URL parsing and history](../guides/url-parsing-and-history.md). It
is much easier to get wrong than it looks.

## Layer 2: the rewriter (the "proxy" proper)

The [engine](engines.md) lives here. A **service worker** registered on your
origin intercepts every request the proxied page makes, and the rewriter
transforms the response before the browser sees it.

**The two halves of that sentence run in different places**, and Scramjet 2.x is
explicit about it. The service worker only intercepts and forwards: it hands the
raw request to your page over a `MessagePort` and waits for a reply. The
controller in your page does the real work, because that is where the wasm
rewriter, the cookie jar, and the transport all live. Once you know that, three
otherwise strange things make sense: a terminated service worker forgets its
routing table and needs a [keepalive](../guides/wiring.md#the-keepalive);
plugins tap hooks on the page, not in the worker; and your tunnel opens from the
tab, so closing the tab closes it.

This is called an **interception proxy**, and it is what makes the modern
generation different from old server-side proxies:

- The site runs **in the browser**, on _your_ origin, inside an iframe.
- The rewriter replaces APIs such as `fetch`, `XMLHttpRequest`, `WebSocket`,
  `importScripts`, and workers. The service worker intercepts the resulting HTTP
  requests; WebSocket shims use the transport directly.
- JavaScript is rewritten too, not just HTML. `location.href`, `window.parent`,
  `document.cookie` are all trapped so the page cannot tell it is being proxied
  and cannot escape to your real origin.

The rewriter is why `https://crllect.dev/foo` becomes
`https://proxy.crllect.dev/~/sj/<controller>/<frame>/https%3A%2F%2Fcrllect.dev%2Ffoo`
in a Scramjet 2 [frame](../guides/multiple-tabs.md).

> **Why a service worker?** It is the only browser API that lets you intercept
> and synthesise responses for requests you did not initiate, on your own
> origin, including subresources. That is exactly the primitive an interception
> proxy needs. The cost is that service workers require HTTPS (or `localhost`)
> and have a scope, which is why [deployment](../guides/deployment.md) is
> fussier than for a normal site.

## Layer 3: the transport

The controller now has a decoded request and needs the response bytes. It cannot
just `fetch()` them, because CORS applies the same way in a page as in a service
worker. So it hands the request to a **transport**: client-side code whose job
is to get an arbitrary HTTP request executed somewhere unrestricted and hand the
response back.

Transports are pluggable. `epoxy` and `libcurl` are full TCP/TLS stacks compiled
to WebAssembly that run **inside your browser** and speak to the server over a
raw byte tunnel. The older `bare` transport instead asks a server to do the
whole request on your behalf.

See [Transports](transports.md) and [Wisp vs Bare](wisp-vs-bare.md).

## Layer 4: the server

Two separate jobs:

1. **Serve static files**. Your frontend, plus the proxy's own bundles
   (`scramjet.js`, the wasm rewriter, the transport client).
2. **Run the tunnel endpoint**. A **Wisp** server on a WebSocket route, or a
   **bare** server on an HTTP route.

Static assets run anywhere. A Wisp relay needs a long-lived WebSocket, which
request/response functions cannot hold open. The
[serverless guide](../guides/serverless.md) covers the two ways around that: an
all-in-one build over Bare, or a static frontend pointed at Wisp on another
host.

---

## Following one request end to end

You type `crllect.dev` and press enter.

1. **Frontend** parses your input into `https://crllect.dev` and calls
   `frame.go("https://crllect.dev")`.
2. **Rewriter (window side)** encodes that into a proxied path and sets
   `iframe.src` to `/~/sj/<controller>/<frame>/https%3A%2F%2Fcrllect.dev`.
3. The iframe navigates. Because it is on your origin and inside the service
   worker's scope, the **service worker** intercepts the request.
4. The worker recognises the path as one of its registered frame prefixes and
   **forwards the request to your page**, over the `MessagePort` the controller
   handed it at startup. It does not decode, rewrite, or fetch anything itself.
5. The **controller**, in your page, decodes the path back to
   `https://crllect.dev` and builds the real outbound request, fixing up `Host`,
   `Referer`, `Origin` and cookies from its own jar. This is where
   [`fetch.request`](../reference/plugins-and-hooks.md#fetchrequest) fires.
6. It hands that request to the **transport**, also running in your page.
7. **libcurl/epoxy** opens a stream over the **Wisp** WebSocket to your server.
   Your Wisp server opens a TCP socket to `crllect.dev:443` and pipes bytes.
   **TLS is negotiated inside the browser**, between the WebAssembly stack and
   `crllect.dev`. A passive Wisp relay sees ciphertext plus connection metadata.
8. The response comes back to the page, and the **rewriter** runs there: every
   `href`, `src`, inline script, and stylesheet URL is rewritten to point back
   through the proxy. `<script>` contents are parsed and rewritten so
   `location`, `fetch`, `postMessage` etc. hit the proxy's shims. The rewriter
   is wasm, and it was loaded into the page by `controller.wait()`.
9. The rewritten response goes back over the port as a plain object, the service
   worker turns it into a `Response`, and the iframe renders it. Every
   subsequent request it makes repeats from step 3.

Those nine steps identify where to start debugging a failed request. The handoff
at step 4 is the one people do not expect: if you are looking for the code that
fetched or rewrote something, it is in the tab's console, not the worker's.

---

## What this architecture buys you, and what it costs

**Buys you:**

- JavaScript-created URLs and WebSockets can be handled at runtime.
- With epoxy/libcurl, the Wisp relay does not terminate target TLS. The relay
  sees destinations, sizes, timing, and encrypted bytes. An operator that also
  controls the client code could still modify it to expose plaintext.

**Costs you:**

- A service worker, so **HTTPS is mandatory** in production.
- **Cross-origin isolation headers**, which no engine strictly requires but
  every serious deployment should send, because they are what let proxied sites
  use `SharedArrayBuffer`. See
  [Cross-origin isolation](cross-origin-isolation.md).
- Wisp needs a **persistent WebSocket**, so request/response functions cannot
  host the relay. The client and relay may be deployed separately.
- Rewriting JavaScript correctly is hard. This is a common reason sites break,
  and the reason [the engine](engines.md) is the part of the stack that took the
  longest to get right.

---

## Next

- [Wisp vs Bare](wisp-vs-bare.md). The two tunnel protocols, and why wisp won.
- [Transports](transports.md). Epoxy, libcurl, bare, and how to choose.
- [Proxy engines](engines.md), what the rewriter does and which one to use.
