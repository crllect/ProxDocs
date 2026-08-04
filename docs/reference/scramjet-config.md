# Scramjet config and flags

Scramjet takes **two** config objects that do unrelated jobs and are easy to
confuse:

| Object           | Passed as             | Controls                                  |
| ---------------- | --------------------- | ----------------------------------------- |
| `Config`         | `init.config`         | Where files live and how URLs are encoded |
| `ScramjetConfig` | `init.scramjetConfig` | How the rewriter behaves                  |

```js
const controller = new Controller({
	serviceworker,
	transport,
	config: { prefix: "/~/sj/" },
	scramjetConfig: { flags: { sourcemaps: false } }
});
```

Both are merged over the defaults, so you only supply what you are changing.

Verified against `@mercuryworkshop/scramjet` 2.0.67-alpha.2 and
`@mercuryworkshop/scramjet-controller` 0.0.14. Flags move between releases; see
[flags that no longer exist](#flags-that-no-longer-exist).

---

## `config`: paths and codec

The controller's own config. Every value has a default, but the defaults assume
a file layout you probably do not have, so nearly every project sets at least
three of them.

| Key               | Default                            | What it is                                     |
| ----------------- | ---------------------------------- | ---------------------------------------------- |
| `prefix`          | `/~/sj/`                           | Path all proxied URLs live under               |
| `scramjetPath`    | `/scramjet/scramjet.js`            | The rewriter bundle                            |
| `wasmPath`        | `/scramjet/scramjet.wasm`          | The WebAssembly rewriter                       |
| `injectPath`      | `/controller/controller.inject.js` | Bootstrap script injected into proxied pages   |
| `virtualWasmPath` | `scramjet.wasm.js`                 | Virtual path the wasm is served from per frame |
| `codec`           | `encodeURIComponent` pair          | How the destination URL is encoded into a path |

### `prefix`

Every proxied page lives under this path. `https://crllect.dev` becomes
`/~/sj/<controller-id>/<frame-id>/<encoded-url>`.

The per-frame segment is why the prefix is not the whole story: each `Frame`
gets `config.prefix + controllerId + "/" + frameId + "/"`, which is what
`frame.prefix` returns. If you are stripping a prefix off a URL to recover the
destination, use `frame.prefix`, not `config.prefix`.

**The service worker's scope must cover the prefix.** A worker registered at
`/app/sw.js` gets scope `/app/` by default and will never see requests to
`/~/sj/…`. Either serve the worker from the root or set `prefix` to something
inside its scope. Scope mismatch is the usual cause of "the page loads and then
nothing happens."

### `scramjetPath`, `wasmPath`, `injectPath`

Where you actually mounted the files. With [manual wiring](../guides/wiring.md)
serving the packages under `/scram/` and `/controller/`:

```js
const controller = new Controller({
	serviceworker,
	transport,
	config: {
		scramjetPath: "/scram/scramjet.js",
		wasmPath: "/scram/scramjet.wasm",
		injectPath: "/controller/controller.inject.js"
	}
});
```

You will also see these assigned onto the global before construction:

```js
$scramjetController.config.wasmPath = "/scram/scramjet.wasm";
```

Both work. Passing `config` avoids mutating shared state, so two controllers on
one page cannot fight over it.

> `wasmPath` is fetched and compiled with
> [`WebAssembly`](https://developer.mozilla.org/en-US/docs/WebAssembly). If it
> 404s or is served with the wrong content type, you get
> `rewriter wasm does not have wasm magic`. Scramjet checks the first four bytes
> and prints what it received instead, which is usually your HTML error page.

### `codec`

How the destination URL is encoded into the path. Default is
`encodeURIComponent` / `decodeURIComponent`.

```js
config: {
	codec: {
		encode: url => btoa(url).replaceAll("+", "-").replaceAll("/", "_"),
		decode: url => atob(url.replaceAll("-", "+").replaceAll("_", "/"))
	}
}
```

Three things it has to satisfy:

1. **`decode(encode(x)) === x` for every input**, including unicode and strings
   that are already percent-encoded. A codec that round-trips imperfectly
   produces failures that look like [rewriter](../concepts/how-proxies-work.md)
   bugs and are very hard to trace.
2. **Output must never contain `?` or `#`.** This is the one that bites. See
   below.
3. **`encode("")` must return something falsy.** It is called with the empty
   string whenever a URL has no fragment.

### What Scramjet builds around your codec

A proxied URL is not just `prefix + encode(url)`. The real shape is:

```text
<prefix><encode(url without hash)>?<scramjet's own params>#<encode(hash)>
```

Three consequences, none of them obvious:

**The fragment is encoded by a separate call.** Scramjet strips the hash, calls
`encode()` on it _without_ the leading `#`, and re-appends it after everything
else. Your codec sees the fragment as its own independent input, never as part
of the URL string. That is also why `encode("")` has to stay empty. The default
codec guards with `if (!url) return url` for exactly this reason.

**Scramjet appends its own query string.** After your encoded URL it adds
`$`-prefixed parameters carrying request metadata: `$rfp` for referrer policy,
`$module`, `$tf` and `$pf` for the top and parent frame, `$iframe`, `$mode`,
`$cred`, `$dest`, `$io` for the initiating origin, and a few more. You will see
them in the address bar and in devtools. They are not junk, and stripping them
breaks referrer handling and `sec-fetch-*` behaviour.

**Decoding relies on `?` and `#` being structural.** `unrewriteUrl` recovers the
destination by slicing off the prefix and then clearing `search` and `hash`
wholesale before calling `decode()`. So if your codec's output contains a `?`,
everything after it is discarded as query parameters; if it contains a `#`, the
rest is treated as the fragment and fed to `decode()` on its own. Either way the
URL is silently truncated, and it will look like a rewriter bug.

Percent-encoding and base64url both satisfy this. Raw base64 does not, and
neither does anything emitting raw bytes certainly does not.

### What never reaches your codec

These bypass it entirely, so do not expect to see them: `mailto:` and `about:`
URLs pass through untouched, as does any non-`http(s)` scheme, so custom
protocols can still hand off to an installed app. `javascript:` URLs get their
body rewritten as JavaScript instead. `blob:` and `data:` URLs are prefixed
verbatim rather than encoded, and a `data:` URL close to the 2 MB mark is
converted to a blob first, because Chrome will not accept a service worker
request with a URL that long.

**A codec is obfuscation, not encryption.** The implementation ships in your
client bundle, so anyone can decode it. It defeats naive substring matching on
`youtube.com`, and that is the extent of it. See
[URL parsing and history](../guides/url-parsing-and-history.md).

---

## `scramjetConfig`: rewriter behaviour

| Key           | Type                                     | What it is                         |
| ------------- | ---------------------------------------- | ---------------------------------- |
| `flags`       | `ScramjetFlags`                          | Rewriter behaviour switches        |
| `siteFlags`   | `Record<string, Partial<ScramjetFlags>>` | Per-origin flag overrides          |
| `globals`     | `Record<string, string>`                 | Names of injected helper functions |
| `maskedfiles` | `string[]`                               | Files hidden from the proxied page |

### `globals`

Scramjet rewrites `location` into a call to a helper function, and `globals`
names those helpers. The defaults all start with `$scramjet`: `wrapfn` is
`$scramjet$wrap`, `importfn` is `$scramjet$import`, and so on. Two do not follow
the `$scramjet$` shape exactly, so do not derive them: `wrappropertybase` is
`$scramjet__` and `wrappropertyfn` is `$scramjet$prop`.

You rename them for one reason: a proxied site that sniffs for `$scramjet` in
the global scope to detect it is being proxied. Renaming to a neutral prefix
makes that check fail.

```js
scramjetConfig: {
	globals: {
		wrapfn: "_a$w",
		wrappropertybase: "_a__",
		wrappropertyfn: "_a$p",
		cleanrestfn: "_a$c",
		importfn: "_a$i",
		rewritefn: "_a$r",
		metafn: "_a$m",
		wrappostmessagefn: "_a$pm",
		pushsourcemapfn: "_a$psm",
		trysetfn: "_a$ts",
		templocid: "_a$tl",
		tempunusedid: "_a$tu"
	}
}
```

**Supply all twelve or none.** They are merged, so a partial override leaves the
rest at their `$scramjet$` defaults and defeats the point.

### `maskedfiles`

Filenames hidden from the proxied page, so a site cannot list them and see
Scramjet's runtime. The controller sets `["inject.js", "scramjet.wasm.js"]` by
default.

---

## Flags

Thirteen booleans. These are the defaults upstream ships.

| Flag                    | Default | Effect                                                         |
| ----------------------- | ------- | -------------------------------------------------------------- |
| `sourcemaps`            | `true`  | Make `Function.prototype.toString` return the original source  |
| `destructureRewrites`   | `true`  | Rewrite destructuring patterns in catch clauses and parameters |
| `allowInvalidJs`        | `true`  | On rewrite failure, pass the original script through unchanged |
| `encapsulateWorkers`    | `true`  | Wrap workers so they get a proxied environment too             |
| `allowFailedIntercepts` | `false` | Let a failed intercept continue instead of erroring            |
| `syncxhr`               | `false` | Synchronous `XMLHttpRequest` support                           |
| `disableComputedWrap`   | `false` | Stop rewriting computed member access, faster but less correct |
| `scramitize`            | `false` | Insert a `debugger` wherever a real URL leaks into page code   |
| `rewriterLogs`          | `false` | Log rewriter timing and parse errors                           |
| `captureErrors`         | `false` | Capture errors thrown inside the proxied page                  |
| `cleanErrors`           | `false` | Strip Scramjet's frames out of stack traces                    |
| `debugTrampolines`      | `false` | Debug output for the trampoline functions                      |
| `debugSourceURL`        | `false` | Append `sourceURL` comments to fetched bodies                  |

> **`allowFailedIntercepts` is a special case.** Controller 0.0.14 sets it to
> `true` for itself, but then merges its own config _underneath_ upstream's
> defaults rather than over them, so the default `false` wins and the flag ends
> up off. Assume `false`, set it explicitly if you want it on, and check
> `controller.scramjetConfig.flags` rather than trusting either value.

### The ones you will actually change

**`sourcemaps`** is badly named and is not what it sounds like. It has nothing
to do with `.map` files or stack traces. What it does is record the rewriter's
edit list for every script, then patch `Function.prototype.toString` so that
calling it on rewritten code returns the **original** source instead of the
rewritten source.

That matters for two reasons, and both are correctness rather than convenience:

- Without it, `fn.toString()` hands the page Scramjet's internals. Any site that
  re-evaluates its own source, and plenty do, then gets that rewritten output
  fed back through the rewriter a second time. Upstream's comment on the hook
  says it plainly: double rewrites, which are bad.
- Sites that hash or fingerprint their own functions see code they did not
  write, and behave accordingly.

Leave it on. It is on by default. The flag you want for stack traces is
`cleanErrors`.

**`allowInvalidJs`** is on by default, and it is why a site with one malformed
script still mostly works. Turning it off makes rewrite failures throw, which
you want while developing a custom codec or chasing one misbehaving script.

**`disableComputedWrap`** is the one real performance lever. Scramjet normally
rewrites `obj[expr]` because `expr` might evaluate to `"location"`, and pages
have a lot of computed member access. Disabling it skips all of that. The cost
is that `window["location"]` and any dynamic property access stop being
intercepted, and sites relying on that break in ways that are hard to trace back
to the flag. Apply it per-site through `siteFlags` instead of globally.

**`scramitize`** is a leak detector. It wraps every call expression so a value
containing your real origin, `~/sj`, or the string `scramjet` trips a
`debugger`. When a site is somehow learning its real URL, this finds it fast. It
is also very slow and does nothing with devtools closed, so keep it out of
production.

**`captureErrors` and `cleanErrors`** work together. `captureErrors` routes
errors thrown inside the proxied page somewhere you can see them. `cleanErrors`
walks each stack trace and drops any frame whose file matches one of your
`maskedfiles`, leaving something close to what the site's developers would see.
It is **V8-only**: it hangs off `Error.prepareStackTrace`, so it does nothing in
Firefox or Safari. Upstream's own `defaultConfigDev` turns on `captureErrors`,
`debugTrampolines`, and `debugSourceURL`, and turns `allowInvalidJs` off so
rewrite failures surface instead of passing through.

**`encapsulateWorkers`** is on by default. Turn it off and workers the page
creates run unproxied: they fetch directly, fail on CORS, and take a site
feature down with them. Leave it alone unless you are debugging worker
behaviour.

---

## `siteFlags`

Flags, but only for URLs matching a pattern. Most of the work of handling real
sites ends up here, because "site X needs different treatment" is the normal
case.

```js
scramjetConfig: {
	flags: { sourcemaps: true },
	siteFlags: {
		"https://discord\\.com/.*": { disableComputedWrap: true },
		"https://.*\\.google\\.com/.*": { sourcemaps: false }
	}
}
```

How resolution works, exactly:

```js
const value = config.flags[flag];
for (const regex in config.siteFlags) {
	const partial = config.siteFlags[regex];
	if (new RegExp(regex).test(url.href) && flag in partial) {
		return partial[flag];
	}
}
return value;
```

Four consequences, all of which catch people out:

1. **Keys are regex source strings, not globs.** `*.google.com` is not a
   pattern, it is a regex that will not compile the way you expect. Escape your
   dots: `\\.` in a JS string literal.
2. **Matched against `url.href`**, the whole URL including scheme and query. An
   unanchored pattern like `discord` matches any URL containing that substring
   anywhere.
3. **First match wins**, in object key order, and only for flags actually
   present in that partial. Other flags keep falling through.
4. **Evaluated per request**, and the regex is constructed each time. Keep the
   list short; this is on the hot path for every single resource a page loads.

Site flags are how you fix one site without degrading every other site, and it
is almost always the right tool when a specific domain misbehaves.

---

## Flags that no longer exist

Config blocks get copied between proxy projects, and flags get renamed and
removed upstream. Setting a flag that no longer exists fails silently. Nothing
warns you, and you lose an afternoon wondering why toggling it changes nothing.

These appear in real projects and are **not** in 2.0.67-alpha.2:

| Flag             | Status                                             |
| ---------------- | -------------------------------------------------- |
| `strictRewrites` | Gone. Widely copied; does nothing.                 |
| `naiiveRewriter` | Gone. Predates the wasm rewriter.                  |
| `serviceworkers` | Gone. Worker handling is `encapsulateWorkers` now. |

To check against the version you actually installed:

```js
console.log(Object.keys(globalThis.$scramjet.defaultConfig.flags));
```

That prints the authoritative list for your build. Run it before copying a flags
block out of someone's repository.

---

## Where to go next

- [Plugins and hooks](plugins-and-hooks.md). The other half of controlling
  Scramjet, and where behaviour you cannot get from a flag comes from.
- [Site compatibility](site-compatibility.md). Which sites need which flags, and
  which are not a flag problem at all.
- [Bootstrap or manual wiring](../guides/wiring.md). Where these paths come
  from.
