# Deployment

Getting a proxy online is mostly about one question: **can this host hold a
WebSocket open?** Everything else follows.

---

## The requirements

| Requirement           | Why                                                          | Who needs it                  |
| --------------------- | ------------------------------------------------------------ | ----------------------------- |
| HTTPS                 | Service workers only run in a secure context                 | Everyone                      |
| Persistent WebSockets | [Wisp](../concepts/wisp-vs-bare.md) is one long-lived socket | Scramjet always; UV over Wisp |
| COOP + COEP headers   | `SharedArrayBuffer` for the wasm rewriter                    | Scramjet only                 |
| Outbound network      | Your server opens TCP sockets to arbitrary hosts             | Everyone                      |

`localhost` is exempt from HTTPS, which is why development works and production
sometimes does not.

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
| **Vercel Functions**                          | **No**                | All-in-one uses Bare; Wisp may be hosted elsewhere  |
| **Netlify Functions**                         | **No**                | Bare only, shorter timeouts                         |
| **Cloudflare Workers**                        | **No** (not for this) | Different runtime; `bare-server-node` needs porting |
| **GitHub Pages**                              | **No**                | Static files only, no server code                   |
| **Replit**                                    | Unreliable            | Historically hostile to proxies; expect takedowns   |

The two **No** rows are not dead ends, they just change the engine: a serverless
function can run Ultraviolet over Bare. That is free to start and fine at low
traffic, and it is billed per GB of egress, which a proxy produces nothing but.
[Ultraviolet on Vercel](ultraviolet-vercel.md) covers the tradeoff in full.

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
location / {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;

    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

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

```dockerfile
FROM node:22-slim
WORKDIR /app

COPY --chown=node:node package*.json ./
USER node
RUN npm ci --omit=dev

COPY --chown=node:node . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
```

With `proxy-bootstrap`, note that it resolves packages **at runtime** on a fresh
boot and caches them inside its installed directory. A replacement container or
new deployment loses that cache and needs network access to npm. The image above
keeps `/app` writable by the `node` user so bootstrap can populate it.

For containers, prefer **manual wiring**, where everything is a normal
dependency resolved at `npm ci` time:

```bash
node builder/cli.js --out ./my-proxy --wiring manual --features tabs,settings
```

---

## Capacity

Wisp changes what you plan for. It is not requests per second, it is
**concurrent connections and open sockets**.

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
and icons. Proxied content is not touched by it.

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
		.catch(() => cached);

	return cached ?? network;
};
```

That is stale-while-revalidate: serve the cached copy instantly if there is one,
fetch a fresh copy in the background for next time, and fall back to the cache
when the network fails.

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

**It survives a bad network.** The proxy will not work offline, but the shell
loading and showing an error beats a browser error page with no explanation.

### What it deliberately skips

The route check runs first, so proxied requests never reach the cache logic.
Beyond that, the worker skips anything that is not a same-origin `GET`, its own
script, and the wisp endpoint. On Ultraviolet it also skips the proxy prefix and
`/bare/`.

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

Never cache the worker itself. A stale worker cannot be replaced by a new
deployment, which is why `sw.js` wants `Cache-Control: no-cache` from your
server.

### Deploying a new version

The cache name carries a version, and `activate` deletes every cache that does
not match it:

```js
caches
	.keys()
	.then(keys =>
		Promise.all(
			keys
				.filter(key => key !== shellCache)
				.map(key => caches.delete(key))
		)
	);
```

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
Cloudflare Pages / Vercel / Netlify   →  the shell, assets, engine bundles
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
  `noindex` only asks search engines not to index a page; it does not prevent
  filtering vendors from discovering it.
- **Abuse reports.** Your IP is the source of whatever users do. Rate limiting
  and a blocklist for abusive destinations should be in place before you need
  them.

[Running a proxy](running-a-proxy.md) covers all three in depth, with the
bandwidth arithmetic, a rate limiter, and the wisp options that stop your server
being used to reach its own internal network.

[Practices worth knowing](site-best-practices.md) covers storage, disclosure,
performance, and accessibility.
