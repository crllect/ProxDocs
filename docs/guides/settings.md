# Settings

A settings system is three things: a **schema**, **validation**, and a **change
notification**. Most proxy frontends implement the first and third and skip the
second, which is how you get a settings page that can brick the app.

## Popup or custom protocol

Settings, history, and bookmarks need somewhere to render, but they do not need
to become tab destinations. The builder supports two modes:

| Custom protocols | Menu behavior                                | Browser history        |
| ---------------- | -------------------------------------------- | ---------------------- |
| Off              | Opens a popup over the current page          | Unchanged              |
| On               | Opens `myproxy://settings` in the active tab | Adds an internal entry |

Without custom protocols, the menu renders the selected page into a separate
dialog iframe. The active proxy iframe stays mounted underneath it. The popup
writes into that iframe's existing document rather than assigning `srcdoc`,
because a child-frame navigation would still add to the browser's joint session
history. Opening, saving, and closing the dialog never calls `navigate()`,
`session.go()`, `back()`, or `forward()`, so the current URL and both history
stacks stay where they were.

```js
const openPopup = name => {
	const html = internal.render(`${internal.scheme}://${name}`);
	const doc = popupFrame.contentDocument;
	doc.open();
	doc.write(html);
	doc.close();
	popup.hidden = false;
};
```

This is the smaller choice for a one-tab proxy, a proxy without browser
controls, or a design that wants settings in a sidebar. To make a sidebar, keep
the same renderer and message boundary and replace the dialog shell with an
`aside`; the settings module does not need to change.

Enable custom protocols when menu pages should have honest addresses, occupy a
tab, and participate in internal Back and Forward navigation. Clicking an HTTP
bookmark or history result still navigates intentionally in either mode; merely
opening the menu does not.

---

## Why validation matters more here

A proxy's settings are unusually dangerous compared to a normal app's. Consider
what a wisp URL controls:

```js
const wispUrl = localStorage.getItem("wisp") || defaultWisp;
await connection.setTransport("/libcurl/index.mjs", [{ wisp: wispUrl }]);
```

That value decides **which Wisp server carries every request**. If it is
garbage, navigation stops until someone clears storage. A different Wisp server
also learns the destinations, sizes, and timing of those connections.

Storage is not trustworthy input. It can be stale from an older version, edited
by hand, corrupted by a failed write, or set by a proxied page, remember that
proxied sites run on **your origin** and can read and write your `localStorage`.

That last point deserves emphasis: **a proxied site can write to your
settings**. Read-time validation prevents malformed values from breaking
startup, but a valid attacker-controlled Wisp URL still passes validation. Do
not treat browser storage as a security boundary.

---

## The shape

Each setting declares how to validate itself:

```js
export const schema = {
	searchEngine: {
		section: "browsing",
		label: "Search engine",
		default: "https://search.brave.com/search?q=%s",
		validate: searchTemplate,
		help: "Used when what you typed is not a URL. Must contain %s."
	},
	wispUrl: {
		section: "network",
		label: "Wisp server",
		default: "",
		validate: wispUrl,
		help: "Leave blank to use this site's own server."
	}
};
```

Validators are small and take the default as a fallback:

```js
const oneOf = allowed => (value, def) =>
	allowed.includes(value) ? value : def;

const httpUrl = (value, def) => {
	const text = typeof value === "string" ? value.trim() : "";
	if (!text) return def;
	try {
		const url = new URL(text);
		return ["http:", "https:"].includes(url.protocol) ? url.href : def;
	} catch {
		return def;
	}
};

const searchTemplate = (value, def) => {
	const text = typeof value === "string" ? value.trim() : "";
	if (!text.includes("%s")) return def;
	try {
		const probe = new URL(text.replaceAll("%s", "test"));
		return ["http:", "https:"].includes(probe.protocol) ? text : def;
	} catch {
		return def;
	}
};
```

### The strict one

The wisp URL gets the tightest validation in the file, for the reasons above:

```js
const wispUrl = (value, def) => {
	const text = typeof value === "string" ? value.trim() : "";
	if (!text) return def;
	try {
		const url = new URL(text);
		if (!["ws:", "wss:"].includes(url.protocol)) return def;
		if (url.username || url.password || url.hash) return def;
		if (location.protocol === "https:" && url.protocol !== "wss:")
			return def;
		if (!url.pathname.endsWith("/")) url.pathname += "/";
		return url.href;
	} catch {
		return def;
	}
};
```

Rejecting credentials matters: `wss://user:pass@attacker.crllect.dev/` is a
valid URL and not something a settings field should ever accept.

---

## Validate on read, not just on write

The important part. Validation runs when settings are **loaded**, not only when
they are saved:

```js
const validate = raw => {
	const out = {};
	const rejected = [];

	for (const [name, def] of Object.entries(schema)) {
		const incoming = raw?.[name];
		if (incoming === undefined) {
			out[name] = def.default;
			continue;
		}

		const invalid = Symbol(name);
		const value = def.validate(incoming, invalid);
		if (value === invalid) {
			rejected.push(name);
			out[name] = def.default;
		} else {
			out[name] = value;
		}
	}

	return { settings: out, rejected };
};

export const load = () => {
	if (current) return current;
	const { settings } = validate(storage.read(STORE_KEY, {}));
	current = settings;
	return current;
};
```

Write-time validation handles your settings form. Read-time validation also
handles old versions, hand editing, corruption, and values written by proxied
pages. It validates shape and protocol, not who wrote the value.

## Tell the user what you rejected

```js
export const set = patch => {
	const { settings, rejected } = validate({ ...load(), ...patch });
	current = settings;
	storage.write(STORE_KEY, settings);
	for (const fn of listeners) fn(settings, rejected);
	return { settings, rejected };
};
```

Then surface it:

```js
const { rejected } = settings.set(patch);
setStatus(
	rejected.length
		? `Saved. These values were invalid and were reset: ${rejected.join(", ")}.`
		: "Settings saved."
);
```

Silently discarding input is why people conclude your settings page is broken.
They typed something, pressed save, and nothing happened.

---

## Storage

Keep every read and write behind one module:

```js
const namespace = "my-proxy";
const version = 1;

export const read = (name, fallback = null) => {
	try {
		const raw = localStorage.getItem(`${namespace}:${name}`);
		if (raw === null) return fallback;
		const parsed = JSON.parse(raw);
		if (parsed?.version !== version) return migrate(name, parsed, fallback);
		return parsed.value;
	} catch {
		return fallback;
	}
};

export const write = (name, value) => {
	try {
		localStorage.setItem(
			`${namespace}:${name}`,
			JSON.stringify({ version, value })
		);
		return true;
	} catch {
		return false;
	}
};
```

Three things that module does:

**Every access is wrapped in try/catch.** `localStorage` can throw when storage
is blocked or over quota. A settings read must never take down the app.

**Values are versioned.** When a setting's shape changes, `migrate()` is where
the upgrade goes. This avoids silently resetting everyone's configuration.

**Everything is namespaced.** Proxied pages share your origin's storage. A
prefix keeps your keys distinguishable and makes "clear my data" possible
without wiping the proxied sites' own storage:

```js
export const clearAll = () => {
	const prefix = `${namespace}:`;
	const doomed = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key?.startsWith(prefix)) doomed.push(key);
	}
	doomed.forEach(key => localStorage.removeItem(key));
};
```

### When to use something else

`localStorage` is right for settings: synchronous, universally available, and a
few hundred bytes. Move to **IndexedDB** when you start storing page content,
large history, or anything binary. It is asynchronous, has a much larger quota,
and does not block the main thread.

Some projects use the **Storage Buckets API** for separate eviction and quota
management. Browser support is limited, so check it before depending on it.

---

## Applying changes

Settings that only take effect on reload feel broken. Notify and apply:

```js
export const onChange = fn => {
	listeners.add(fn);
	return () => listeners.delete(fn);
};
```

```js
const applyTransportSettings = async () => {
	await engine.setTransport({
		kind: settings.get("transport"),
		wisp: settings.get("wispUrl")
	});
};

settings.onChange(() => void applyTransportSettings());
```

A transport change applies to the next request. Existing pages keep their
connections until reloaded. Say so in the UI rather than letting people wonder
whether it worked.

Note what that listener does: `onChange` fires for **every** setting, so
changing the home page or the search engine runs `applyTransportSettings` too.
That is the right shape for the call site, since it stays one line and can never
go stale as the schema grows, but it works only because the engine treats a
repeat of the current transport as a no-op. If yours rebuilds unconditionally,
editing an unrelated field constructs a second WebAssembly client and swaps it
under every open frame. See
[Switch only when the choice actually changed](../concepts/transports.md).

Apply stored settings once at boot too, or a saved choice silently reverts to
the default on every reload. Seed before `init()`, not after, so boot builds the
saved transport instead of building the default and immediately replacing it:

```js
void applyTransportSettings();
engine.init().catch(() => setStatus("Could not reach the proxy backend."));
```

---

## Rendering the form from the schema

Because the schema knows each setting's type and section, the form can generate
its controls and labels from one source:

```js
const field = (name, def) => {
	const value = current[name];
	if (typeof def.default === "boolean") {
		return row(
			def,
			`<input type="checkbox" name="${name}" ${value ? "checked" : ""}>`
		);
	}
	return row(
		def,
		`<input type="text" name="${name}" value="${escapeHtml(value ?? "")}">`
	);
};
```

Always escape values into HTML. A setting can contain anything, including
something a proxied page wrote there.

---

## Cloaking

The generated settings page keeps all cloaking controls in one section. There is
no separate cloaking page or toolbar button.

- **Preset** changes the current tab title and icon. Google Classroom, Google
  Drive, Google Docs, and Desmos are included.
- **Custom** enables the title and icon URL fields.
- **Open in about:blank** opens a same-origin blank tab and embeds the app.
- **Open as blob** creates a temporary HTML document with a blob URL and embeds
  the app there.

The two open buttons call `window.open()` directly from their click handler.
Moving that call into an asynchronous `postMessage` handler causes browsers to
treat it as a popup and block it.

Cloaking only changes what is visible in the tab and address bar. It does not
change the Wisp or Bare connection, and it does not restrict browser extensions
or device-management software. Network visibility depends on the transport, not
the cloak.

---

## Verifying iframe messages

Both menu modes use an iframe document that does not share the shell's existing
module scope, so settings changes cross the boundary with `postMessage`. The
source check differs by mode: a protocol page must also be the active internal
tab, while a popup message must come from the dedicated popup frame.

```js
addEventListener("message", event => {
	if (event.origin !== location.origin) return;
	const fromPopup = event.source === popupFrame.contentWindow;
	const fromInternal =
		internal.isInternal(currentUrl()) &&
		event.source === tabs.active?.element.contentWindow;
	if (!fromPopup && !fromInternal) return;
	const data = event.data;
	if (!data || typeof data !== "object") return;

	if (
		data.type === "internal:settings" &&
		data.patch &&
		typeof data.patch === "object"
	) {
		const { rejected } = settings.set(data.patch);
		setStatus(
			rejected.length ? "Some values were reset." : "Settings saved."
		);
	}
});
```

**Check the expected source, origin, and shape of every message.** For protocol
pages, also check the current URL. Proxied frames are same-origin and keep the
same `contentWindow` after navigation, so origin and active-frame source checks
alone do not identify an internal settings document. The popup has a separate,
stable `contentWindow`, so an exact comparison identifies it without requiring
the active URL to be internal. Validate every accepted value in either mode.

See [Custom protocols](custom-protocols.md) for why internal pages are rendered
this way.
