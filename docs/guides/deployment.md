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

If you have no platform constraint, use a VPS or another host that runs a
long-lived Node process and supports WebSocket upgrades.

---

## HTTPS

Not optional. Without it there is no service worker, and without a service
worker there is no proxy.

**On a VPS**, put Caddy in front. It gets and renews certificates automatically
and proxies WebSockets correctly with no extra configuration:

```caddyfile
proxy.crllect.dev {
    reverse_proxy localhost:8080
}
```

Caddy handles ACME, HTTP/2, and WebSocket upgrades with that config.

With nginx you must be explicit, and forgetting this is the most common
"WebSockets don't work in production" cause:

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

Cloudflare proxying works with WebSockets, but check two things:

- **Do not enable "Rocket Loader" or HTML minification.** They rewrite your HTML
  and can break the proxy shell.
- **Confirm COOP/COEP survive.** Cloudflare features can add or alter response
  headers. Verify `crossOriginIsolated === true` in production, not just
  locally.

Also be aware Cloudflare's terms of service cover running proxies, and enabling
their proxy puts your traffic through them.

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
  and a blocklist for abusive destinations are worth having before you need
  them.

[Practices worth knowing](site-best-practices.md) covers storage, disclosure,
performance, and accessibility.
