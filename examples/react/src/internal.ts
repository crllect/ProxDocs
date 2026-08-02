import cssText from "./styles.css?inline";

export type InternalPage = {
	title: string;
	render: (params: URLSearchParams) => string;
};

const pages = new Map<string, InternalPage>();

export class InternalHistory {
	#entries: string[] = [];
	#index = -1;

	get canGoBack(): boolean {
		return this.#index > 0;
	}

	get canGoForward(): boolean {
		return this.#index >= 0 && this.#index < this.#entries.length - 1;
	}

	push(url: string): void {
		if (this.#entries[this.#index] === url) return;
		this.#entries.splice(this.#index + 1);
		this.#entries.push(url);
		this.#index = this.#entries.length - 1;
	}

	back(): string | null {
		if (!this.canGoBack) return null;
		return this.#entries[--this.#index] ?? null;
	}

	forward(): string | null {
		if (!this.canGoForward) return null;
		return this.#entries[++this.#index] ?? null;
	}

	clear(): void {
		this.#entries = [];
		this.#index = -1;
	}
}

export const definePage = (name: string, definition: InternalPage) => {
	pages.set(name, definition);
};

export const isInternal = (url: string) =>
	typeof url === "string" &&
	url.slice(0, "react:".length).toLowerCase() ===
		"react:";

export const listPages = () =>
	[...pages.entries()].map(([name, def]) => ({
		name,
		title: def.title,
		url: `react://${name}`
	}));

export const scheme = "react";
export const homeUrl = `react://home`;

export const pageName = (rawUrl: string): string | null => {
	try {
		const parsed = new URL(rawUrl);
		return parsed.hostname || parsed.pathname.replace(/^\/+/, "");
	} catch {
		return null;
	}
};

export const render = (rawUrl: string): string | null => {
	const name = pageName(rawUrl);
	if (!name) return null;
	const parsed = new URL(rawUrl);
	const page = pages.get(name);

	return page
		? wrap(page.title, page.render(parsed.searchParams))
		: errorDocument(name);
};

const wrap = (title: string, body: string) => {
	const styles = `<style>${cssText}</style>`;

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

const errorDocument = (name: string) =>
	wrap(
		"Page not found",
		`<main class="internal">
       <h1>No such page</h1>
       <p><code>react://${escapeHtml(name)}</code> does not exist.</p>
       <ul>${listPages()
			.map(
				page =>
					`<li><a href="#" data-open="${page.url}">${escapeHtml(page.url)}</a></li>`
			)
			.join("")}</ul>
     </main>`
	);

export const escapeHtml = (value: unknown) =>
	String(value).replace(
		/[&<>"']/g,
		c =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;"
			})[c]!
	);
