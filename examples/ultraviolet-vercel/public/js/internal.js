const pages = new Map();
export class InternalHistory {
    #entries = [];
    #index = -1;
    get canGoBack() {
        return this.#index > 0;
    }
    get canGoForward() {
        return this.#index >= 0 && this.#index < this.#entries.length - 1;
    }
    push(url) {
        if (this.#entries[this.#index] === url)
            return;
        this.#entries.splice(this.#index + 1);
        this.#entries.push(url);
        this.#index = this.#entries.length - 1;
    }
    back() {
        if (!this.canGoBack)
            return null;
        return this.#entries[--this.#index] ?? null;
    }
    forward() {
        if (!this.canGoForward)
            return null;
        return this.#entries[++this.#index] ?? null;
    }
    clear() {
        this.#entries = [];
        this.#index = -1;
    }
}
export const definePage = (name, definition) => {
    pages.set(name, definition);
};
export const isInternal = (url) => typeof url === "string" &&
    url.slice(0, "ultravioletvercel:".length).toLowerCase() ===
        "ultravioletvercel:";
export const listPages = () => [...pages.entries()].map(([name, def]) => ({
    name,
    title: def.title,
    url: `ultravioletvercel://${name}`
}));
export const homeUrl = `ultravioletvercel://home`;
export const pageName = (rawUrl) => {
    try {
        const parsed = new URL(rawUrl);
        return parsed.hostname || parsed.pathname.replace(/^\/+/, "");
    }
    catch {
        return null;
    }
};
export const render = (rawUrl) => {
    const name = pageName(rawUrl);
    if (!name)
        return null;
    const parsed = new URL(rawUrl);
    const page = pages.get(name);
    return page
        ? wrap(page.title, page.render(parsed.searchParams))
        : errorDocument(name);
};
const wrap = (title, body) => {
    const styles = `<link rel="stylesheet" href="/styles.css">`;
    return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
${styles}
</head><body class="internal-page">
${body}
<script>
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-open]");
    if (link) {
      event.preventDefault();
      parent.postMessage({ type: "internal:open", url: link.dataset.open }, parent.location.origin);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (button) {
      parent.postMessage({ type: "internal:action", action: button.dataset.action }, parent.location.origin);
    }
  });
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-settings-form]");
    if (!form) return;
    event.preventDefault();
    const patch = {};
    for (const element of form.elements) {
      if (!element.name) continue;
      if (element.type === "checkbox") patch[element.name] = element.checked;
      else if (element.type === "radio") { if (element.checked) patch[element.name] = element.value; }
      else patch[element.name] = element.value;
    }
    parent.postMessage({ type: "internal:settings", patch }, parent.location.origin);
  });
<\/script>
</body></html>`;
};
const errorDocument = (name) => wrap("Page not found", `<main class="internal">
       <h1>No such page</h1>
       <p><code>ultravioletvercel://${escapeHtml(name)}</code> does not exist.</p>
       <ul>${listPages()
    .map(page => `<li><a href="#" data-open="${page.url}">${escapeHtml(page.url)}</a></li>`)
    .join("")}</ul>
     </main>`);
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
})[c]);
