# Site compatibility

"Why doesn't YouTube work" is the most-asked question in this ecosystem and the
worst-answered. The honest answer is that sites fail for about six distinct
reasons, they need completely different responses, and telling them apart takes
about a minute once you know what to look for.

This page is that minute. It does not promise any specific site works, because
that changes weekly and no honest page can promise it.

---

## Diagnose before you fix

Almost every "site X is broken" report is one of these. Check in order.

```text
Does any site work?
├── No  → your setup. crossOriginIsolated, service worker scope, transport.
│         Go to Troubleshooting, not this page.
└── Yes → is it this one site?
          ├── Page is blank / never loads      → rewriter or CSP
          ├── Page loads, features dead        → workers, or a flag
          ├── Video plays nowhere              → DRM. Unfixable.
          ├── Login bounces you back           → cookies, or bot detection
          ├── "Unsupported browser" / captcha  → bot detection. Mostly unfixable.
          └── Works in dev, not in production  → isolation headers or transport
```

Open the **frame's** console, not the top page's. In Chrome devtools that is the
context dropdown at the top of the console panel; pick the proxied frame. Errors
inside a proxied page do not appear in the parent console, and people spend
hours looking at the wrong one.

---

## The categories

### DRM, and why it will never work

Netflix, Spotify, Disney+, and most paid video are
[Widevine](https://developer.mozilla.org/en-US/docs/Web/API/Encrypted_Media_Extensions_API)
or an equivalent. The browser negotiates a license with the site's server, and
the negotiation is bound to the real origin and a device identity the browser
will not hand out to a page it does not trust.

A proxy changes the origin. That is the entire point of a proxy, and it is
exactly what DRM checks. There is no flag, no plugin, and no rewriter
improvement that fixes this. Anyone claiming their proxy plays Netflix is
running it somewhere other than in the proxy.

**YouTube is not this.** Regular YouTube video is not DRM-protected and does
work through a proxy, subject to everything below.

### Bot detection

Cloudflare Turnstile, reCAPTCHA, and the commercial fingerprinting services all
work by measuring things a proxied page cannot present honestly: the actual
origin, the TLS fingerprint of the connection, timing that is not distorted by a
tunnel, and a browser environment that has not been rewritten.

Scramjet rewrites the JavaScript environment thoroughly, but "thoroughly" is not
"undetectably." A determined fingerprinter will notice.

You can sometimes improve your odds:

- Rename the [`globals`](scramjet-config.md) so a check for `$scramjet` in the
  global scope fails.
- Use libcurl rather than epoxy, since its TLS handshake is curl's and more
  ordinary than a hand-rolled Rust stack's.

You cannot win this in general, and you should not build a product on top of
assuming you have. The companies doing the detecting have more staff on it than
this entire ecosystem has contributors.

### Content Security Policy

A site sends a CSP header restricting where scripts and frames may come from.
Since the proxy serves everything from your origin, a strict policy can block
Scramjet's own injected runtime.

Symptom: the frame is blank, and the frame's console has explicit CSP violation
messages naming the directive.

This one you can actually fix. Strip the header on the way back, in a
[`fetch.preresponse` hook](plugins-and-hooks.md):

```js
this.tap(frame.hooks.fetch.preresponse, (context, props) => {
	props.response.headers.delete("content-security-policy");
	props.response.headers.delete("content-security-policy-report-only");
});
```

Know what that costs. CSP is one of the page's defences against script
injection, and you just removed it for every site. Defensible for a proxy, since
you are already running foreign code on your own origin, but make it a decision
instead of an accident.

### Workers

Sites that do real work off the main thread, like editors and mail clients,
break if their workers escape the proxy. An unproxied worker fetches directly,
gets a CORS failure, and takes a feature down with it.

`encapsulateWorkers` handles this and is **on by default**. If workers are
broken, check you have not turned it off. See [flags](scramjet-config.md#flags).

Nested workers and some `SharedWorker` usage are still rough. That is an
upstream limitation, not something to fix in your app.

### Cross-origin isolation, in production only

Works locally, breaks on the deployed site: this is nearly always the isolation
headers. `SharedArrayBuffer` requires COOP and COEP, browsers grant it on
`localhost` more readily, and a CDN or host that strips or overrides response
headers takes it away.

```js
crossOriginIsolated;
```

Run that in the console on the deployed site. `false` is your answer. See
[Cross-origin isolation](../concepts/cross-origin-isolation.md).

### Sites that need a flag

A small set of sites break because of a specific rewriter behaviour rather than
any of the above. The symptom is a page that loads but is subtly wrong: a script
threw, a widget did not initialise.

Use the frame's console to find the actual error, then reach for
[`siteFlags`](scramjet-config.md#siteflags) so the change applies to that site
only:

```js
scramjetConfig: {
	siteFlags: {
		"https://figma\\.com/.*": { disableComputedWrap: true }
	}
}
```

Do not apply flags globally to fix one site. You will trade a known broken site
for several unknown ones.

---

## Before reporting it upstream

Scramjet's maintainers want real bug reports, and a good one is rare enough to
be welcome. A good one has ruled out everything on this page:

- `crossOriginIsolated` is `true`
- Some other site works, so the setup is not the problem
- The error is from the **frame's** console, quoted exactly
- Engine and version from `package.json`, not "latest"
- Which transport, and whether the other one behaves differently
- Whether it reproduces in
  [upstream's own demo](https://github.com/MercuryWorkshop/scramjet), which
  isolates your app from the engine

Do the last one first. If it reproduces in the demo, it is an engine bug and
they will want it. If it does not, it is yours, and you have narrowed the search
to your own code.

---

## Setting expectations in your UI

If other people use your proxy, say what does not work. A one-line notice
prevents most support questions:

> Video from paid streaming services will not play. Sites with bot detection may
> block access. Everything else usually works.

Users who know the limits report the interesting failures. Users who were
promised everything report all of them, and stop trusting anything you say.

---

## Where to go next

- [Troubleshooting](troubleshooting.md). When nothing works, rather than one
  site.
- [Config and flags](scramjet-config.md). The per-site escape hatch.
- [Plugins and hooks](plugins-and-hooks.md). Where response header rewriting
  belongs.
