# Deployment

Getting a proxy online is mostly about one question: **can this host hold a
WebSocket open?** Everything else follows.

---

## The requirements

| Requirement           | Why                                                          | Who needs it                       |
| --------------------- | ------------------------------------------------------------ | ---------------------------------- |
| HTTPS                 | Service workers only run in a secure context                 | Everyone                           |
| Persistent WebSockets | [Wisp](../concepts/wisp-vs-bare.md) is one long-lived socket | Anything not on the Bare transport |
| COOP + COEP headers   | Lets proxied sites use `SharedArrayBuffer`                   | Strongly recommended, both         |
| Outbound network      | Your server opens TCP sockets to arbitrary hosts             | Everyone                           |

`localhost` is exempt from HTTPS, which is why development works and production
sometimes doesn't.

---

## Where it works

| Host                                          | Websockets            | Notes                                               |
| --------------------------------------------- | --------------------- | --------------------------------------------------- |
| **A VPS** (Hetzner, DigitalOcean, Vultr, OVH) | Yes                   | Full control; check current pricing                 |
| **Fly.io**                                    | Yes                   | Long-running containers; check current plans        |
| **Render**                                    | Yes                   | Git-based deployment; services may sleep by plan    |
| **Railway**                                   | Yes                   | Easy, usage-based                                   |
| **Koyeb**                                     | Yes                   | Check current WebSocket and idle limits             |
| **Deno Deploy**                               | Varies                | Needs a Deno-compatible Wisp server                 |
| **Serverless functions**                      | **No**                | All-in-one uses Bare; Wisp may be hosted elsewhere  |
| **Netlify Functions**                         | **No**                | Bare only, shorter timeouts                         |
| **Cloudflare Workers**                        | **No** (not for this) | Different runtime; `bare-server-node` needs porting |
| **GitHub Pages**                              | **No**                | Static files only, no server code                   |
| **Replit**                                    | Unreliable            | Historically hostile to proxies; expect takedowns   |

The two **No** rows aren't dead ends, they just change the transport: a
serverless function can run Scramjet over Bare. That is free to start and fine
at low traffic, and it is billed per GB of egress, which a proxy produces
nothing but. [Serverless deployment](serverless.md) covers the tradeoff in full.

If you have no platform constraint, use a VPS or another host that runs a
long-lived Node process and supports WebSocket upgrades. It is the most capable
option, and past very low traffic the cheapest: a proxy is almost pure
bandwidth, and a VPS sells that at a flat rate while serverless bills it per GB.

---

## HTTPS

Required. Without it there is no service worker, and without a service worker
there is no proxy.

**On a VPS**, put Caddy in front. It gets and renews certificates automatically
and proxies WebSockets correctly with no extra configuration:

```caddyfile
proxy.crllect.dev {
    reverse_proxy localhost:8080
}
```

Caddy handles ACME, HTTP/2, and WebSocket upgrades with that config.

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

location / {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;

    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

Two lines there are easy to leave out and both bite you later.

The `map` block goes at `http` level, outside `server`. You will see
`proxy_set_header Connection "upgrade"` hardcoded in most snippets on the
internet, which sends `Connection: upgrade` on ordinary HTTP requests too. It
usually works and it breaks upstream keepalive. The map sends it only when the
client actually asked for an upgrade.

`X-Forwarded-For` is the one that matters for a proxy specifically. Without it
every request reaches your server from `127.0.0.1`, so wisp-js logs one address
for everybody and any rate limiting you wrote counts all of your users as a
single client. See [rate limiting](running-a-proxy.md#rate-limiting).

**On a PaaS**, TLS is handled for you.

### Cloudflare

You can run the backend on workers, and the frontend on pages. But its some bs
and I wouldn't recommend it.

---

## A systemd unit

For a VPS, this is all you need:

```ini
[Unit]
Description=Proxy
After=network.target

[Service]
Type=simple
User=proxy
WorkingDirectory=/opt/proxy
ExecStart=/usr/bin/node server.js
Environment=NODE_ENV=production
Environment=PORT=8080
Restart=on-failure
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/proxy

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now proxy
sudo journalctl -u proxy -f
```

The timeout values keep idle Wisp connections open. The systemd restrictions
limit filesystem access for a process that opens outbound connections on behalf
of users.

---

## Docker

Generated projects install with bun by default, so the lockfile in your project
is `bun.lock` on bun 1.2 and later, or `bun.lockb` before it. The `bun.lock*`
copy below matches either. Install with bun and run with whichever runtime you
generated for. Two stages keep the final image on Node without carrying bun into
it:

```dockerfile
FROM oven/bun:1-slim AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM node:22-slim
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
```

If you generated with `--runtime bun`, drop the second stage and run
`CMD ["bun", "server.js"]` from the bun image. If you generated with npm, pnpm,
or yarn, use that package manager's frozen install (`npm ci --omit=dev`) against
its own lockfile; mixing a lockfile with the wrong package manager either fails
or silently resolves different versions.

`--frozen-lockfile` isn't optional in an image. Without it a rebuild can pick up
a new transport minor, and transport packages are where the version-skew
breakage lives; see [the version matrix](../reference/versions.md).

With `proxy-bootstrap`, note that it resolves packages **at runtime** on a fresh
boot and caches them inside its installed directory. A replacement container or
new deployment loses that cache and needs registry access. Bootstrap also needs
`/app` writable by the runtime user, which the image above doesn't give it.

For containers, prefer **manual wiring**, where everything is a normal
dependency resolved at install time:

```bash
bun builder/cli.js --out ./my-proxy --wiring manual --features tabs,settings
```

---

## Capacity

Wisp changes what you plan for. It isn't requests per second, it is **concurrent
connections and open sockets**.

Each active user holds one WebSocket to your server, and that WebSocket carries
one TCP socket per stream the page has open. A page with a dozen concurrent
connections means a dozen sockets on your box.

Raise the file descriptor limit:

```ini
proxy soft nofile 65535
proxy hard nofile 65535
```

Or in the systemd unit:

```ini
LimitNOFILE=65535
```

Bandwidth is the other constraint, and it is the one that surprises people.
Every byte of every proxied page transits your server twice, in and out. Video
will saturate a cheap VPS quickly. Check your provider's bandwidth allowance
before you advertise anywhere.

CPU is usually not the bottleneck: the rewriting happens in the user's browser,
and your server is mostly moving bytes.

---

## The service worker cache

The generated worker caches your own shell, meaning your HTML, CSS, JavaScript,
and icons. Proxied content isn't touched by it.

This is on by default, and it is worth understanding rather than deleting.

```js
const shellCache = "my-proxy-shell-v1";

const shellResponse = async request => {
	const cache = await caches.open(shellCache);
	const cached = await cache.match(request);

	const network = fetch(request)
		.then(response => {
			if (response.ok) cache.put(request, response.clone());
			return response;
		})
		.catch(() => cached ?? Response.error());

	return cached ?? network;
};
```

That is stale-while-revalidate: serve the cached copy instantly if there is one,
fetch a fresh copy in the background for next time, and fall back to the cache
when the network fails.

`Response.error()` in that last position matters. Resolving `respondWith` with
`undefined`, which is what you get if you write `.catch(() => cached)` and
nothing is cached yet, makes the browser log a
`FetchEvent ... resulted in a network error response` TypeError on top of the
failure you already had. Returning an explicit network error fails the request
cleanly instead.

### Why it matters more here than on a normal site

**Your shell competes with the tunnel.** Every proxied page is already pulling
its assets through wisp and your server. Without a cache, a reload also
re-fetches your own bundle, stylesheet, and icons over the same connection the
user is waiting on. Serving those from disk takes them off the critical path
entirely.

**It is your bandwidth twice over.** A proxy pays for every byte in both
directions, so shell assets you serve repeatedly to the same user are pure
waste. Caching them is the cheapest bandwidth saving available, and it costs
nothing at runtime.

**The worker is already there.** You registered a service worker to run the
proxy. Shell caching is a few lines in a file that has to exist anyway.

**It survives a bad network.** The proxy won't work offline, but the shell
loading and showing an error beats a browser error page with no explanation.

### What it deliberately skips

The route check runs first, so proxied requests never reach the cache logic.
Beyond that, the worker skips anything that isn't a same-origin `GET`, its own
script, and every path the runtime itself is served from:

```js
const runtimeRoots = [
	"/scram/",
	"/controller/",
	"/utils/",
	"/libcurl/",
	"/epoxy/",
	"/baremod/",
	"/bare/",
	"/wisp/"
];
```

Those are the engine bundle, the wasm, the controller, the transports, and the
tunnel endpoints. Caching them looks harmless and isn't: a version bump then
serves a stale `scramjet.js` against a fresh `controller.api.js`, and the
[version guard](../reference/controller-api.md#version-guards) throws at
construction on a page you can't fix without clearing storage. On Ultraviolet
the same rule covers the proxy prefix and `/bare/`.

Two exclusions exist purely to stay out of the way during development:

```js
if (url.search) return false;
if (location.hostname === "localhost" || location.hostname === "127.0.0.1")
	return false;
```

A dev server rewrites modules on every save and requests them with query
strings, so caching those hands you a stale module and a confusing session.
Built assets are fingerprinted in the path and carry no query, so production is
unaffected by either rule.

Never cache the worker itself. A stale worker can't be replaced by a new
deployment, which is why `sw.js` wants `Cache-Control: no-cache` from your
server.

### Deploying a new version

The cache name carries a version, and `activate` deletes the project's older
caches:

```js
const shellCachePrefix = "my-proxy-shell-";
const shellCache = shellCachePrefix + "v1";

caches
	.keys()
	.then(keys =>
		Promise.all(
			keys
				.filter(
					key =>
						key.startsWith(shellCachePrefix) && key !== shellCache
				)
				.map(key => caches.delete(key))
		)
	);
```

**The prefix test is the part worth copying.** The obvious version,
`key !== shellCache`, deletes every cache on the origin, including ones opened
by Scramjet's own `HttpCachePlugin` and by anything else you deploy alongside
the proxy. It looks like tidy cleanup and is a data loss bug on a shared origin.

Bump `-v1` to `-v2` when you ship a breaking change to the shell. With a bundler
this is rarely needed, because Vite fingerprints filenames and a new build
requests new URLs, but it is the escape hatch when you need it.

### Quiet service worker

Off by default, available as a build option.

Proxied pages log a great deal, and in a service worker all of it lands in one
console alongside your own messages. The option replaces `log`, `info`, `debug`
and friends with no-ops inside the worker, keeping `warn` and `error`.

Leave it off while developing. Turn it on for production if worker logs are
drowning out anything you would act on.

---

## Before you go live

- [ ] `crossOriginIsolated === true` in the production console
- [ ] The service worker registers over HTTPS
- [ ] A site with WebSockets works (proves Wisp end to end)
- [ ] `sw.js` is served with `Cache-Control: no-cache`
- [ ] Reverse-proxy timeouts raised above the default
- [ ] File descriptor limit raised
- [ ] The process restarts on failure
- [ ] You know your bandwidth allowance
- [ ] You have read your host's acceptable use policy

---

## Splitting frontend and backend

Static frontend on a CDN, wisp backend on a small server:

```text
Any static host                       →  the shell, assets, engine bundles
A VPS or Fly.io                        →  the wisp endpoint
```

Point the client at the remote wisp server:

```js
const transport = new LibcurlClient({
	wisp: "wss://backend.crllect.dev/wisp/"
});
```

The backend needs a valid certificate and CORS headers if it also serves the
engine bundles. The upside is a free global CDN for assets plus a working wisp
tunnel. Usually better than compromising on the engine to fit one platform.

---

## Operational reality

Public proxies attract abuse, and hosts respond to complaints. Expect:

- **Takedowns.** Most free hosts' terms prohibit this. Have a backup.
- **Domain blocklists.** Filtering vendors can add public proxy domains quickly.
  `noindex` only asks search engines not to index a page; it doesn't prevent
  filtering vendors from discovering it.
- **Abuse reports.** Your IP is the source of whatever users do. Rate limiting
  and a blocklist for abusive destinations should be in place before you need
  them.

[Running a proxy](running-a-proxy.md) covers all three in depth, with the
bandwidth arithmetic, a rate limiter, and the wisp options that stop your server
being used to reach its own internal network.

[Practices worth knowing](site-best-practices.md) covers storage, disclosure,
performance, and accessibility.
