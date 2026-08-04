import type {
	ProxyEngine,
	ProxySession,
	SessionHandlers,
	TransportConfig,
	TransportChoice
} from "./types.ts";

declare const initBootstrap: (() => Promise<ScramjetController>) | undefined;

type ScramjetFrame = {
	element: HTMLIFrameElement;
	go(url: string): void;
	back(): void;
	forward(): void;
	reload(): void;
};

type ScramjetController = {
	frames: ScramjetFrame[];
	createFrame(
		element: HTMLIFrameElement,
		options: { plugins: unknown[] }
	): ScramjetFrame;
	setTransport(transport: unknown): void;
	wait(): Promise<void>;
};

let controller: ScramjetController | null = null;
let ready: Promise<ScramjetController> | null = null;

export const defaultWispUrl = (): string => {
	const scheme = location.protocol === "https:" ? "wss:" : "ws:";
	return scheme + "//" + location.host + "/wisp/";
};

const runtimeScripts = [
	"/scram/scramjet.js",
	"/controller/controller.api.js",
	"/utils/scramjet-utils.js"
];

const loadScript = (src: string): Promise<void> => {
	return new Promise((resolve, reject) => {
		const el = document.createElement("script");
		el.src = src;
		el.onload = () => resolve();
		el.onerror = () => reject(new Error("Failed to load " + src));
		document.head.append(el);
	});
};

const loadRuntimeScripts = async (): Promise<void> => {
	for (const src of runtimeScripts) await loadScript(src);
};

const registerServiceWorker = async (): Promise<ServiceWorker> => {
	if (!("serviceWorker" in navigator)) {
		throw new Error(
			"Service workers are unavailable. The page must be served over https:// " +
				"or from a localhost secure context."
		);
	}

	const registration = await navigator.serviceWorker.register("/sw.js", {
		scope: "/",
		updateViaCache: "none"
	});
	await navigator.serviceWorker.ready;

	if (!navigator.serviceWorker.controller) {
		await new Promise<void>(resolve => {
			navigator.serviceWorker.addEventListener(
				"controllerchange",
				() => resolve(),
				{
					once: true
				}
			);
		});
	}

	const worker = navigator.serviceWorker.controller ?? registration.active;
	if (!worker)
		throw new Error("Service worker registered but never became active");
	return worker;
};

const transportModules: Partial<Record<string, string>> = {
	libcurl: "/libcurl/index.mjs",
	epoxy: "/epoxy/index.mjs"
};

let currentTransport: TransportConfig = {
	kind: "libcurl",
	wisp: ""
};

let activeTransport = "";

const resolveTransport = (
	config: TransportConfig
): { path: string; wisp: string } => ({
	path:
		transportModules[config.kind] ??
		transportModules["libcurl"]!,
	wisp: config.wisp || defaultWispUrl()
});

const buildTransport = async (config: TransportConfig): Promise<unknown> => {
	const { path, wisp } = resolveTransport(config);
	const module = (await import(/* @vite-ignore */ path)) as {
		default: new (o: object) => unknown;
	};
	activeTransport = JSON.stringify([path, wisp]);
	return new module.default({ wisp });
};

const applyTransport = async (): Promise<void> => {
	const { path, wisp } = resolveTransport(currentTransport);
	if (JSON.stringify([path, wisp]) === activeTransport) return;
	controller!.setTransport(await buildTransport(currentTransport));
};

const boot = async (): Promise<ScramjetController> => {
	const [serviceworker] = await Promise.all([
		registerServiceWorker(),
		loadRuntimeScripts()
	]);

	const api = (
		window as never as {
			$scramjetController: {
				Controller: new (init: object) => ScramjetController;
			};
		}
	).$scramjetController;

	controller = new api.Controller({
		serviceworker,
		transport: await buildTransport(currentTransport),
		config: {
			scramjetPath: "/scram/scramjet.js",
			wasmPath: "/scram/scramjet.wasm",
			injectPath: "/controller/controller.inject.js"
		}
	});

	await controller.wait();

	return controller!;
};

type ScramjetUtils = {
	ManagedPlugin: new (
		name: string,
		dependencies: string[]
	) => {
		tap(
			hook: unknown,
			callback: (context: never, props: never) => void
		): void;
	};
	HttpCachePlugin: new () => unknown;
	UrlWatcherPlugin: new (onChange: (url: string) => void) => unknown;
	CatchEscapedLinksPlugin: new (to: (url: URL) => string | URL) => unknown;
};

const utils = (): ScramjetUtils => {
	return (window as never as { $scramjetUtils: ScramjetUtils })
		.$scramjetUtils;
};

type LocalPlugins = {
	ErrorPage: new (onError?: (error: unknown) => void) => object;
	HistoryUrl: new () => object;
};

let localPlugins: LocalPlugins | null = null;

const plugins = (): LocalPlugins => {
	localPlugins ??= {
		ErrorPage: class ErrorPagePlugin extends utils().ManagedPlugin {
			#onError?: (error: unknown) => void;

			constructor(onError?: (error: unknown) => void) {
				super("error-page", []);
				this.#onError = onError;
			}

			install(frame: { hooks: { error: { request: unknown } } }) {
				this.tap(
					frame.hooks.error.request,
					(context: never, props: never) => {
						const ctx = context as {
							error?: { name?: string };
							rawrequest?: { destination?: string };
						};
						const out = props as {
							suppressError?: boolean;
							setResponse?: unknown;
						};

						if (ctx.error?.name === "AbortError") return;
						if (
							!["document", "iframe", "frame"].includes(
								ctx.rawrequest?.destination ?? ""
							)
						)
							return;

						out.suppressError = true;
						out.setResponse = {
							body: errorPage(ctx.error),
							headers: [
								["content-type", "text/html; charset=utf-8"]
							],
							status: 502,
							statusText: "Bad Gateway"
						};

						this.#onError?.(ctx.error);
					}
				);
			}
		},

		HistoryUrl: class HistoryUrlPlugin extends utils().ManagedPlugin {
			constructor() {
				super("history-url", []);
			}

			install(frame: {
				hooks: {
					init: {
						post: unknown;
					};
				};
			}) {
				this.tap(
					frame.hooks.init.post,
					(context: {
						window: Window;
						isTopLevel: boolean;
						client: { url: URL };
					}) => {
						if (!context.isTopLevel) return;
						const historyConstructor = (
							context.window as unknown as {
								History: { prototype: History };
							}
						).History;
						const history =
							historyConstructor.prototype as unknown as {
								pushState: HistoryMethod;
								replaceState: HistoryMethod;
							};

						for (const method of [
							"pushState",
							"replaceState"
						] as const) {
							const original = history[method];
							history[method] = function (data, unused, url) {
								return original.call(
									this,
									data,
									unused,
									url ?? context.client.url.href
								);
							};
						}
					}
				);
			}
		}
	};

	return localPlugins;
};

type HistoryMethod = (
	this: History,
	data: unknown,
	unused: string,
	url?: string | URL | null
) => void;

class ScramjetSession implements ProxySession {
	url = "";
	#frame: ScramjetFrame;
	#handlers: SessionHandlers;
	#destroyed = false;

	constructor(frame: ScramjetFrame, handlers: SessionHandlers) {
		this.#frame = frame;
		this.#handlers = handlers;
	}

	get element(): HTMLIFrameElement {
		return this.#frame.element;
	}

	go(url: string): void {
		if (this.#destroyed) return;
		this.#handlers.loading?.();
		this.#frame.go(url);
	}

	back(): void {
		if (!this.#destroyed) this.#frame.back();
	}

	forward(): void {
		if (!this.#destroyed) this.#frame.forward();
	}

	reload(): void {
		if (!this.#destroyed) this.#frame.reload();
	}

	destroy(): void {
		this.#destroyed = true;

		const index = controller?.frames.indexOf(this.#frame) ?? -1;
		if (index !== -1) controller!.frames.splice(index, 1);

		this.#frame.element.remove();
	}
}

export const engine: ProxyEngine = {
	id: "scramjet",
	label: "Scramjet",
	supportsTransportSwitch: true,
	requiresIsolation: true,

	async init() {
		ready ??= boot();
		return ready;
	},

	async createSession(element, handlers = {}) {
		await this.init();

		const u = utils();
		const { ErrorPage, HistoryUrl } = plugins();

		const session = new ScramjetSession(
			controller!.createFrame(element, {
				plugins: [
					new u.HttpCachePlugin(),
					new HistoryUrl(),

					new u.UrlWatcherPlugin((url: string) => {
						session.url = url;
						handlers.url?.(url);
						handlers.ready?.();
					}),

					new u.CatchEscapedLinksPlugin((url: URL) => {
						handlers.escape?.(url.href);
						return new URL(
							`data:text/html,${encodeURIComponent(errorPage(new Error("Opened in a new tab.")))}`
						);
					}),

					new ErrorPage(handlers.error)
				]
			}),
			handlers
		);

		return session;
	},

	async setTransport(
		config: Partial<TransportConfig>
	): Promise<TransportConfig> {
		currentTransport = { ...currentTransport, ...config };
		if (ready) {
			await ready;
			await applyTransport();
		}
		return { ...currentTransport };
	},

	getTransport(): TransportConfig {
		return { ...currentTransport };
	},

	listTransports(): TransportChoice[] {
		return [
			{
				id: "libcurl",
				label: "libcurl",
				detail: "A full curl build in WebAssembly. Widest compatibility, heavier to start."
			},
			{
				id: "epoxy",
				label: "epoxy",
				detail: "A Rust TLS stack in WebAssembly. Lighter and faster, slightly pickier."
			}
		];
	}
};

const errorPage = (error: unknown): string => {
	const message = String(
		(error as { message?: string })?.message ?? error ?? "Unknown error"
	).replace(/[<&]/g, c => (c === "<" ? "&lt;" : "&amp;"));

	return `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page unavailable</title>
<style>
  html { color-scheme: light dark; font: 16px/1.5 system-ui, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
  main { width: min(32rem, calc(100% - 3rem)); }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { margin: 0 0 .75rem; color: GrayText; }
  code { font-size: .875rem; }
</style>
<main>
  <h1>This page could not be loaded</h1>
  <p>The proxy reached the network but the request failed.</p>
  <p><code>${message}</code></p>
</main>`;
};

export default engine;
