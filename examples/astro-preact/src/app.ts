import "./styles.css";
import { engine } from "./engine.ts";
import { resolveInput, formatForDisplay } from "./url.ts";
import type { ProxySession } from "./types.ts";
import * as settings from "./settings.ts";
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

const frame = document.createElement("iframe");
frame.className = "frame frame--active";
frames.append(frame);

let session: ProxySession | null = null;
let sessionPending: Promise<ProxySession> | null = null;
const state = { url: "", loading: false };

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
			record(url);
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

const startUrl = (): string => {
	const configured = settings.get("homeUrl");
	if (configured) return configured;
	return "";
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

		default: {
			setStatus("");
			frame.removeAttribute("srcdoc");
			await ensureSession();
			if (options.record === false) state.url = url;
			else record(url);
			session!.go(url);
			render();
		}
	}
};

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

const refreshPopup = () => openPopup(popupPage);

addEventListener("message", event => {
	if (event.origin !== location.origin) return;
	const fromPopup = event.source === popupFrame.contentWindow;
	if (!fromPopup) return;

	const data = event.data as {
		type?: string;
		url?: string;
		patch?: unknown;
		action?: string;
	};
	if (!data || typeof data !== "object") return;

	switch (data.type) {
		case "internal:open":
			if (typeof data.url === "string") {
				closePopup();
				void navigate(data.url);
			}
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
			refreshPopup();
			break;
		}

		case "internal:action":
			switch (data.action) {
				case "reset-settings":
					const { persisted } = settings.reset();
					setStatus(
						persisted
							? "Settings reset."
							: "Reset for this session, but browser storage is unavailable."
					);
					refreshPopup();
					break;
			}
			break;

		case "internal:popup-blocked":
			setStatus("The browser blocked the popup.");
			break;
	}
});

const render = () => {

	const url = currentUrl();

	if (!addressBarFocused) addressBar.value = url ? formatForDisplay(url) : "";

	$<HTMLButtonElement>("#back").disabled = !canGoBack();
	$<HTMLButtonElement>("#forward").disabled = !canGoForward();
	$<HTMLButtonElement>("#reload").disabled = !currentSession();

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
$("#reload").addEventListener("click", () => currentSession()?.reload());

const closeMenu = () => {};
const menuRoot: ParentNode = document;

for (const button of menuRoot.querySelectorAll<HTMLElement>("[data-open]")) {
	button.addEventListener("click", () => {
		closeMenu();
		void navigate(button.dataset.open!);
	});
}
for (const button of menuRoot.querySelectorAll<HTMLElement>("[data-popup]")) {
	button.addEventListener("click", () => {
		closeMenu();
		openPopup(button.dataset.popup!, button);
	});
}

addEventListener("keydown", event => {
	if (!(event.ctrlKey || event.metaKey)) return;

	switch (event.key) {
		case "l":
			event.preventDefault();
			addressBar.focus();
			addressBar.select();
			break;
	}
});

render();
void navigate(startUrl());
