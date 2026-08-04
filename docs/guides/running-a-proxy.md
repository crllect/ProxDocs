# Running a proxy

[Deployment](deployment.md) gets you online. This page is about the weeks after
that, which almost nobody writes down and everybody discovers the hard way.

If you are running something only you use, most of this does not apply. It
becomes relevant the moment you give the link to somebody else.

---

## What actually happens

A rough timeline, from watching a lot of these:

```text
Day 1      It works. You share the link.
Week 1     Users arrive. Bandwidth becomes a real number.
Week 2-4   The domain lands on a filtering vendor's list.
           A host or registrar email arrives, or does not.
Month 2+   Either you are maintaining it, or it is quietly down.
```

None of this is a reason not to build one. It is a reason to decide which of it
you are willing to deal with before you find out.

---

## Bandwidth is the first wall

Every byte of every page passes through your server twice, in from the
destination and out to the user. There is no caching layer that helps, because
the traffic is per-user and mostly not cacheable.

A rough figure to plan with: **a user browsing normally costs a few hundred MB
an hour**, and a user watching video costs several GB. Twenty casual users can
clear a terabyte in a month.

Check your provider's allowance before you advertise anywhere. The common
outcomes when you exceed it are a large bill, or the instance being throttled to
unusability. Some providers advertise "unlimited" and mean "until we notice."

Video drives most of it. If your bandwidth is capped, blocking video
destinations buys you more than anything else on this page. See
[destination blocklists](#a-destination-blocklist) below.

---

## Getting blocked

Two independent mechanisms, often confused.

**Filtering vendors** maintain category lists that network administrators
subscribe to. Getting on one is a matter of time and popularity. They run
crawlers, they accept submissions, and a proxy being used on a filtered network
gets noticed by the filter.

You cannot appeal your way off these lists. What people do instead is rotate
domains, which works, and works for a shorter stretch each time.

**Destination sites** block you directly, by IP. A datacenter IP address making
requests for many users looks exactly like abuse to a rate limiter, because at
the network level it is indistinguishable. Symptoms are captchas everywhere,
`429` responses, and sites that worked last week refusing to load. See
[site compatibility](../reference/site-compatibility.md).

`noindex` on your pages asks search engines not to list you. It does nothing
about either mechanism above, because filtering vendors are not search engines.

---

## Rate limiting

Worth having before you need it, because you will want it in a hurry.

Wisp connections are long-lived WebSockets, so per-request limiting does not
fit. Limit **concurrent connections per IP** at the upgrade:

```js
const connectionsPerIp = new Map();
const maxPerIp = 8;

server.on("upgrade", (request, socket, head) => {
	const ip = request.socket.remoteAddress ?? "unknown";
	const open = connectionsPerIp.get(ip) ?? 0;

	if (open >= maxPerIp) {
		socket.end("HTTP/1.1 429 Too Many Requests\r\n\r\n");
		return;
	}

	connectionsPerIp.set(ip, open + 1);
	socket.on("close", () => {
		const remaining = (connectionsPerIp.get(ip) ?? 1) - 1;
		if (remaining > 0) connectionsPerIp.set(ip, remaining);
		else connectionsPerIp.delete(ip);
	});

	wisp.routeRequest(request, socket, head);
});
```

Eight is a reasonable starting point. A single page legitimately opens several
streams, so a limit of one or two breaks ordinary browsing.

If you sit behind a reverse proxy, `remoteAddress` is the proxy's address for
every user, so you are rate limiting everyone as one client. Read the forwarded
header instead, and only trust it because you control the proxy setting it.

---

## A destination blocklist

You are the exit node for whatever your users do. A blocklist is not censorship
policy, it is the thing that keeps your server from being the source of traffic
you want no part of.

`wisp-js` exposes options for this:

```js
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

wisp.options.blocked_hostnames = ["metadata.google.internal"];
wisp.options.allow_loopback_ips = false;
wisp.options.allow_private_ips = false;
```

**The last two matter more than the list.** Without them, a user can point your
proxy at `127.0.0.1` or `10.0.0.0/8` and reach services on your own machine and
your provider's internal network, including cloud metadata endpoints, which on
several providers hand out credentials to anything that asks. This is
[SSRF](https://developer.mozilla.org/en-US/docs/Web/Security), and a wisp server
is an excellent one if you leave it open.

Turn both off before you expose the server to anyone. This is the one item on
this page that is a security bug rather than a preference.

---

## When someone emails you

Hosts forward abuse complaints. The complaint names your IP, because your IP is
what the destination saw.

What tends to work:

- **Answer.** An ignored complaint escalates to suspension; an answered one
  usually does not.
- **Say what the service is.** "This is a web proxy, the traffic originated from
  a user" is a normal answer that abuse desks understand.
- **Show a control.** Rate limiting and a blocklist demonstrate you are running
  something rather than hosting an open relay.
- **Block the specific destination** if the complaint is about one.

What does not work is claiming you have logs you do not have, or that you can
identify a user you cannot. Do not invent capabilities under pressure.

---

## Logging, and why less is better

The instinct after the first complaint is to log everything. Think about what
that creates.

A log of which users visited which sites is exactly the record that makes you
the target of the next request for it, and exactly the record that harms your
users if the server is compromised. You are running a service whose users
believe it is private.

A defensible middle:

- **Log volume and errors.** Connection counts, bandwidth, failures. Enough to
  operate.
- **Do not log destinations against identities.** Aggregate counts are fine.
- **Set retention and actually enforce it.** A log nobody rotates is a log that
  exists forever.
- **Say what you keep**, in one line, on the site.

If you actually need per-user destination logs to run the thing, the service has
outgrown hobby scale and the privacy policy needs to be a real document.

---

## Tell your users what this is

A short, honest page is most of what separates a proxy people should trust from
one they should not.

> This proxy routes your traffic through our server. We can see which sites you
> connect to. It hides your browsing from your network, not from us. It does not
> make you anonymous. Video from paid streaming services will not work. We keep
> connection counts for a week and nothing else.

Every sentence there is checkable. A proxy that says nothing still makes a
claim, because users read silence as "this is private."

[Practices worth knowing](site-best-practices.md) covers what the pieces do and
do not hide, in more detail.

---

## Know your own situation

Most people building these are on a school or workplace network, and the
question of whether running one is _allowed_ is separate from whether it is
_possible_.

Acceptable use policies usually cover circumventing network controls, and the
consequence lands on whoever ran it. Hosting providers' terms frequently
prohibit open proxies outright, which is why the takedown in the timeline above
is such a common ending.

This is not a warning against building one. Building a proxy teaches you more
about how the web actually works than most projects will. It is a suggestion to
know which rules you are operating under, rather than finding out from an email.

---

## Where to go next

- [Deployment](deployment.md). Hosting, HTTPS, capacity, and the go-live
  checklist.
- [Site compatibility](../reference/site-compatibility.md). Which failures are
  yours and which are not.
- [Practices worth knowing](site-best-practices.md). Storage, disclosure,
  performance, accessibility.
