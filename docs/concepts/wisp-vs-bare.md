# Wisp vs Bare

Both answer the same question: _the browser will not let me request this URL, so
how do the bytes get out?_ They answer it very differently, and the difference
determines where you can host, whether WebSocket-based sites work, and whether
your server can read user traffic.

---

## Bare

A **Bare server** is an HTTP endpoint that performs requests for you. The client
sends a normal request to your server with the real destination in a header:

```http
GET /bare/v3/ HTTP/1.1
Host: proxy.crllect.dev
X-Bare-URL: https://crllect.dev/api/user
X-Bare-Headers: {"accept":"application/json","cookie":"session=abc123"}
```

Your server reads those headers, makes the real request to `crllect.dev`, and
sends back the response with the remote status and headers in `X-Bare-Status`
and `X-Bare-Headers`.

**The server does the whole request.** It terminates TLS with the remote site,
so it sees every byte in plaintext. URLs, cookies, request bodies, responses.

Websockets are tunnelled by upgrading the connection to your server and sending
a JSON `connect` message, after which the server pipes frames in both
directions.

The specification is
[BareServerV3](https://github.com/tomphttp/specifications/blob/master/BareServerV3.md).

### What Bare is good at

**It is ordinary HTTP.** That property lets an all-in-one build run on
request/response functions that cannot hold a socket open. See
[Serverless deployment](../guides/serverless.md).

It is also easy to reason about and easy to debug: every request is visible in
your server logs as a normal request.

### What Bare is bad at

- **Your server sees everything.** Not a theoretical concern, it is the whole
  design. You are asking users to trust you with plaintext traffic.
- **It looks exactly like what it is.** A stream of requests to one endpoint
  with an `X-Bare-URL` header is recognisable in your server and terminating
  proxy logs. HTTPS prevents passive network observers from reading the header.
- **Websockets are second-class.** They work, but the tunnel is bolted on, and
  on serverless hosts they do not work at all.
- **Per-request overhead.** Each proxied request is a fresh HTTP request to your
  server, with headers re-serialised as JSON.

---

## Wisp

**Wisp** is a multiplexing protocol that runs over a _single_ WebSocket. Instead
of "please fetch this URL for me", the client says "open a TCP socket to
`crllect.dev:443`" and then sends raw bytes.

The protocol is small. Stream packets carry a type, stream id, and payload; Wisp
v2 also uses an `INFO` packet for handshake data and extensions:

| Packet     | Meaning                                            |
| ---------- | -------------------------------------------------- |
| `CONNECT`  | Open a TCP or UDP stream to a host and port        |
| `DATA`     | Bytes for a stream, in either direction            |
| `CONTINUE` | Flow control: how much more the server will buffer |
| `CLOSE`    | Close a stream, with a reason                      |
| `INFO`     | Negotiate Wisp v2 limits and extensions            |

Many streams share one WebSocket, each with its own id. The full specification
is [the wisp protocol](https://github.com/MercuryWorkshop/wisp-protocol).

### TLS location

Wisp moves raw TCP, not HTTP requests. For an HTTPS destination, **the TLS
handshake happens in the browser**, between the WebAssembly TLS stack
([epoxy or libcurl](transports.md)) and the real site. An HTTP destination has
no target TLS and crosses the relay as plaintext.

For HTTPS, the Wisp relay sees an encrypted byte stream, the destination host
and port, connection timing, and traffic sizes. It does not passively see HTTP
paths, headers, cookies, or response bodies inside target TLS.

That gives a passive relay less application data than Bare. The site operator
also serves the client code, however, and could modify that code to expose
plaintext before encryption.

It also means:

- **Websockets to the target site are native.** They are just another TCP
  stream. Nothing is bolted on, so sites that depend on WebSockets work.
- **UDP works too**, which bare cannot do at all. The spec makes UDP optional
  for both ends and negotiates it through an extension, so it is not guaranteed
  by "speaks wisp" alone. In practice both common relays do it:
  `wisp-server-node` handles UDP streams, and `wisp-js` ships
  `allow_udp_streams: true` by default.
- **One connection is reused** for everything, so there is no per-request
  connection setup.

### What Wisp costs

**A persistent WebSocket:**

- Serverless functions cannot host it. Other serverless runtimes need a
  Wisp-compatible WebSocket and outbound-socket implementation.
- Any proxy or load balancer between you and the user must pass WebSockets
  through, correctly, without an aggressive idle timeout.
- Your server holds an open connection and open sockets per user, so capacity
  planning is about concurrent connections rather than requests per second.

There is also more machinery in the browser: a whole TLS implementation in
WebAssembly, which is a meaningful download and some startup cost.

---

## Side by side

|                              | Wisp                        | Bare                                |
| ---------------------------- | --------------------------- | ----------------------------------- |
| Moves                        | Raw TCP/UDP streams         | Whole HTTP requests                 |
| Transport                    | One persistent WebSocket    | Ordinary HTTP requests              |
| Target TLS terminates        | In the browser for HTTPS    | On your server                      |
| Relay reads target HTTP data | HTTP only; not inside HTTPS | Yes                                 |
| Websockets to target         | Native                      | Bolted on; impossible on serverless |
| UDP                          | Yes                         | No                                  |
| All-in-one request/response  | No                          | Yes                                 |
| Used by                      | Scramjet, Ultraviolet 3.x   | Scramjet, Ultraviolet 1.x–3.x       |

---

## Which do you use?

**Wisp, unless you cannot.**

Use Bare for an all-in-one deployment whose backend cannot hold a WebSocket
open. Scramjet runs over Bare through `@mercuryworkshop/bare-transport`. The
better option, if you can take it, is to keep Wisp on a separate host and point
a Scramjet client at it. See [Serverless deployment](../guides/serverless.md).

If you run Bare, tell users that your server terminates target TLS and can
inspect their requests and responses.

---

## Running a wisp server

In Node, it is a few lines. `@mercuryworkshop/wisp-js` handles the protocol; you
route upgrade requests to it:

```js
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

server.on("upgrade", (req, socket, head) => {
	if (new URL(req.url, `http://${req.headers.host}`).pathname === "/wisp/") {
		wisp.routeRequest(req, socket, head);
		return;
	}
	socket.end();
});
```

The Wisp handler only routes streams. Target TLS and HTTP are implemented by the
client transport in the browser.

> **Run your own.** Public wisp servers exist and are convenient for testing.
> They can also see which hosts you connect to, and they can disappear without
> warning. Anything you ship should default to your own server, with a custom
> one as an opt-in setting. See [Settings](../guides/settings.md) for how to
> validate a user-supplied wisp URL safely.

---

## Next

- [Transports](transports.md). Epoxy and libcurl, the things that speak wisp
- [bare-mux and proxy-transports](bare-mux.md). The layer that lets you swap
  them
