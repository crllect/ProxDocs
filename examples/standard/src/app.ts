import "./styles.scss";
import { engine } from "./engine.ts";
import { resolveInput, formatForDisplay } from "./url.ts";
import type { ProxySession } from "./types.ts";
import * as settings from "./settings.ts";
import { TabManager } from "./tabs.ts";
import * as visitLog from "./history.ts";
import * as bookmarks from "./bookmarks.ts";
import * as internal from "./internal.ts";
import { registerInternalPages } from "./internal-pages.ts";

const $ = <T extends HTMLElement>(selector: string): T =>
	document.querySelector<T>(selector)!;

const addressBar = $<HTMLInputElement>("#address");
const frames = $<HTMLElement>("#frames");
const status = $<HTMLElement>("#status");

let addressBarFocused = false;
addressBar.addEventListener("focus", () => (addressBarFocused = true));
addressBar.addEventListener("blur", () => (addressBarFocused = false));

registerInternalPages();

const tabs = new TabManager(frames);
const tabStrip = $<HTMLElement>("#tabs");

tabs.onChange(() => render());

const currentSession = (): ProxySession | null => tabs.active?.session ?? null;
const currentUrl = (): string => tabs.active?.url ?? "";
const currentTitle = (): string => tabs.active?.title ?? "";
const isLoading = (): boolean => tabs.active?.loading ?? false;

const canGoBack = (): boolean => tabs.active?.canGoBack ?? false;
const canGoForward = (): boolean => tabs.active?.canGoForward ?? false;
const goBack = (): string | null => tabs.active?.back() ?? null;
const goForward = (): string | null => tabs.active?.forward() ?? null;

const renderTabs = () => {
	const nodes = tabs.tabs.map(tab => {
		const el = document.createElement("div");
		el.className = tab.id === tabs.activeId ? "tab tab--active" : "tab";
		el.setAttribute("role", "tab");
		el.setAttribute("aria-selected", String(tab.id === tabs.activeId));
		el.tabIndex = 0;

		const label = document.createElement("span");
		label.className = "tab__label";
		label.textContent = tab.loading ? "loading" : tab.title;
		label.title = tab.url || tab.title;

		const close = document.createElement("button");
		close.className = "tab__close";
		close.type = "button";
		close.setAttribute("aria-label", `Close ${tab.title}`);
		close.textContent = "x";
		close.addEventListener("click", event => {
			event.stopPropagation();
			tabs.close(tab.id);
		});

		el.append(label, close);
		el.addEventListener("click", () => tabs.select(tab.id));
		el.addEventListener("keydown", event => {
			switch (event.key) {
				case "Enter":
				case " ":
					event.preventDefault();
					tabs.select(tab.id);
					break;
			}
		});
		el.addEventListener("auxclick", event => {
			if (event.button === 1) {
				event.preventDefault();
				tabs.close(tab.id);
			}
		});

		return el;
	});

	const add = document.createElement("button");
	add.type = "button";
	add.setAttribute("aria-label", "New tab");
	add.title = "New tab";
	add.textContent = "+";
	add.addEventListener("click", () => {
		tabs.open();
		void navigate(startUrl());
		addressBar.focus();
	});

	tabStrip.replaceChildren(...nodes, add);
};

const startUrl = (): string => {
	const configured = settings.get("homeUrl");
	if (configured) return configured;
	return internal.homeUrl;
};

const searchTemplate = (): string => {
	return settings.get("searchEngine");
};

const navigate = async (
	input: string,
	options: { record?: boolean } = {}
): Promise<void> => {
	const { url, kind } = resolveInput(input, searchTemplate());

	switch (kind) {
		case "empty":
			return;

		case "blocked":
			setStatus("That address cannot be opened through the proxy.");
			return;

		case "external":
			location.assign(url);
			return;

		case "internal": {
			const html = internal.render(url);
			if (html === null) return;
			const tab = tabs.active ?? tabs.open();
			if (options.record !== false) tab.internalHistory.push(url);
			if (options.record !== false) tab.record(url);
			tab.url = url;
			tab.title = url.replace("standard://", "");
			tab.loading = false;
			tab.element.removeAttribute("src");
			tab.element.srcdoc = html;
			tabs.emit();
			return;
		}

		default: {
			setStatus("");
			const tab = tabs.active ?? tabs.open();
			if (options.record === false) {
				tab.url = url;
				tab.element.removeAttribute("srcdoc");
				await tab.ensureSession();
				tab.session!.go(url);
				tabs.emit();
			} else {
				await tab.go(url);
			}
		}
	}
};

const refreshInternalPages = (names: readonly string[]) => {
	for (const tab of tabs.tabs) {
		if (
			!internal.isInternal(tab.url) ||
			!names.includes(internal.pageName(tab.url) ?? "")
		)
			continue;
		const html = internal.render(tab.url);
		if (html !== null) tab.element.srcdoc = html;
	}
	tabs.emit();
};

visitLog.onChange(() => refreshInternalPages(["history"]));
bookmarks.onChange(() => refreshInternalPages(["bookmarks"]));

addEventListener("message", event => {
	if (event.origin !== location.origin) return;
	if (!internal.isInternal(currentUrl())) return;
	if (event.source !== tabs.active?.element.contentWindow) return;

	const data = event.data as {
		type?: string;
		url?: string;
		patch?: unknown;
		action?: string;
	};
	if (!data || typeof data !== "object") return;

	switch (data.type) {
		case "internal:open":
			if (typeof data.url === "string") void navigate(data.url);
			break;

		case "internal:settings": {
			if (!data.patch || typeof data.patch !== "object") break;
			const { rejected, persisted } = settings.set(data.patch as never);
			const saved = persisted
				? "Saved."
				: "Applied for this session, but browser storage is unavailable.";
			setStatus(
				rejected.length
					? `${saved} Invalid values reset: ${rejected.join(", ")}.`
					: saved
			);
			void applyTransport();
			void navigate(currentUrl());
			break;
		}

		case "internal:action":
			switch (data.action) {
				case "clear-history":
					setStatus(
						visitLog.clear()
							? "History cleared."
							: "History cleared for this session, but browser storage is unavailable."
					);
					void navigate(currentUrl());
					break;
				case "reset-settings":
					const { persisted } = settings.reset();
					void applyTransport();
					setStatus(
						persisted
							? "Settings reset."
							: "Reset for this session, but browser storage is unavailable."
					);
					void navigate(currentUrl());
					break;
			}
			break;

		case "internal:popup-blocked":
			setStatus("The browser blocked the popup.");
			break;
	}
});

const applyTransport = async (): Promise<void> => {
	try {
		await engine.setTransport?.({
			kind: settings.get("transport") as never,
			wisp: settings.get("wispUrl")
		});
	} catch (error) {
		setStatus(`Could not switch transport: ${(error as Error).message}`);
	}
};

const render = () => {
	renderTabs();

	const url = currentUrl();

	if (!addressBarFocused) addressBar.value = url ? formatForDisplay(url) : "";

	$<HTMLButtonElement>("#back").disabled = !canGoBack();
	$<HTMLButtonElement>("#forward").disabled = !canGoForward();
	$<HTMLButtonElement>("#reload").disabled =
		!currentSession() && !internal.isInternal(url);

	const star = $<HTMLButtonElement>("#bookmark");
	const bookmarkable = /^https?:/i.test(url);
	star.disabled = !bookmarkable;
	star.setAttribute(
		"aria-pressed",
		String(bookmarkable ? bookmarks.has(url) : false)
	);

	if (isLoading()) setStatus("Loading");
	else if (status.textContent === "Loading") setStatus("");
};

const setStatus = (message: string) => {
	status.textContent = message ?? "";
	status.hidden = !message;
};

$("#omnibox").addEventListener("submit", event => {
	event.preventDefault();
	addressBar.blur();
	void navigate(addressBar.value);
});

$("#back").addEventListener("click", () => {
	const url = goBack();
	if (url) void navigate(url, { record: false });
});
$("#forward").addEventListener("click", () => {
	const url = goForward();
	if (url) void navigate(url, { record: false });
});
$("#reload").addEventListener("click", () => {
	if (internal.isInternal(currentUrl())) {
		void navigate(currentUrl());
		return;
	}
	currentSession()?.reload();
});

const menu = $<HTMLElement>("#menu");
const menuToggle = $<HTMLButtonElement>("#menu-toggle");

menuToggle.addEventListener("click", () => {
	menu.hidden = !menu.hidden;
	menuToggle.setAttribute("aria-expanded", String(!menu.hidden));
});

for (const button of menu.querySelectorAll<HTMLElement>("[data-open]")) {
	button.addEventListener("click", () => {
		menu.hidden = true;
		menuToggle.setAttribute("aria-expanded", "false");
		void navigate(button.dataset.open!);
	});
}

$("#bookmark").addEventListener("click", () => {
	const url = currentUrl();
	if (!/^https?:/i.test(url)) return;
	bookmarks.toggle(url, currentTitle());
	render();
});

bookmarks.onChange(() => render());

addEventListener("keydown", event => {
	if (!(event.ctrlKey || event.metaKey)) return;

	switch (event.key) {
		case "l":
			event.preventDefault();
			addressBar.focus();
			addressBar.select();
			break;
		case "t":
			event.preventDefault();
			tabs.open();
			void navigate(startUrl());
			addressBar.focus();
			break;
	}
});

void applyTransport();
engine.init().catch(() => setStatus("Could not reach the proxy backend."));

tabs.open();
void navigate(startUrl());
