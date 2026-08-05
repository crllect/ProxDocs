# Serverless deployment

Serverless functions are a bad place to hold a WebSocket open. That is awkward
for [Wisp](../concepts/wisp-vs-bare.md), which is one long-lived socket carrying
every stream, so the generated serverless target uses the
[Bare](../concepts/wisp-vs-bare.md) transport instead: ordinary HTTP, one
request in and one response out, which is exactly the shape a function has.

"Bad place" rather than "impossible", because that changed. Vercel Functions
serve WebSockets now, and Cloudflare Workers have done for years. What has not
changed is why you do not want your tunnel there. Vercel closes the socket when
the function hits its maximum duration, so every user gets disconnected on a
timer, and you are billed for function time for the entire life of every
connection. A proxy holds one socket per active user for as long as they browse.
That is the single worst billing shape available to you.

So: it is not that serverless cannot do Wisp. It is that Wisp on serverless
bills you per second per user to get randomly hung up on. Bare, below, at least
matches what a function is good at. And bare,

is fine... _if ur broke_

###### Brokie

> [!IMPORTANT] Even with bare, be mindful, if you are doing serverless, look at
> your analytics. I got a 600 dollar monthly bill from vercel because I got a
> ton of users out of the blue and didn't know. If you cant afford a VPS, you
> sure as hell cant afford a 600 dollar bill from vercel. Wisp will make this
> exponentially worse on serverless, so don't even think about it.

However it does work, and for a lot of projects it is the right call. If you
have no server, no budget, and a handful of users, serverless is the only way to
put a whole proxy somewhere for free, and the costs below never come due at that
size.

What it isn't is a path that scales. Read the tradeoffs before you commit, so
that if the project grows the move is planned rather than forced. My first ever
proxy landed me a $600 monthly bill on a serverless host. Do not make that
mistake.

Fair warning that this is a shrinking corner of the ecosystem. Most proxies run
on a cheap VPS now, because it is cheaper, faster, and doesn't lose WebSocket
sites. If you have the option, skip to
[the alternative](#the-alternative-worth-considering).

```bash
node builder/cli.js --out ./my-proxy --preset serverless
```

---

## The pieces

```text
Scramjet          (the rewriter, unchanged)
    over
bare-transport    (plain HTTP, no WebSocket)
    to
@tomphttp/bare-server-node   (running in the same function)
```

`@mercuryworkshop/bare-transport` is the Bare transport for `proxy-transports`,
which is the interface Scramjet 2.x uses. **It is not `bare-as-module3`**,
despite that being the name most search results give you. That one is the older
bare-mux version and Scramjet can't use it. See
[the two Bare packages](../concepts/transports.md#bare).

`proxy-bootstrap` can't wire Bare; it ships a stub that throws
`"Bare transport not implemented yet"`. Serverless builds use
[manual wiring](wiring.md), which is what you want anyway.

---

## The server

One file, and it is the same server you would run anywhere else plus a Bare
server bolted onto the front.

```js
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import express from "express";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { createBareServer } from "@tomphttp/bare-server-node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dirOf = specifier => path.dirname(require.resolve(specifier));

const app = express();

app.use((_req, res, next) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	next();
});

app.use("/scram/", express.static(scramjetPath));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use(
	"/controller/",
	express.static(dirOf("@mercuryworkshop/scramjet-controller"))
);
app.use("/baremod/", express.static(dirOf("@mercuryworkshop/bare-transport")));
app.use(express.static(path.join(__dirname, "public")));

const bareServer = createBareServer("/bare/");

const handleRequest = (req, res) => {
	if (bareServer.shouldRoute(req)) {
		bareServer.routeRequest(req, res);
		return;
	}
	app(req, res);
};

export default handleRequest;

if (!process.env.VERCEL) {
	http.createServer(handleRequest).listen(process.env.PORT || 3000);
}
```

Two things to notice. There is **no `upgrade` handler**, because there are no
WebSockets to route. And the isolation headers are still here: nothing in this
stack requires them, but they are what let a proxied site use
`SharedArrayBuffer`, so keep them. See
[cross-origin isolation](../concepts/cross-origin-isolation.md).

On a normal server, where you do have upgrades, Bare needs
`bareServer.routeUpgrade(req, socket, head)` behind the same `shouldRoute()`
check. Leaving it out fails quietly: pages load, and only the sites that open a
WebSocket break.

### Configuring the Bare server

`createBareServer(directory, init)` takes an options object, and two of its
defaults matter more than the rest.

```js
const bareServer = createBareServer("/bare/", {
	connectionLimiter: {
		maxConnectionsPerIP: 2000,
		windowDuration: 60,
		blockDuration: 10
	}
});
```

`directory` must start **and** end with `/`, or the constructor throws
`RangeError: Directory must start and end with /`. It is a URL prefix, not a
path on disk.

**`connectionLimiter` defaults to 10 concurrent connections per IP, which is too
low for a proxy.** It is sized for a Bare server answering occasional requests,
not for one behind an engine that fans a single page out into dozens of
concurrent subresource fetches, so one user loading one media-heavy site trips
it alone. The symptom is a page that loads halfway and then stalls for
`blockDuration` seconds, which reads as "Bare is slow" rather than as a limit
you set. The generated projects raise it to 2000 with a 10 second block: high
enough not to fire in normal use, short enough that a burst doesn't lock someone
out for a minute. It is a runaway guard, not your abuse control. Per-IP also
means per **apparent** IP, and a school or office behind one NAT arrives as a
single client.

**`blockLocal` defaults to `true`, and it is two separate defaults you can knock
out one at a time.** With it on, the server installs its own `filterRemote`,
which rejects a literal non-unicast IP, and its own `lookup`, which rejects a
hostname that resolves to one. Both are assigned with `??=`, so whichever one
you supply replaces that half and leaves the other in place. Supply a `lookup`
for a perfectly good reason, like pointing DNS at a filtering resolver, and you
have quietly removed the DNS-side check while the literal-IP check still runs.
`blockLocal: false` removes both at once, and there is no reason to set that on
a public deployment.

If you replace either, re-implement the check inside it. `filterRemote` rejects
by **throwing**; a predicate that returns `false` allows everything, because the
return value is discarded.

Generated projects ship their own `filterRemote`, which is why they carry
`ipaddr.js` as a dependency. The stock one misses IPv6: it reads `url.hostname`,
which for an IPv6 literal still carries its square brackets, and
`ipaddr.isValid("[::1]")` is `false`, so the address passes. The generated
version strips them first, and leaves the default `lookup` in place so the
DNS-side check still applies.

```js
filterRemote(url) {
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	if (ipaddr.isValid(hostname) && ipaddr.parse(hostname).range() !== "unicast") {
		throw new RangeError("Forbidden IP");
	}
}
```

This is the same
[SSRF](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery)
exposure described for wisp in
[Running a proxy](running-a-proxy.md#a-destination-blocklist).

The rest you will rarely touch: `logErrors` (off), `family` for the outbound
address family, `localAddress` to pick an interface, `maintainer` for the info
route, and `legacySupport`, which defaults to `true` and registers Bare v1 and
v2 alongside v3. `bare-transport` speaks v3, so turning it off is free unless
you also serve an older client.

The `export default handleRequest` is what the platform invokes. The
`if (!process.env.VERCEL)` guard is so the same file still runs locally with
`node server.js`; rename the variable if your host sets a different one.

### `vercel.json`

```json
{
	"version": 2,
	"builds": [
		{
			"src": "server.js",
			"use": "@vercel/node",
			"config": {
				"includeFiles": [
					"public/**",
					"node_modules/@mercuryworkshop/scramjet/**",
					"node_modules/@mercuryworkshop/scramjet-controller/**",
					"node_modules/@mercuryworkshop/scramjet-utils/**",
					"node_modules/@mercuryworkshop/bare-transport/**"
				]
			}
		}
	],
	"routes": [{ "src": "/(.*)", "dest": "server.js" }]
}
```

Everything routes to the one exported function. `includeFiles` matters more than
it looks: the bundler traces imports to decide what to ship, and it can't see
that `express.static(dirOf(...))` needs those directories at runtime. Leave a
package out and you get 404s on the engine files with a server that started
fine. Other platforms have an equivalent setting under a different name.

## The client

Identical to any other Scramjet setup except for the transport, which takes the
Bare server URL directly rather than a `{ wisp }` object:

```js
const { default: BareClient } = await import("/baremod/index.mjs");

const controller = new api.Controller({
	serviceworker,
	transport: new BareClient(new URL("/bare/", location.href)),
	config: {
		scramjetPath: "/scram/scramjet.js",
		wasmPath: "/scram/scramjet.wasm",
		injectPath: "/controller/controller.inject.js"
	}
});

await controller.wait();
```

Everything downstream, frames, plugins, cookies, is unchanged. The transport is
the only difference between this and a Wisp deployment, which is the whole point
of the transport abstraction. See [Transports](../concepts/transports.md).

---

## What you are giving up

### WebSocket sites won't work

Not "will be slow". Will not work. Discord, most chat apps, live dashboards,
collaborative editors, anything with real-time updates. The Bare spec does
define WebSocket tunnelling, and `bare-transport` implements it, but it needs a
connection the function can't hold open.

This rules out a large fraction of what people want a proxy for.

### Your server can inspect target traffic

The Bare server terminates TLS with the target site. It can read every URL,
cookie, form post, and response that passes through the function.

With Wisp, HTTPS target TLS terminates in the browser and the relay sees
ciphertext plus connection metadata. Plain HTTP destinations aren't encrypted
end to end either way.

If you deploy this, tell your users. It is a legitimate engineering tradeoff and
a bad thing to be quiet about.

### It gets expensive faster than anything else here

Every byte of every proxied page crosses the function twice, in from the target
and out to the user, and serverless egress is billed at a premium rate per GB. A
proxy is nothing but egress.

At low traffic this genuinely doesn't matter, which is why plenty of small
proxies run this way without trouble. It matters once traffic grows, and it
grows faster than people expect: one person watching an hour of video can move
several GB.

A VPS with a few TB of included transfer costs a few dollars a month and does
not surprise you. Serverless has no equivalent ceiling. Compare your provider's
per-GB egress price against a VPS bandwidth allowance before you deploy this
somewhere the public can reach. In complete honesty, I would recommend
unlimited-bandwidth VPSs exclusively unless your project is really small.

### Execution limits and cold starts

Functions have a wall-clock limit. Long downloads, video streaming, and slow
endpoints get cut off. Cold starts add latency to the first request after idle,
and a proxy's first request also pulls the rewriter wasm.

### Check the host's terms

Public proxies attract abuse reports and may violate a provider's acceptable-use
policy. Read the current terms for your provider before deploying one.

---

## The alternative worth considering

Split the deployment instead of forcing everything into one function:

```text
Frontend  → any static host (free, fast, no server)
Backend   → a small VPS, Fly, Render, Railway, Koyeb (WebSockets work)
```

Point the client at the remote Wisp server:

```js
const transport = new LibcurlClient({
	wisp: "wss://backend.crllect.dev/wisp/"
});
```

You get target-site WebSockets and TLS terminating in the browser, while the
part that costs nothing to host stays on the free tier. The only thing you give
up is a single deployment target.

If you can do this, do this.

---

## Where to go next

- [Wisp vs Bare](../concepts/wisp-vs-bare.md). What you are actually choosing
  between, and what each one exposes.
- [Transports](../concepts/transports.md). The three transports and the two
  confusingly named Bare packages.
- [Deployment](deployment.md). Hosting a normal, non-serverless proxy.
- [Wiring Scramjet](wiring.md). The manual wiring this page assumes.
