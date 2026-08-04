# Multiple tabs

A tab is an iframe, a proxy session, and some metadata. Two implementation
mistakes cause most tab problems.

Generate a project with the `tabs` feature to get a working version:

```bash
node builder/cli.js --out ./my-proxy --preset standard
```

---

## Mistake 1: unmounting hidden tabs

The instinct is to swap which iframe is in the DOM:

```js
frameContainer.replaceChildren(activeTab.element);
```

Removing an iframe from the document **destroys its document**. The page
unloads. When you switch back you get a fresh load, which means:

- Scroll position is gone.
- Form input is gone.
- Video and audio stop and restart.
- Every asset is re-fetched through the tunnel, slow, and it burns your server's
  bandwidth.
- Any site with a login flow in progress loses it.

Keep every iframe mounted and toggle **visibility**:

```css
.frame {
	position: absolute;
	inset: 0;
	display: none;
}
.frame--active {
	display: block;
}
```

```js
for (const tab of this.tabs) {
	tab.element.classList.toggle("frame--active", tab.id === id);
}
```

`display: none` preserves the document in every current browser. The frame stops
painting and stops running animation callbacks, which is what you want, but the
page stays alive.

> **Why `position: absolute`?** With every frame mounted, a static layout would
> stack them and give the container the combined height. Absolute positioning
> inside a `position: relative` container makes them all occupy the same box.

## Mistake 2: one session for every tab

The other instinct is to keep a single proxy frame and re-navigate it when the
user switches tabs, storing each tab's URL.

That is not a tab system, it is a bookmark list. Every switch is a full
navigation, and back/forward history is shared across all of them, so going back
in tab 2 can take you to a page from tab 1.

Give each tab its own session.

---

## Why separate sessions are cheap in Scramjet

Every `Frame` gets its own URL prefix, assigned at construction:

```js
this.prefix = this.controller.prefix + this.id + "/";
```

Two tabs therefore produce different proxied URLs:

```text
/~/sj/0shsju58/lo30stox/https%3A%2F%2Fcrllect.dev%2F
/~/sj/0shsju58/k29fmz11/https%3A%2F%2Fnight-network.org%2F
        ^^^^^^^^ ^^^^^^^^
        controller  frame
```

They share one controller, one service worker, one transport, and one wisp
WebSocket. What is per-frame is the routing prefix and the plugin instances.
Creating a tab is cheap.

Cookies are shared across frames. The controller keeps one `CookieJar` and
synchronises it, which is what you want: two tabs on the same site should share
a login, exactly as in a real browser.

> **Ultraviolet does not do this.** UV has one global prefix from
> `__uv$config.prefix`, so all tabs share a routing namespace. Tabs still work
> with separate iframes and separate `contentWindow.history`, but there is no
> per-tab isolation at the proxy layer.

---

## The implementation

### A tab

```js
class Tab {
	constructor(manager, { url = "" } = {}) {
		this.id = `tab-${++seq}`;
		this.url = url;
		this.title = "New tab";
		this.loading = false;
		this.session = null;

		this.element = document.createElement("iframe");
		this.element.className = "frame";
		this.element.setAttribute(
			"sandbox",
			"allow-forms allow-modals allow-popups allow-presentation " +
				"allow-same-origin allow-scripts allow-downloads"
		);
	}
}
```

**`allow-same-origin` is required.** The proxy runs the page on your origin and
the engine needs to reach into `contentWindow`. Removing it does not harden
anything; it stops the proxy working. If you were hoping `sandbox` isolates the
proxied site from your app. It cannot, because the whole design depends on
same-origin access. Treat proxied content as running with your origin's
privileges, because it is.

### Creating the session lazily

Build the session on first navigation, not on tab creation. Opening a tab should
not start a wasm runtime:

```js
const ensureSession = async tab => {
	if (tab.session) return tab.session;

	tab.session = await engine.createSession(tab.element, {
		url: url => {
			tab.url = url;
			try {
				tab.title = new URL(url).hostname.replace(/^www\./, "");
			} catch {
				tab.title = url;
			}
			tab.manager.emit();
		},
		loading: () => {
			tab.loading = true;
			tab.manager.emit();
		},
		ready: () => {
			tab.loading = false;
			tab.manager.emit();
		},
		escape: url => tab.manager.open(url)
	});

	return tab.session;
};
```

The `escape` handler is what makes `target="_blank"` behave: Scramjet's
`CatchEscapedLinksPlugin` catches navigations that would leave the proxy, and
opening them in a new tab is what users expect.

### Navigation state belongs to the tab

Each tab needs its own shell-level navigation state so Back can return to the
generated new-tab page and controls can disable at their bounds. This is
separate from the iframe's richer document history. The complete model and its
tradeoffs are in
[URL parsing and history](url-parsing-and-history.md#part-2-history).

### The manager

```js
const open = (url = "", { background = false } = {}) => {
	const tab = new Tab(manager, { url });
	manager.tabs.push(tab);
	manager.container.append(tab.element);

	if (!background || !manager.activeId) manager.select(tab.id);
	else manager.emit();

	if (url) tab.go(url);
	return tab;
};

const close = id => {
	const index = manager.tabs.findIndex(tab => tab.id === id);
	if (index === -1) return;

	const [tab] = manager.tabs.splice(index, 1);
	tab.destroy();

	if (manager.activeId === id) {
		const next = manager.tabs[index] ?? manager.tabs[index - 1];
		manager.activeId = next?.id ?? null;
		if (next) manager.select(next.id);
	}

	if (!manager.tabs.length) open();
	else manager.emit();
};
```

Two details that make it feel right: closing focuses the tab to the _right_
(matching every browser), and closing the last tab opens a fresh one rather than
leaving an empty window.

---

## Titles

Above, the title is the hostname. Getting the real `<title>` needs same-origin
access to the proxied document:

```js
const doc = tab.element.contentDocument;
const title = doc?.title;
```

This works, the frame is on your origin, but it is unreliable in a way worth
knowing: it is only correct _after_ the document has parsed its `<head>`, and
single-page apps change the title later without any navigation event. Reading it
on the `load` event catches most cases and misses SPA updates.

A `MutationObserver` on the proxied `<title>` element handles SPAs, at the cost
of holding a reference into another document that may navigate away. The
hostname is a reasonable default; upgrade if you need it.

---

## Memory

Every open tab is a live document with its own JavaScript heap. Twenty tabs of
heavy sites will use as much memory as twenty real browser tabs, because that is
what they are.

Browsers solve this by discarding background tabs and reloading on return. You
can do the same:

```js
const discard = id => {
	const tab = manager.tabs.find(tab => tab.id === id);
	if (!tab || tab.id === manager.activeId) return;

	tab.discardedUrl = tab.url;
	tab.session?.destroy();
	tab.session = null;
};
```

Then in `select()`, if a tab has a `discardedUrl` and no session, re-navigate.
Only do this under real pressure. A timer, or a count threshold. Discarding
eagerly reintroduces exactly the problem that keeping frames mounted solves.

For this to actually free anything, `destroy()` has to unregister the frame from
the controller. `controller.createFrame()` pushes onto `controller.frames` and
Scramjet 2.x has no matching remove, so dropping the iframe alone leaves the
`Frame` — its fetch handler, plugins, and hooks — reachable for the life of the
page. Every close and every discard adds one, and `setTransport()` then walks
them all. Take it out yourself:

```js
destroy() {
	const index = controller.frames.indexOf(this.frame);
	if (index !== -1) controller.frames.splice(index, 1);
	this.frame.element.remove();
}
```

---

## Keyboard shortcuts

Users expect these:

```js
addEventListener("keydown", event => {
	if (!(event.ctrlKey || event.metaKey)) return;

	if (event.key === "t") {
		event.preventDefault();
		tabs.open();
	}
	if (event.key === "l") {
		event.preventDefault();
		addressBar.select();
	}
});
```

Browsers reserve `Ctrl/Cmd+W`, so a page cannot reliably replace it with an
internal tab close. Use the close button or middle-click instead.

---

## Persisting tabs across reloads

Store the URL list, not the sessions:

```js
storage.write("tabs", {
	tabs: manager.tabs.map(t => ({ url: t.url, title: t.title })),
	activeIndex: manager.tabs.findIndex(t => t.id === manager.activeId)
});
```

On boot, recreate tabs from that list but only navigate the active one. Restore
the others lazily when they are first selected. Otherwise a reload with fifteen
tabs opens fifteen simultaneous connections through your tunnel.
