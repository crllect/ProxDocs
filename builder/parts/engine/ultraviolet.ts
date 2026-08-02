import type {
	ProxyEngine,
	ProxySession,
	SessionHandlers,
	TransportConfig,
	TransportChoice
} from "./types.ts";

declare const __uv$config: {
	prefix: string;
	encodeUrl: (url: string) => string;
	decodeUrl: (encoded: string) => string;
	sw: string;
};

declare const BareMux: {
	BareMuxConnection: new (workerPath: string) => {
		setTransport(modulePath: string, args: unknown[]): Promise<void>;
	};
};

type Connection = InstanceType<typeof BareMux.BareMuxConnection>;

let connection: Connection | null = null;
let ready: Promise<Connection> | null = null;

export const defaultWispUrl = (): string => {
	const scheme = location.protocol === "https:" ? "wss:" : "ws:";
	return scheme + "//" + location.host + "/wisp/";
};

//#if transportBare
export const bareUrl = new URL("/bare/", location.href).href;
//#endif

let currentTransport: TransportConfig = {
	kind: "{{DEFAULT_TRANSPORT}}",
	wisp: "",
	bare: ""
};

const transportEntry = (
	kind: string
): { module: string; args: unknown[] } | null => {
	switch (kind) {
		//#if transportWisp
		//#if hasLibcurl
		case "libcurl":
			return {
				module: "/libcurl/index.mjs",
				args: [{ wisp: currentTransport.wisp || defaultWispUrl() }]
			};
		//#endif
		//#if hasEpoxy
		case "epoxy":
			return {
				module: "/epoxy/index.mjs",
				args: [{ wisp: currentTransport.wisp || defaultWispUrl() }]
			};
		//#endif
		//#endif
		//#if transportBare
		case "bare":
			return {
				module: "/baremod/index.mjs",
				args: [currentTransport.bare || bareUrl]
			};
		//#endif
		default:
			return null;
	}
};

const applyTransport = async (): Promise<void> => {
	const entry =
		transportEntry(currentTransport.kind) ??
		transportEntry("{{DEFAULT_TRANSPORT}}");
	if (!entry)
		throw new Error(
			`No transport available for "${currentTransport.kind}"`
		);
	await connection!.setTransport(entry.module, entry.args);
};

const registerServiceWorker = async (): Promise<ServiceWorkerRegistration> => {
	if (!("serviceWorker" in navigator)) {
		throw new Error(
			"Service workers are unavailable. The page must be served over https:// " +
				"or from a localhost secure context."
		);
	}

	const registration = await navigator.serviceWorker.register("/uv-sw.js", {
		scope: __uv$config.prefix
	});
	const worker =
		registration.active ?? registration.installing ?? registration.waiting;
	if (worker && worker.state !== "activated") {
		await new Promise<void>((resolve, reject) => {
			const check = () => {
				if (worker.state === "activated") resolve();
				if (worker.state === "redundant")
					reject(new Error("Service worker installation failed"));
			};
			worker.addEventListener("statechange", check);
			check();
		});
	}
	return registration;
};

const boot = async (): Promise<Connection> => {
	await registerServiceWorker();

	connection = new BareMux.BareMuxConnection("/baremux/worker.js");
	await applyTransport();

	return connection;
};

const pollIntervalMs = 250;

class UltravioletSession implements ProxySession {
	url = "";
	#element: HTMLIFrameElement;
	#handlers: SessionHandlers;
	#timer: ReturnType<typeof setInterval> | null = null;
	#lastEncoded = "";
	#destroyed = false;

	constructor(element: HTMLIFrameElement, handlers: SessionHandlers) {
		this.#element = element;
		this.#handlers = handlers;

		this.#element.addEventListener("load", () => {
			this.#poll();
			this.#handlers.ready?.();
		});

		this.#timer = setInterval(() => this.#poll(), pollIntervalMs);
	}

	get element(): HTMLIFrameElement {
		return this.#element;
	}

	#poll(): void {
		if (this.#destroyed) return;

		let pathname: string;
		try {
			pathname = this.#element.contentWindow?.location.pathname ?? "";
		} catch {
			return;
		}

		if (!pathname.startsWith(__uv$config.prefix)) return;

		const encoded = pathname.slice(__uv$config.prefix.length);
		if (!encoded || encoded === this.#lastEncoded) return;
		this.#lastEncoded = encoded;

		try {
			const decoded = __uv$config.decodeUrl(encoded);
			this.url = decoded;
			this.#handlers.url?.(decoded);
		} catch {}
	}

	go(url: string): void {
		if (this.#destroyed) return;
		this.#handlers.loading?.();
		this.#element.src = __uv$config.prefix + __uv$config.encodeUrl(url);
	}

	back(): void {
		if (!this.#destroyed) this.#element.contentWindow?.history.back();
	}

	forward(): void {
		if (!this.#destroyed) this.#element.contentWindow?.history.forward();
	}

	reload(): void {
		if (!this.#destroyed) this.#element.contentWindow?.location.reload();
	}

	destroy(): void {
		this.#destroyed = true;
		if (this.#timer) clearInterval(this.#timer);
		this.#element.remove();
	}
}

export const engine: ProxyEngine = {
	id: "ultraviolet",
	label: "Ultraviolet",
	//#if transportSwitch
	supportsTransportSwitch: true,
	//#else
	supportsTransportSwitch: false,
	//#endif
	requiresIsolation: false,

	async init() {
		ready ??= boot();
		return ready;
	},

	async createSession(element, handlers = {}) {
		await this.init();
		return new UltravioletSession(element, handlers);
	},

	//#if transportSwitch
	async setTransport(
		config: Partial<TransportConfig>
	): Promise<TransportConfig> {
		await this.init();
		currentTransport = { ...currentTransport, ...config };
		await applyTransport();
		return { ...currentTransport };
	},

	getTransport(): TransportConfig {
		return { ...currentTransport };
	},

	listTransports(): TransportChoice[] {
		return [
			//#if transportWisp
			{
				id: "libcurl",
				label: "libcurl",
				detail: "A full curl build in WebAssembly, over wisp. Widest compatibility."
			},
			{
				id: "epoxy",
				label: "epoxy",
				detail: "A Rust TLS stack in WebAssembly, over wisp. Lighter and faster."
			},
			//#endif
			//#if transportBare
			{
				id: "bare",
				label: "bare",
				detail:
					"Plain HTTP to a bare server. Works on serverless hosts, but the server " +
					"can inspect target traffic and WebSockets are unreliable."
			}
			//#endif
		];
	}
	//#endif
};

export default engine;
