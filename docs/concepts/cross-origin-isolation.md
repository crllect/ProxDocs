# Cross-origin isolation

Send these two headers.

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

They are optional. Scramjet runs fine without them. Not sending them is still
stupid, and the rest of this page is why.

---

## Why it is needed

Setting these headers makes **your** page cross-origin isolated, which is what
grants access to `SharedArrayBuffer`. That much is ordinary web platform
behavior. The part that matters for a proxy is what happens next: when your
shell is isolated, Scramjet stamps `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` onto every proxied document,
iframe, worker, sharedworker, script and stylesheet on the way back out.

Isolation propagates into the sites you proxy:

```text
Your server sends COOP + COEP
  → your shell is cross-origin isolated
    → the engine re-sends both headers on every proxied response
      → proxied pages are isolated too
        → sites that need SharedArrayBuffer actually work
          → and all of it needs a secure context, so HTTPS
```

Skip the headers and that chain never starts. The engine itself keeps running,
since Scramjet's wasm [rewriter](how-proxies-work.md) is single-threaded and
doesn't use `SharedArrayBuffer`. What you lose is every proxied site that wants
it: `ffmpeg.wasm` video tools, emulators, wasm-threaded ML, some editors.

Be realistic about the size of that set. Most sites never touch
`SharedArrayBuffer`, and many libraries that use it fall back to a
single-threaded path instead of failing, so the usual symptom is "much slower
than it should be" rather than a hard break. When it does break, it breaks from
inside the frame, in somebody else's minified code, with nothing pointing back
at a header you didn't send.

Here is the whole bill for turning them on. `require-corp` blocks cross-origin
assets in your own shell that don't opt in, which in practice means other
people's favicons and images rather than your fonts or your CDN, since those opt
in already. `same-origin` cuts `window.opener`, so popup OAuth in your shell can
stop working.

Weigh that against what you get, which is a class of sites that otherwise dies. That trade, is retarded.

There is one place Scramjet reaches for isolation in your own shell: the
`syncxhr` flag, which is off by default and which should allocate a
`SharedArrayBuffer` when on. But its currently broken, so it isn't an argument for
the headers either way. See
[config and flags](../reference/scramjet-config.md#flags).

**Ultraviolet does the same thing**, and does it correctly. Its service worker
re-sends `Cross-Origin-Embedder-Policy: require-corp` on proxied responses when
the shell is isolated. It never sets `Cross-Origin-Opener-Policy`, and it does
not need to: **COOP only applies to top-level documents.** On a nested browsing
context it is ignored, so an iframe is isolated when the top-level page is
isolated and the frame itself carries COEP. That is exactly what UV sends.

Scramjet sets both on proxied responses. The COOP half is doing nothing for
frames; it costs nothing either.

---

## What each header does

### `Cross-Origin-Opener-Policy: same-origin`

Severs the relationship between your page and any window that opened it or that
you open, unless it is same-origin. `window.opener` becomes `null` across
origins.

Without this, a cross-origin opener could share your process.

**What it breaks:** OAuth popups and payment flows that post back to
`window.opener`. If your site has a "Sign in with…" popup, it stops working.
`same-origin-allow-popups` relaxes this for windows _you_ open, but it isn't
sufficient for isolation, so it isn't an option if you need Scramjet.

### `Cross-Origin-Embedder-Policy: require-corp`

Every cross-origin subresource must explicitly opt in to being embedded, by
sending `Cross-Origin-Resource-Policy: cross-origin` or by being fetched with
CORS.

Without this, you could embed a cross-origin image and read it through a timing
side channel.

**What it breaks is narrower than the warnings suggest**, because the big hosts
fixed themselves years ago. Measured against a real `require-corp` page: Google
Fonts, jsDelivr, cdnjs and unpkg all send
`Cross-Origin-Resource-Policy: cross-origin` and load fine.

What actually dies is other people's images, favicons above all:

| Resource                                             | Sends              | Under `require-corp` |
| ---------------------------------------------------- | ------------------ | -------------------- |
| `fonts.googleapis.com`, `cdnjs`, `jsdelivr`, `unpkg` | CORP               | loads                |
| `github.com/favicon.ico`                             | nothing            | blocked              |
| `en.wikipedia.org/favicon.ico`                       | `ACAO: *`, no CORP | blocked              |
| `cdn.discordapp.com` images                          | `ACAO: *`, no CORP | blocked              |
| `google.com/s2/favicons`                             | CORP, after a 301  | blocked              |

Two of those have a fix. When a host sends `Access-Control-Allow-Origin` but no
CORP, the `crossorigin` attribute turns the request into a CORS one, which
satisfies COEP:

```html
<img crossorigin src="https://en.wikipedia.org/favicon.ico" />
```

That makes Wikipedia and Discord's CDN load. It does nothing for `github.com`,
which sends neither header, so a favicon from there has to be proxied or
self-hosted like everything else.

Favicon services redirect, and **the redirect itself has to carry CORP too**.
`google.com/s2/favicons` answers `301` with no CORP and only then points at
`t3.gstatic.com`, which does send it. Chrome blocks the hop it never got to, and
tells you
`ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep`, which
is not a sentence. If your history or bookmarks page pulls favicons from a
service, this is why they are all blank.

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
to your shell and to everything you proxy. Check in order:

1. **Both headers present** on the _document_ response, not just on assets. Look
   at the Network tab, select the document request, read the response headers.
2. **Secure context.** `https://`, or `http://localhost`. A LAN address like
   `http://192.168.1.5:8080` is _not_ a secure context and won't isolate.
3. **Nothing stripping them.** Cloudflare, an nginx `proxy_pass`, or a hosting
   layer can drop or override response headers.
4. **Every embedded resource sends CORP** under `require-corp`, or is
   same-origin.

---

## The symptoms

What makes this one annoying is that everything works right up until it doesn't,
and when it breaks it breaks inside somebody else's minified bundle. Your shell
loads, sites proxy fine, and then one site throws
`SharedArrayBuffer is not defined` at you from code you have never read. Nothing
in that message mentions a header on your server.

Common presentations:

| Symptom                                                    | Cause                                                            |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `SharedArrayBuffer is not defined` _inside a proxied site_ | Your shell isn't isolated, so the frame isn't either             |
| `crossOriginIsolated === false` but headers look right     | Not a secure context, or something stripped them                 |
| Works on localhost, breaks in production                   | HTTPS missing, or your host rewrites headers                     |
| Google Fonts / CDN assets 404 or blocked                   | `require-corp` blocking them. Self-host, or try `credentialless` |
| OAuth popup can no longer reach `window.opener`            | COOP. Expected; no way around it with full isolation             |

Check `crossOriginIsolated` early whenever a _specific_ site misbehaves in a way
that mentions wasm or shared memory. It costs one line.

A blank frame or a proxy that does nothing at all is usually **not** this. Look
at [service worker scope and registration](../reference/troubleshooting.md)
first, since the engine runs fine without isolation.

---

## Practical consequences

**Self-host your assets.** Under `require-corp`, fonts, icons, and scripts from
a CDN need CORP headers you don't control. Self-hosting is simpler than fighting
it, and faster anyway.

**Your proxy page cannot be embedded casually.** COOP/COEP constrain how other
pages interact with yours. If you intend to embed your proxy in another site,
work that out early.

**`about:blank` cloaking interacts with COOP.** Opening `about:blank` and
injecting an iframe still works. `about:blank` inherits the opener's origin. But
the isolation relationship is subtle and browser-dependent. Test it rather than
assuming. See [Running a proxy site well](../guides/site-best-practices.md).

**Localhost is exempt from HTTPS, not from headers.** You still need COOP/COEP
in development. The generated servers set them in both cases.
