# Official documentation and licensing

This site is not the authority on any of these projects. When it disagrees with
upstream, upstream is right.

## Licensing, first

This repository and its generated projects are **AGPL-3.0-only**. The dependency
licenses are mixed: current Scramjet, controller, epoxy-transport, and
libcurl-transport packages are AGPL, while Ultraviolet and proxy-transports are
MIT. Check every installed package's current license before distributing a
project.

The AGPL is not the MIT licence. The part that catches people:

> If you run a modified version on a server and let other users interact with it
> over a network, you must offer those users the source of your version.

The AGPL includes source-offer requirements for modified software used over a
network. Generated projects include `LICENSE`; keep it and review the license
text for your distribution and deployment. This page is not legal advice.

None of this is a problem if you publish your repository, which is what most
people in this space do anyway. It is a problem if you were planning not to.

## Scramjet

| Resource      | Link                                                 |
| ------------- | ---------------------------------------------------- |
| Repository    | <https://github.com/MercuryWorkshop/scramjet>        |
| Documentation | <https://mercuryworkshop-scramjet.mintlify.app/>     |
| npm           | `@mercuryworkshop/scramjet`, `-controller`, `-utils` |

The published documentation currently describes the **1.x** API
(`$scramjetLoadController`, `ScramjetController`, bare-mux). The repository's
main branch has moved to the controller and proxy-transports architecture that
this site documents. Both are real; check which one a page means. See
[breaking changes](breaking-changes.md).

The most useful things in that repository are not the README:

- `packages/create-proxy-app/templates/default` is the canonical minimal app. If
  this site and that template disagree about an API call, the template wins.
- `packages/demo` is the maintainers' own test harness, and shows what the
  engine exposes that a simple app never touches.
- `packages/controller/src/index.ts` is the window-side API. It is readable, and
  it is the only place the `Frame` and `Controller` surface is fully described.

## Ultraviolet

| Resource   | Link                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| Repository | <https://github.com/titaniumnetwork-dev/Ultraviolet>                        |
| Wiki       | <https://github.com/titaniumnetwork-dev/Ultraviolet/wiki>                   |
| Changelog  | <https://github.com/titaniumnetwork-dev/Ultraviolet/blob/main/CHANGELOG.md> |
| npm        | `@titaniumnetwork-dev/ultraviolet`                                          |

Last released October 2024 at 3.2.10, and the README now points at Scramjet. The
repository is not archived and `main` is ahead of the last npm release, so check
it before assuming a bug is permanent but for all intents and purposes UV is
archived. The changelog is still the best short account of how the transport
layer evolved.

## Transports and protocols

| Resource         | Link                                                 |
| ---------------- | ---------------------------------------------------- |
| Wisp protocol    | <https://github.com/MercuryWorkshop/wisp-protocol>   |
| wisp-js          | <https://github.com/MercuryWorkshop/wisp-js>         |
| epoxy transport  | <https://github.com/MercuryWorkshop/epoxy-transport> |
| libcurl.js       | <https://github.com/ading2210/libcurl.js>            |
| bare-mux         | <https://github.com/MercuryWorkshop/bare-mux>        |
| Bare server spec | <https://github.com/tomphttp/specifications>         |

The [Wisp](../concepts/wisp-vs-bare.md) protocol document is short and covers
the stream packet types, the v2 handshake, flow control, and extensions.

## Where to ask

**Night Network** runs a Discord that covers proxy development, including
questions for project maintainers: <https://discord.gg/algebra>

Before asking anywhere, collect the things in
[troubleshooting](troubleshooting.md). "It doesn't work" is unanswerable; the
list there usually contains the answer anyway.

## How this site stays correct

Every page footer names the exact package versions it was checked against, and
the date. That comes from
[`builder/versions.js`](https://github.com/crllect/ProxDocs/blob/main/builder/versions.js),
so it cannot drift page by page: bump the pins, and every page restamps.

The checking is not editorial. Upstream sources are cloned locally and claims
are traced to a file and a line before they get written down. `npm run check`
enforces what can be automated: links and heading anchors resolve, version pins
in prose match `builder/versions.js`, and all 58 generator combinations still
compile and type-check.

**Found something wrong?** Open an issue or a PR at
<https://github.com/crllect/ProxDocs>. A one-line report naming the page and
what upstream actually does is enough; a citation to the upstream file and line
is better and will get fixed same day.

Two things worth knowing about how these packages move. Scramjet 2.x ships under
the `alpha` dist-tag and its API has changed between patch releases more than
once, so a page can go stale without anything here changing. And a claim that
was true against npm can be false against upstream `main`, which is why pages
say which one they mean.

## Contributing back

These projects exist because people published their work under a licence that
keeps it published. If you fix something, send it upstream. If you build
something on top, publish it.
