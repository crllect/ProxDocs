# Contributing

Corrections are the most valuable contribution here. A wrong page is worse than
a missing one. But above all else, even if your change doesn't meet the
guidelines, if its really meaningful it will still be reviewed.

```bash
bun install
bun run check
```

`bun run check` validates documentation files, internal links and anchors,
version pins, Markdown rendering, house style, URL classification, every option
combination the builder can produce, and whether the committed examples still
match the generator. It has to pass before a pull request is reviewed.

---

## What a documentation change has to prove

Every factual claim on this site is traceable to a file and a line in an
upstream repository, at a pinned version. That is the only thing separating
these pages from the guesswork they exist to replace.

**Cite the source in the pull request.** `packages/core/src/shared/cookie.ts:64`
is a review that takes a minute. "I tested it and it works" is a review that
takes an hour.

To have those paths locally, clone upstream into `references/`, which is
gitignored for exactly this:

```bash
git clone https://github.com/MercuryWorkshop/scramjet references/scramjet
```

Check out the version the docs are pinned to, not `main`, unless you are
deliberately writing about something unreleased. This matters more than it
sounds: a clone left on `main` will happily show you a bug that is already fixed
there and still shipping in the release everyone installs.

**The published bundles carry their own sourcemaps, which beats trusting a
clone.** `npm pack @mercuryworkshop/scramjet@<version>`, then read
`sourcesContent` out of `dist/scramjet.js.map`. That is the exact source of the
build your readers are running:

````bash
npm pack @mercuryworkshop/scramjet@2.0.67-alpha.2
tar xzf mercuryworkshop-scramjet-*.tgz
node -e 'const m=require("./package/dist/scramjet.js.map");
m.sources.forEach((s,i)=>{ if (s.includes("dom/history")) console.log(m.sourcesContent[i]) })'
``` `builder/versions.js` says
which version that is, and
[Inside Scramjet](docs/concepts/scramjet-internals.md) maps a symptom to the
directory that owns it.

**Pin what you verified against.** Every reference page carries a "verified
against" line naming the versions. If your change depends on behavior that
moved, update that line and [the version matrix](docs/reference/versions.md)
with it.

**Upstream wins.** When this site and the source disagree, the source is right
and the page is a bug. Say so in the page rather than quietly working around it.

**Upstream bugs go on [known bugs](docs/reference/known-bugs.md).** One entry
per bug: the symptom a reader would actually see first, usually an error string
or a behaviour, then the snippet that causes it, then the workaround. Give a fix
only when it is genuinely a line or two. Entries stay after upstream fixes them,
annotated, because most people run an older release than you do.

**Document the trap, not just the API.** A signature anyone can read off the
types. What earns a page is the part that is not in the types: the field that is
always `false`, the guard that never fires, the merge that silently reverts your
flag. If you found one the hard way, that is the paragraph worth writing.

**Do not document a fork's behavior as upstream's.** If your project patches
Scramjet, say which patch.

---

## Documentation Style

The two audiences are a beginner cloning their first proxy, and more advanced proxy devs looking at docs.
However, both are served by the same rules:

- Assume JavaScript knowledge + basic networking, so don't add shitter pages re-teaching MDN.
- Define anything above that baseline in a sentence or two, then and if its complicated link a new page or something online.
- Define every ecosystem term yourself. Assume nobody else has it right.
- Every concept gets a snippet a reader can paste.
- Explain why, not just what.
- Prefer a table to a list when the reader is comparing things.
- Deepen an existing page before adding a new one.

Formatting is Prettier's problem, not yours:

```bash
bun run format
````

New pages need an entry in [`site/nav.js`](site/nav.js) with a `description`,
which becomes the meta description and the search result. A page not in `nav.js`
is not built, and `check` fails.

---

## Changing the builder

`builder/parts/` holds real source files, not templates that assemble strings.
Read [how the generator works](README.md#how-the-generator-works) first.

- Parts are TypeScript. JavaScript output is transpiled from the same file, so
  there is no second implementation to keep in sync.
- Legal combinations come from `resolve()` in `builder/options.js`, and
  `availability()` derives blocked choices from it.
- Regenerate the committed examples with `bun run examples`, test them, then
  commit them. `check` compares them byte for byte.
- Version constraints live in `builder/versions.js` with the date they were
  verified against the registry. Bumping a version means re-verifying, not
  guessing.

---

## Reporting a problem

Issues are welcome even without a fix attached, especially:

- A page that is wrong, with the file and line that proves it.
- A version combination that breaks, with the exact versions.
- A site that fails through the proxy, with what you saw in the network tab or
  server logs.

For bugs in Scramjet itself rather than in these pages,
[Inside Scramjet](docs/concepts/scramjet-internals.md) explains which layer to
look at and what a report needs to be actionable upstream.

---

## License

This repository and its generated projects are AGPL-3.0-only. By contributing
you agree your contribution is licensed the same way.
