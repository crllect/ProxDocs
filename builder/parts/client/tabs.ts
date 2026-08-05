import { engine } from "./engine.ts";
import type { ProxySession } from "./types.ts";
//#if aboutPages
import { InternalHistory } from "./internal.ts";
//#endif
//#if settings
import * as settings from "./settings.ts";
//#endif
//#if history
import * as visitLog from "./history.ts";
//#endif

let seq = 0;

export class Tab {
	id: string;
	url: string;
	title = "new tab";
	loading = false;
	error: string | null = null;
	session: ProxySession | null = null;
	element: HTMLIFrameElement;
	history: string[] = [];
	historyIndex = -1;
	//#if aboutPages
	internalHistory = new InternalHistory();
	//#endif

	#manager: TabManager;
	#sessionPending: Promise<ProxySession> | null = null;
	#destroyed = false;

	constructor(manager: TabManager, options: { url?: string } = {}) {
		this.id = `tab-${++seq}`;
		this.url = options.url ?? "";
		this.#manager = manager;

		this.element = document.createElement("iframe");
		this.element.className = "frame";
		this.element.dataset.tabId = this.id;
		this.element.setAttribute(
			"sandbox",
			"allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads"
		);
		this.element.setAttribute(
			"allow",
			"autoplay; fullscreen; clipboard-read; clipboard-write"
		);
	}

	async ensureSession(): Promise<ProxySession> {
		if (this.session) return this.session;
		if (this.#sessionPending) return this.#sessionPending;

		this.#sessionPending = engine.createSession(this.element, {
			url: url => {
				if (this.element.srcdoc) return;
				this.record(url);
				this.error = null;
				try {
					this.title = new URL(url).hostname.replace(/^www\./, "");
				} catch {
					this.title = url;
				}
				//#if history
				//#if settings
				if (settings.get("saveHistory"))
					visitLog.record(url, this.title);
				//#else
				visitLog.record(url, this.title);
				//#endif
				//#endif
				this.#manager.emit();
			},
			loading: () => {
				this.loading = true;
				this.#manager.emit();
			},
			ready: () => {
				this.loading = false;
				this.#manager.emit();
			},
			error: error => {
				this.loading = false;
				this.error = (error as Error)?.message ?? String(error);
				this.#manager.emit();
			},
			escape: url => {
				this.#manager.open(url);
			}
		});

		const pending = this.#sessionPending;
		try {
			const session = await pending;
			if (this.#destroyed) {
				session.destroy();
				return session;
			}
			this.session = session;
		} finally {
			if (this.#sessionPending === pending) this.#sessionPending = null;
		}

		return this.session;
	}

	async go(url: string): Promise<void> {
		if (this.#destroyed) return;
		//#if aboutPages
		this.internalHistory.clear();
		//#endif
		this.element.removeAttribute("srcdoc");
		const session = await this.ensureSession();
		if (this.#destroyed) {
			session.destroy();
			return;
		}
		this.record(url);
		session.go(url);
		this.#manager.emit();
	}

	record(url: string): void {
		if (this.history[this.historyIndex] === url) {
			this.url = url;
			return;
		}

		const existing = this.history.lastIndexOf(url, this.historyIndex - 1);
		if (existing >= 0) {
			this.historyIndex = existing;
			this.url = url;
			return;
		}

		this.history.splice(this.historyIndex + 1);
		this.history.push(url);
		this.historyIndex = this.history.length - 1;
		this.url = url;
	}

	get canGoBack(): boolean {
		return this.historyIndex > 0;
	}

	get canGoForward(): boolean {
		return (
			this.historyIndex >= 0 &&
			this.historyIndex < this.history.length - 1
		);
	}

	back(): string | null {
		if (!this.canGoBack) return null;
		this.historyIndex--;
		return this.history[this.historyIndex] ?? null;
	}

	forward(): string | null {
		if (!this.canGoForward) return null;
		this.historyIndex++;
		return this.history[this.historyIndex] ?? null;
	}

	reload(): void {
		this.session?.reload();
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.session?.destroy();
		this.session = null;
		void this.#sessionPending?.then(
			session => session.destroy(),
			() => {}
		);
		this.element.remove();
	}
}

export class TabManager {
	tabs: Tab[] = [];
	activeId: string | null = null;

	#container: HTMLElement;
	#listeners = new Set<(manager: TabManager) => void>();

	constructor(container: HTMLElement) {
		this.#container = container;
	}

	onChange(fn: (manager: TabManager) => void) {
		this.#listeners.add(fn);
		return () => this.#listeners.delete(fn);
	}

	emit(): void {
		for (const fn of this.#listeners) fn(this);
	}

	get active(): Tab | null {
		return this.tabs.find(t => t.id === this.activeId) ?? null;
	}

	open(url = "", options: { background?: boolean } = {}): Tab {
		const tab = new Tab(this, { url });
		this.tabs.push(tab);
		this.#container.append(tab.element);

		if (!options.background || !this.activeId) this.select(tab.id);
		else this.emit();

		if (url) void tab.go(url);
		return tab;
	}

	select(id: string): void {
		if (!this.tabs.some(t => t.id === id)) return;
		this.activeId = id;

		for (const tab of this.tabs) {
			tab.element.classList.toggle("frame--active", tab.id === id);
		}

		this.emit();
	}

	close(id: string): void {
		const index = this.tabs.findIndex(t => t.id === id);
		if (index === -1) return;

		const [tab] = this.tabs.splice(index, 1);
		tab.destroy();

		if (this.activeId === id) {
			const next = this.tabs[index] ?? this.tabs[index - 1];
			this.activeId = next?.id ?? null;
			if (next) this.select(next.id);
		}

		if (!this.tabs.length) this.open();
		else this.emit();
	}

	closeOthers(id: string): void {
		for (const tab of [...this.tabs]) if (tab.id !== id) this.close(tab.id);
	}

	move(id: string, toIndex: number): void {
		const from = this.tabs.findIndex(t => t.id === id);
		if (from === -1) return;
		const [tab] = this.tabs.splice(from, 1);
		this.tabs.splice(
			Math.max(0, Math.min(toIndex, this.tabs.length)),
			0,
			tab
		);
		this.emit();
	}
}
