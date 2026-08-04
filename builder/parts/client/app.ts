//#if vite
import "./styles.{{STYLE_EXT}}";
//#endif
import { engine } from "./engine.ts";
import { resolveInput, formatForDisplay } from "./url.ts";
import type { ProxySession } from "./types.ts";
//#if settings
import * as settings from "./settings.ts";
//#endif
//#if tabs
import { TabManager } from "./tabs.ts";
//#endif
//#if history
import * as visitLog from "./history.ts";
//#endif
//#if bookmarks
import * as bookmarks from "./bookmarks.ts";
//#endif
//#if menuPages
import * as internal from "./internal.ts";
import { registerInternalPages } from "./internal-pages.ts";
//#endif
//#if cloak
import { applyCloak } from "./cloak.ts";
//#endif

const $ = <T extends HTMLElement>(selector: string): T =>
	document.querySelector<T>(selector)!;

const addressBar = $<HTMLInputElement>("#address");
const frames = $<HTMLElement>("#frames");
const status = $<HTMLElement>("#status");

let addressBarFocused = false;
addressBar.addEventListener("focus", () => (addressBarFocused = true));
addressBar.addEventListener("blur", () => (addressBarFocused = false));

//#if menuPages
registerInternalPages();
//#endif

//#if tabs
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
//#endif

//#if !tabs
const frame = document.createElement("iframe");
frame.className = "frame frame--active";
frames.append(frame);

let session: ProxySession | null = null;
let sessionPending: Promise<ProxySession> | null = null;
const state = { url: "", loading: false };
//#if aboutPages
const internalHistory = new internal.InternalHistory();
//#endif

const visited: string[] = [];
let visitedIndex = -1;

const record = (url: string): void => {
	state.url = url;
	if (visited[visitedIndex] === url) return;

	const existing = visited.lastIndexOf(url, visitedIndex - 1);
	if (existing >= 0) {
		visitedIndex = existing;
		return;
	}

	visited.splice(visitedIndex + 1);
	visited.push(url);
	visitedIndex = visited.length - 1;
};

const canGoBack = (): boolean => visitedIndex > 0;
const canGoForward = (): boolean =>
	visitedIndex >= 0 && visitedIndex < visited.length - 1;

const goBack = (): string | null => {
	if (!canGoBack()) return null;
	return visited[--visitedIndex] ?? null;
};

const goForward = (): string | null => {
	if (!canGoForward()) return null;
	return visited[++visitedIndex] ?? null;
};

const ensureSession = async (): Promise<ProxySession> => {
	if (session) return session;
	if (sessionPending) return sessionPending;

	sessionPending = engine.createSession(frame, {
		url: url => {
			//#if aboutPages
			if (frame.srcdoc) return;
			//#endif
			record(url);
			//#if history
			//#if settings
			if (settings.get("saveHistory")) visitLog.record(url);
			//#else
			visitLog.record(url);
			//#endif
			//#endif
			render();
		},
		loading: () => {
			state.loading = true;
			render();
		},
		ready: () => {
			state.loading = false;
			render();
		},
		error: error => {
			state.loading = false;
			setStatus((error as Error)?.message ?? String(error));
		},
		escape: url => void navigate(url)
	});

	try {
		session = await sessionPending;
	} finally {
		sessionPending = null;
	}

	return session;
};

const currentSession = (): ProxySession | null => session;
const currentUrl = (): string => state.url;
const currentTitle = (): string => state.url;
const isLoading = (): boolean => state.loading;
//#endif

const startUrl = (): string => {
	//#if settings
	const configured = settings.get("homeUrl");
	if (configured) return configured;
	//#endif
	//#if aboutPages
	return internal.homeUrl;
	//#else
	return "";
	//#endif
};

const searchTemplate = (): string => {
	//#if settings
	return settings.get("searchEngine");
	//#else
	return "https://search.brave.com/search?q=%s";
	//#endif
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

		//#if aboutPages
		case "internal": {
			const html = internal.render(url);
			if (html === null) return;
			//#if tabs
			const tab = tabs.active ?? tabs.open();
			if (options.record !== false) tab.internalHistory.push(url);
			if (options.record !== false) tab.record(url);
			tab.url = url;
			tab.title = url.replace("{{INTERNAL_SCHEME}}://", "");
			tab.loading = false;
			tab.element.removeAttribute("src");
			tab.element.srcdoc = html;
			tabs.emit();
			//#else
			if (options.record !== false) {
				internalHistory.push(url);
				record(url);
			} else state.url = url;
			frame.removeAttribute("src");
			frame.srcdoc = html;
			render();
			//#endif
			return;
		}
		//#endif

		default: {
			setStatus("");
			//#if tabs
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
			//#else
			//#if aboutPages
			internalHistory.clear();
			//#endif
			frame.removeAttribute("srcdoc");
			await ensureSession();
			if (options.record === false) state.url = url;
			else record(url);
			session!.go(url);
			render();
			//#endif
		}
	}
};

//#if aboutPages
const refreshInternalPages = (names: readonly string[]) => {
	//#if tabs
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
	//#else
	if (
		internal.isInternal(currentUrl()) &&
		names.includes(internal.pageName(currentUrl()) ?? "")
	) {
		void navigate(currentUrl(), { record: false });
	}
	//#endif
};

//#if history
visitLog.onChange(() => refreshInternalPages(["history"]));
//#endif
//#if bookmarks
bookmarks.onChange(() => refreshInternalPages(["bookmarks"]));
//#endif
//#endif

//#if popupMenus
const popup = $<HTMLElement>("#popup");
const popupFrame = $<HTMLIFrameElement>("#popup-frame");
const popupTitle = $<HTMLElement>("#popup-title");
const popupClose = $<HTMLButtonElement>("#popup-close");
const popupBackground = [...popup.parentElement!.children].filter(
	(element): element is HTMLElement =>
		element instanceof HTMLElement && element !== popup
);
let popupPage = "";

const popupFocusables = () =>
	[
		...popupFrame.contentDocument!.querySelectorAll<HTMLElement>(
			'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
		)
	].filter(element => !element.hidden);

let popupTrigger: HTMLElement | null = null;

const closePopup = () => {
	popup.hidden = true;
	for (const element of popupBackground) element.inert = false;
	popupTrigger?.focus();
};

const openPopup = (name: string, trigger: HTMLElement | null = null) => {
	popupTrigger = trigger;
	const html = internal.render(`${internal.scheme}://${name}`);
	if (html === null) return;
	popupPage = name;
	popupTitle.textContent = name;
	popupFrame.title = name;
	const doc = popupFrame.contentDocument!;
	doc.open();
	doc.write(html);
	doc.close();
	doc.addEventListener("keydown", event => {
		if (event.key === "Escape") closePopup();
		if (event.key !== "Tab") return;
		const focusable = popupFocusables();
		const edge = event.shiftKey ? focusable[0] : focusable.at(-1);
		if (!edge || doc.activeElement === edge) {
			event.preventDefault();
			popupClose.focus();
		}
	});
	for (const element of popupBackground) element.inert = true;
	popup.hidden = false;
	popupClose.focus();
};

popupClose.addEventListener("click", closePopup);
popupClose.addEventListener("keydown", event => {
	if (event.key !== "Tab") return;
	const focusable = popupFocusables();
	const target = event.shiftKey ? focusable.at(-1) : focusable[0];
	if (!target) return;
	event.preventDefault();
	target.focus();
});
popup.addEventListener("click", event => {
	if (event.target === popup) closePopup();
});
addEventListener("keydown", event => {
	if (event.key === "Escape" && !popup.hidden) closePopup();
});
//#endif

//#if popupMenus
const refreshPopup = () => openPopup(popupPage);
//#endif

//#if menuPages
addEventListener("message", event => {
	if (event.origin !== location.origin) return;
	//#if popupMenus
	const fromPopup = event.source === popupFrame.contentWindow;
	if (!fromPopup) return;
	//#else
	if (!internal.isInternal(currentUrl())) return;
	//#if tabs
	if (event.source !== tabs.active?.element.contentWindow) return;
	//#else
	if (event.source !== frame.contentWindow) return;
	//#endif
	//#endif

	const data = event.data as {
		type?: string;
		url?: string;
		patch?: unknown;
		action?: string;
	};
	if (!data || typeof data !== "object") return;

	switch (data.type) {
		case "internal:open":
			//#if popupMenus
			if (typeof data.url === "string") {
				closePopup();
				void navigate(data.url);
			}
			//#else
			if (typeof data.url === "string") void navigate(data.url);
			//#endif
			break;

		//#if settings
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
			//#if transportSwitch
			void applyTransport();
			//#endif
			//#if cloak
			applyCloak();
			//#endif
			//#if popupMenus
			refreshPopup();
			//#else
			void navigate(currentUrl());
			//#endif
			break;
		}
		//#endif

		case "internal:action":
			switch (data.action) {
				//#if history
				case "clear-history":
					setStatus(
						visitLog.clear()
							? "History cleared."
							: "History cleared for this session, but browser storage is unavailable."
					);
					//#if popupMenus
					refreshPopup();
					//#else
					void navigate(currentUrl());
					//#endif
					break;
				//#endif
				//#if settings
				case "reset-settings":
					const { persisted } = settings.reset();
					//#if transportSwitch
					void applyTransport();
					//#endif
					//#if cloak
					applyCloak();
					//#endif
					setStatus(
						persisted
							? "Settings reset."
							: "Reset for this session, but browser storage is unavailable."
					);
					//#if popupMenus
					refreshPopup();
					//#else
					void navigate(currentUrl());
					//#endif
					break;
				//#endif
			}
			break;

		case "internal:popup-blocked":
			setStatus("The browser blocked the popup.");
			break;
	}
});
//#endif

//#if transportSwitch
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
//#endif

const render = () => {
	//#if tabs
	renderTabs();
	//#endif

	const url = currentUrl();

	if (!addressBarFocused) addressBar.value = url ? formatForDisplay(url) : "";

	//#if browserControls
	$<HTMLButtonElement>("#back").disabled = !canGoBack();
	$<HTMLButtonElement>("#forward").disabled = !canGoForward();
	//#if aboutPages
	$<HTMLButtonElement>("#reload").disabled =
		!currentSession() && !internal.isInternal(url);
	//#else
	$<HTMLButtonElement>("#reload").disabled = !currentSession();
	//#endif
	//#endif

	//#if bookmarks
	const star = $<HTMLButtonElement>("#bookmark");
	const bookmarkable = /^https?:/i.test(url);
	star.disabled = !bookmarkable;
	star.setAttribute(
		"aria-pressed",
		String(bookmarkable ? bookmarks.has(url) : false)
	);
	//#endif

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

//#if browserControls
$("#back").addEventListener("click", () => {
	const url = goBack();
	if (url) void navigate(url, { record: false });
});
$("#forward").addEventListener("click", () => {
	const url = goForward();
	if (url) void navigate(url, { record: false });
});
//#if aboutPages
$("#reload").addEventListener("click", () => {
	if (internal.isInternal(currentUrl())) {
		void navigate(currentUrl());
		return;
	}
	currentSession()?.reload();
});
//#else
$("#reload").addEventListener("click", () => currentSession()?.reload());
//#endif
//#endif

//#if menuPages
//#if menuSingle
const closeMenu = () => {};
const menuRoot: ParentNode = document;
//#else
const menu = $<HTMLElement>("#menu");
const menuToggle = $<HTMLButtonElement>("#menu-toggle");
const menuRoot: ParentNode = menu;

const closeMenu = () => {
	menu.hidden = true;
	menuToggle.setAttribute("aria-expanded", "false");
};

menuToggle.addEventListener("click", () => {
	menu.hidden = !menu.hidden;
	menuToggle.setAttribute("aria-expanded", String(!menu.hidden));
});
//#endif

for (const button of menuRoot.querySelectorAll<HTMLElement>("[data-open]")) {
	button.addEventListener("click", () => {
		closeMenu();
		void navigate(button.dataset.open!);
	});
}
//#if popupMenus
for (const button of menuRoot.querySelectorAll<HTMLElement>("[data-popup]")) {
	button.addEventListener("click", () => {
		closeMenu();
		openPopup(button.dataset.popup!, button);
	});
}
//#endif
//#endif

//#if bookmarks
$("#bookmark").addEventListener("click", () => {
	const url = currentUrl();
	if (!/^https?:/i.test(url)) return;
	bookmarks.toggle(url, currentTitle());
	render();
});

bookmarks.onChange(() => render());
//#endif

//#if cloak
applyCloak();
//#endif

addEventListener("keydown", event => {
	if (!(event.ctrlKey || event.metaKey)) return;

	switch (event.key) {
		case "l":
			event.preventDefault();
			addressBar.focus();
			addressBar.select();
			break;
		//#if tabs
		case "t":
			event.preventDefault();
			tabs.open();
			void navigate(startUrl());
			addressBar.focus();
			break;
		//#endif
	}
});

//#if transportSwitch
void applyTransport();
engine.init().catch(() => setStatus("Could not reach the proxy backend."));
//#endif

//#if tabs
tabs.open();
void navigate(startUrl());
//#else
render();
void navigate(startUrl());
//#endif
