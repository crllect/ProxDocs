# Practices worth knowing

Storage boundaries, privacy disclosures, performance, and accessibility.

---

## What the pieces hide

**URL codecs are obfuscation, not encryption.** `Ultraviolet.codec.xor` uses a
key in the client bundle, so users and network tools can decode it. It only
defeats simple substring matching.

**`about:blank` cloaking hides the URL from someone looking at the screen.** It
adds no network privacy. A client-side network observer normally sees the proxy
endpoint, while the Wisp or Bare server sees the destination. A managed-browser
extension can inspect the page before transport encryption.

**Over bare, you can read everything.** TLS terminates on your server. If you
run a bare deployment, say so.

**A passive Wisp relay does not terminate target TLS, but it sees metadata.**
The relay knows that a connection to `crllect.dev:443` opened, plus timing and
traffic sizes. The operator also serves the client and could modify it to expose
plaintext, so this is not a boundary against a malicious operator.

**Nothing here defeats a device management profile.** If the browser or OS is
managed, it can screenshot, log keystrokes, and inspect traffic before it is
encrypted. No web proxy touches that.

Write a short "what this does and does not do" page and link it from your
footer, especially if other people use the service.

---

## Storage is shared with proxied pages

Proxied sites run **on your origin**. They can read and write your
`localStorage`, your IndexedDB, and your cookies. A hostile page can:

-   Read your settings, including a configured wisp URL
-   Overwrite settings to point your transport somewhere it controls
-   Read your history and bookmarks
-   Fill your quota so your own writes start failing

Mitigations, in order of value:

1. **Validate settings on read**, not only on write. See
   [Settings](settings.md). This is the one that matters.
2. **Namespace your keys** so you can tell yours apart and clear them
   selectively.
3. **Never `eval` or inject anything from storage** into your shell.
4. **Do not put secrets there.** There is nowhere on this origin that a proxied
   page cannot reach.

Scramjet emulates storage per proxied site to reduce collisions, but the
security boundary is still the origin, and the origin is shared. Design as
though proxied content is hostile, because some of it is.

---

## Performance

**Enable `HttpCachePlugin`.** Without it every reload pulls every asset back
through the tunnel. Slow for users, expensive for you.

**Do not preload the engine on your landing page.** The wasm rewriter and TLS
stack are a large download. Initialise on first navigation, so people who bounce
never pay for it. The barebones preset does this; builds with transport settings
initialise at startup so the saved transport is active before navigation.

**Self-host your fonts and icons.** Under `require-corp` most CDN assets are
blocked anyway, and self-hosting is faster.

**Serve the wasm with compression.** `scramjet.wasm` compresses well; make sure
your server or CDN applies gzip or brotli to it.

---

## Accessibility

Proxy frontends are notoriously bad at this, and it is easy to fix:

-   **Keyboard navigation.** Tabs reachable by Tab, activated by Enter or Space.
    `Ctrl/Cmd+L` to focus the address bar.
-   **Focus visible.** Do not `outline: none` without a replacement.
-   **Label the icon buttons.** `aria-label="Back"` on a `‹` glyph.
-   **Announce state.** `role="status"` on your status line so screen readers
    report loading and errors.
-   **Respect `prefers-reduced-motion`.** Loading animations especially.
-   **Choose an intentional color scheme.** The generated UI is always dark; add
    a user setting or `prefers-color-scheme` handling if you need both themes.

The generated projects include keyboard tabs, labels, visible focus states, and
a live status region.
