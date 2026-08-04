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

Two things it has to satisfy:

1. **Output must be path-safe.** It goes in a URL path segment.
2. **`decode(encode(x)) === x` for every input**, including unicode and strings
   that are already percent-encoded. A codec that round-trips imperfectly
   produces failures that look like rewriter bugs and are very hard to trace.

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
names those helpers. The defaults are all `$scramjet$`-prefixed: `wrapfn` is
`$scramjet$wrap`, `importfn` is `$scramjet$import`, and so on.

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

Thirteen booleans. Defaults are what upstream ships; the controller overrides
`allowFailedIntercepts` to `true`.

| Flag                    | Default | Effect                                                         |
| ----------------------- | ------- | -------------------------------------------------------------- |
| `sourcemaps`            | `true`  | Emit source maps so stack traces point at original source      |
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

### The ones you will actually change

**`sourcemaps`** is on by default and should stay that way. Without it, every
error inside a proxied page has a stack trace pointing into rewritten code full
of `$scramjet$wrap` calls. Turn it off only after measuring that map generation
is costing you something.

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
strips Scramjet's own frames from stack traces, leaving something close to what
the site's developers would see. Upstream's dev config turns on `captureErrors`
and leaves `cleanErrors` off.

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
