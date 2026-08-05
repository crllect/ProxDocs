# Cookies and sessions

A logged-in proxied site is a cookie that survived. This page is about where
that cookie lives, who owns it, and the three ways people accidentally destroy
it.

Scramjet 2.x handles almost all of this for you. The value of knowing the
mechanism is that when a login doesn't stick, you can tell which layer broke.

---

## Why cookies can't just work

A proxied page runs on **your** origin. From the browser's point of view there
is one site, yours, and every proxied page is part of it.

If Scramjet let `document.cookie` reach the real browser cookie store, every
proxied site would share one jar scoped to your domain. Logging into one site
would leak its session cookie to the next site you visited, and two sites using
the same cookie name would overwrite each other. It would also mean a proxied
page could read your own app's cookies.

So Scramjet doesn't use the browser's cookie store for proxied content. It keeps
its own.

---

## The `CookieJar`

The [controller](wiring.md) owns a single `CookieJar`:

```js
controller.cookieJar;
```

One jar, all frames, keyed by the **destination** origin rather than yours.
Cookies for `github.com` and cookies for `google.com` stay separate the way they
would in a real browser, because the jar records which origin each one came
from.

Reads and writes flow through it automatically:

- A `Set-Cookie` header on a proxied response goes into the jar, not the
  browser.
- `document.cookie` inside a proxied page is rewritten to read and write the
  jar.
- Outgoing requests get a `Cookie` header built from the jar for that
  destination.

Nothing in your application code has to participate. If you are writing cookie
handling in a plugin, you are almost certainly reimplementing this.

---

## Persistence

The jar is written to **IndexedDB**, in a database named
`__scramjet_controller`, store `state`, under the key `cookies`.

**Loading it is lazy, and you do not have to sequence it.** `controller.wait()`
does _not_ wait for the jar. It waits for the service worker handshake and the
wasm fetch. The jar loads on the first proxied request instead, and the
controller holds that request until the load finishes. So a frame created before
the jar is in memory still issues its first request with the right cookies; you
can't race it.

The persisted record is small:

```js
{ updatedAt: 1735689600001, cookies: "<serialised jar>" }
```

`updatedAt` is a logical clock, not a wall clock. Every write takes
`Math.max(Date.now(), currentUpdatedAt + 1, existingUpdatedAt + 1)`, so it
always moves forward even if two tabs write in the same millisecond or the
system clock jumps backwards. Conflict resolution is last-write-wins on that
number.

> IndexedDB is the browser's asynchronous structured storage, bigger and slower
> than `localStorage`, and the only sane place for something like this.
> [MDN has a usable overview](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

---

## Cross-tab sync

Two real browser tabs of your proxy each get their own `Controller`, each with
its own in-memory jar. They stay in step over a
[`BroadcastChannel`](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
named `__scramjet_controller_channel`.

The protocol is one message: `{ updatedAt }`. When a controller persists
cookies, it broadcasts the new timestamp. Other controllers compare it against
their own and re-read from IndexedDB if it is newer.

```text
Tab A                          Tab B
  │ login → Set-Cookie
  │ jar updated
  │ write IndexedDB
  │ broadcast { updatedAt }  ──────►
                                 │ newer? yes
                                 │ re-read IndexedDB
                                 │ jar updated
```

Only the timestamp crosses the channel, never cookie values. The reload is what
transfers state, which keeps the channel cheap and means a tab that missed a
message self-corrects on the next one.

**This is eventually consistent, not instant.** Log in on tab A and tab B
becomes logged in shortly after, not synchronously. A page mid-request in tab B
may still complete with the old jar. Almost nobody needs to engineer around
this.

---

## The service worker

The service worker sees requests too, and it needs the same cookies. It doesn't
get its own jar; the controller pushes to it over the message channel
established at construction, and the worker acknowledges when applied.

Practical consequence: **the controller is the source of truth, and it lives in
the page.** If the service worker is alive but no page holds a controller, which
happens when the worker gets revived independently, cookie state isn't available
to it until a controller reconnects. This is why the controller guards
service-worker revival for the first few seconds after boot instead of
immediately rebuilding its message port.

---

## What breaks logins

Three causes, most likely first.

### Frames created before `controller.wait()` resolved

The jar loads during boot. Create a frame first and its first requests carry no
cookies.

```js
const controller = new Controller({ serviceworker, transport });
await controller.wait();

const frame = controller.createFrame(iframe, { plugins });
```

The symptom is specific and recognizable: the **first** page load after a
refresh is logged out, and everything after it is fine.

### A second controller

Two controllers means two jars. They will fight over IndexedDB, and each one's
frames see whichever state that controller last read. Symptoms look random and
depend on tab focus.

One controller per page. If you are creating one per tab in a tabbed UI, that is
the bug. [Tabs share one controller](multiple-tabs.md) and get one frame each.

### Clearing site data

Your settings, your history, and the proxied sites' cookies are all on your
origin. A "clear everything" button that wipes IndexedDB logs the user out of
every proxied site.

That is often correct, since it is what the button says. Scope it deliberately,
and say what it does:

```js
const clearBrowsingData = async () => {
	await indexedDB.deleteDatabase("__scramjet_controller");
	location.reload();
};
```

Reload afterwards. The live controller still holds the old jar in memory and
will write it straight back.

---

## Reading the jar yourself

Rare, but legitimate: a cookie manager UI, or debugging why a site thinks you
are logged out.

```js
const jar = controller.cookieJar;
```

Treat it as opaque and read-only. Writing to it directly bypasses the persist
and broadcast steps, so your change is invisible to the service worker and to
other tabs, and disappears on the next load from IndexedDB.

If you need cookies to survive, let them get there the normal way: through a
response the proxy handled.

---

## What this doesn't give you

**Separate identities per tab.** One jar, one controller, one set of logins. Two
tabs can't be signed into the same site as different users. That needs separate
controllers on separate origins, which is a much larger design.

**Isolation from your own app.** The jar isn't the browser's cookie store, so
proxied sites can't read your app's cookies through `document.cookie`. But it
lives in IndexedDB on your origin, and a proxied page runs on your origin, so a
hostile page can reach the database directly. See
[Practices worth knowing](site-best-practices.md).

**Anything resembling privacy from the operator.** Whoever runs the proxy serves
the client. See [Wisp vs Bare](../concepts/wisp-vs-bare.md).

---

## Where to go next

- [Multiple tabs](multiple-tabs.md). One controller, many frames, and why.
- [Site compatibility](../reference/site-compatibility.md). Logins that fail for
  reasons that aren't cookies.
- [Practices worth knowing](site-best-practices.md). What proxied pages can
  reach on your origin.
