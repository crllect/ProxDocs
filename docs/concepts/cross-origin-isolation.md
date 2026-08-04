# Cross-origin isolation

If you take one thing from this page: **Scramjet will not work unless your
server sends two specific headers**, and the failure mode gives you almost no
useful information.

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

---

## Why it is needed

Scramjet's rewriter is WebAssembly, and it uses **`SharedArrayBuffer`** to move
data between JavaScript and wasm without copying, necessary when you are
rewriting megabytes of JavaScript per page load.

To use `SharedArrayBuffer`, the page must be **cross-origin
isolated**. That means proving no untrusted cross-origin content shares your
process. You prove it with those two headers.

So the chain is:

```text
Scramjet needs a fast rewriter
  → written in wasm
    → needs SharedArrayBuffer
      → needs cross-origin isolation
        → needs COOP + COEP on every response
          → and needs a secure context, so HTTPS
```

Ultraviolet's rewriter is plain JavaScript, so none of this applies. That is a
real part of why UV still gets deployed.

---

## What each header does

### `Cross-Origin-Opener-Policy: same-origin`

Severs the relationship between your page and any window that opened it or that
you open, unless it is same-origin. `window.opener` becomes `null` across
origins.

Without this, a cross-origin opener could share your process.

**What it breaks:** OAuth popups and payment flows that post back to
`window.opener`. If your site has a "Sign in with…" popup, it stops working.
`same-origin-allow-popups` relaxes this for windows _you_ open, but it is not
sufficient for isolation, so it is not an option if you need Scramjet.

### `Cross-Origin-Embedder-Policy: require-corp`

Every cross-origin subresource must explicitly opt in to being embedded, by
sending `Cross-Origin-Resource-Policy: cross-origin` or by being fetched with
CORS.

Without this, you could embed a cross-origin image and read it through a timing
side channel.

**What it breaks:** every third-party asset that does not send CORP. Google
Fonts, a CDN script, an analytics pixel, an external favicon, all blocked, and
the console message is not always obvious.

There is a gentler value, `credentialless`, which sends cross-origin no-cors
requests without credentials instead of requiring opt-in. It also grants
isolation and breaks less. Support is good in Chromium and Firefox; Safari
lagged. `require-corp` is the safe default; `credentialless` is worth trying if
third-party assets are a problem for you.

---

## Setting them

Express:

```js
app.use((_req, res, next) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	next();
});
```

Register it **before** your static handler and before any proxy routes, so it
covers every response including assets. See
[Other frameworks](../guides/frameworks.md) for Fastify, Hono, Vite, and
Next.js.

---

## Checking it worked

In the console of your page:

```js
crossOriginIsolated;
```

The value must be `true`. If it is `false`, `SharedArrayBuffer` is unavailable
and Scramjet cannot initialise. Check in order:

1. **Both headers present** on the _document_ response, not just on assets. Look
   at the Network tab, select the document request, read the response headers.
2. **Secure context.** `https://`, or `http://localhost`. A LAN address like
   `http://192.168.1.5:8080` is _not_ a secure context and will not isolate.
3. **Nothing stripping them.** Cloudflare, an nginx `proxy_pass`, or a hosting
   layer can drop or override response headers.
4. **Every embedded resource sends CORP** under `require-corp`, or is
   same-origin.

---

## The symptoms

The failure is bad because it is silent and late. The page loads. The UI
renders. Then navigation does nothing, or the console shows something about wasm
or `SharedArrayBuffer` that does not mention headers at all.

Common presentations:

| Symptom                                                | Cause                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `SharedArrayBuffer is not defined`                     | Not isolated. Check headers.                                     |
| `crossOriginIsolated === false` but headers look right | Not a secure context, or a proxy stripped them                   |
| Page loads, iframe stays blank, no errors              | Usually isolation; check `crossOriginIsolated` first             |
| Works on localhost, breaks in production               | HTTPS missing, or your host rewrites headers                     |
| Google Fonts / CDN assets 404 or blocked               | `require-corp` blocking them. Self-host, or try `credentialless` |
| OAuth popup can no longer reach `window.opener`        | COOP. Expected; no way around it with full isolation             |

Test isolation _first_ whenever a Scramjet setup misbehaves. It costs one line
and rules out the most common cause.

---

## Practical consequences

**Self-host your assets.** Under `require-corp`, fonts, icons, and scripts from
a CDN need CORP headers you do not control. Self-hosting is simpler than
fighting it, and faster anyway.

**Your proxy page cannot be embedded casually.** COOP/COEP constrain how other
pages interact with yours. If you intend to embed your proxy in another site,
work that out early.

**`about:blank` cloaking interacts with COOP.** Opening `about:blank` and
injecting an iframe still works. `about:blank` inherits the opener's origin. But
the isolation relationship is subtle and browser-dependent. Test it rather than
assuming. See [Running a proxy site well](../guides/site-best-practices.md).

**Localhost is exempt from HTTPS, not from headers.** You still need COOP/COEP
in development. The generated servers set them in both cases.
