let controller = null;
let ready = null;
export const defaultWispUrl = () => {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    return scheme + "//" + location.host + "/wisp/";
};
export const bareUrl = new URL("/bare/", location.href).href;
const runtimeScripts = [
    "/scram/scramjet.js",
    "/controller/controller.api.js",
    "/utils/scramjet-utils.js"
];
const loadScript = (src) => {
    return new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.async = false;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error("Failed to load " + src));
        document.head.append(el);
    });
};
const loadRuntimeScripts = async () => {
    await Promise.all(runtimeScripts.map(loadScript));
};
const isDevHost = () => location.hostname === "localhost" || location.hostname === "127.0.0.1";
const registerServiceWorker = async () => {
    if (!("serviceWorker" in navigator)) {
        throw new Error("Service workers are unavailable. The page must be served over https:// " +
            "or from a localhost secure context.");
    }
    if (isDevHost()) {
        for (const existing of await navigator.serviceWorker.getRegistrations()) {
            if (!existing.active?.scriptURL.endsWith("/sw.js")) {
                await existing.unregister();
            }
        }
    }
    const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none"
    });
    void registration.update();
    const ready = await navigator.serviceWorker.ready;
    const worker = ready.active ?? navigator.serviceWorker.controller;
    if (!worker)
        throw new Error("Service worker registered but never became active");
    return worker;
};
const transportModules = {
    bare: "/baremod/index.mjs"
};
let currentTransport = {
    kind: "bare",
    wisp: "",
    bare: ""
};
const resolveTransport = (config) => {
    const kind = transportModules[config.kind]
        ? config.kind
        : "bare";
    switch (kind) {
        case "bare":
            return {
                path: transportModules.bare,
                kind,
                endpoint: config.bare || bareUrl
            };
        default:
            return {
                path: transportModules[kind],
                kind,
                endpoint: config.wisp || defaultWispUrl()
            };
    }
};
const buildTransport = async (config) => {
    const { path, kind, endpoint } = resolveTransport(config);
    const module = (await import(/* @vite-ignore */ path));
    switch (kind) {
        case "bare":
            return new module.default(endpoint);
        default:
            return new module.default({ wisp: endpoint });
    }
};
const keepAliveIntervalMs = 15000; // super duper jank hopefully scramjet fixes
const startKeepAlive = () => {
    setInterval(() => {
        navigator.serviceWorker.controller?.postMessage("keepalive");
    }, keepAliveIntervalMs);
};
const boot = async () => {
    const [serviceworker] = await Promise.all([
        registerServiceWorker(),
        loadRuntimeScripts()
    ]);
    const api = window.$scramjetController;
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
    startKeepAlive();
    return controller;
};
const utils = () => {
    return window
        .$scramjetUtils;
};
let localPlugins = null;
const plugins = () => {
    localPlugins ??= {
        ErrorPage: class ErrorPagePlugin extends utils().ManagedPlugin {
            #onError;
            constructor(onError) {
                super("error-page", []);
                this.#onError = onError;
            }
            install(frame) {
                this.tap(frame.hooks.error.request, (context, props) => {
                    const ctx = context;
                    const out = props;
                    if (ctx.error?.name === "AbortError")
                        return;
                    if (!["document", "iframe", "frame"].includes(ctx.rawrequest?.destination ?? ""))
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
                });
            }
        },
        HistoryUrl: class HistoryUrlPlugin extends utils().ManagedPlugin {
            constructor() {
                super("history-url", []);
            }
            install(frame) {
                this.tap(frame.hooks.init.post, (context) => {
                    if (!context.isTopLevel)
                        return;
                    const historyConstructor = context.window.History;
                    const history = historyConstructor.prototype;
                    for (const method of [
                        "pushState",
                        "replaceState"
                    ]) {
                        const original = history[method];
                        history[method] = function (data, unused, url) {
                            return original.call(this, data, unused, url ?? context.client.url.href);
                        };
                    }
                });
            }
        }
    };
    return localPlugins;
};
class ScramjetSession {
    url = "";
    #frame;
    #handlers;
    #destroyed = false;
    #onLoad;
    constructor(frame, handlers) {
        this.#frame = frame;
        this.#handlers = handlers;
        this.#onLoad = () => {
            if (!this.#destroyed)
                this.#handlers.ready?.();
        };
        // ready fires from two places on purpose: the url watcher, which
        // reports as soon as a document exists, and load, which many real
        // sites never reach because one request stays open forever.
        this.#frame.element.addEventListener("load", this.#onLoad);
    }
    get element() {
        return this.#frame.element;
    }
    go(url) {
        if (this.#destroyed)
            return;
        this.#handlers.loading?.();
        this.#frame.go(url);
    }
    back() {
        if (!this.#destroyed)
            this.#frame.back();
    }
    forward() {
        if (!this.#destroyed)
            this.#frame.forward();
    }
    reload() {
        if (!this.#destroyed)
            this.#frame.reload();
    }
    destroy() {
        if (this.#destroyed)
            return;
        this.#destroyed = true;
        this.#frame.element.removeEventListener("load", this.#onLoad);
        const index = controller?.frames.indexOf(this.#frame) ?? -1;
        if (index !== -1)
            controller.frames.splice(index, 1);
        this.#frame.element.remove();
    }
}
export const engine = {
    id: "scramjet",
    label: "Scramjet",
    supportsTransportSwitch: false,
    async init() {
        ready ??= boot();
        return ready;
    },
    async createSession(element, handlers = {}) {
        await this.init();
        const u = utils();
        const { ErrorPage, HistoryUrl } = plugins();
        const session = new ScramjetSession(controller.createFrame(element, {
            plugins: [
                new u.HttpCachePlugin(),
                new HistoryUrl(),
                new u.UrlWatcherPlugin((url) => {
                    session.url = url;
                    handlers.url?.(url);
                    handlers.ready?.();
                }),
                new u.CatchEscapedLinksPlugin((url) => {
                    handlers.escape?.(url.href);
                    return new URL(`data:text/html,${encodeURIComponent(errorPage(new Error("Opened in a new tab.")))}`);
                }),
                new ErrorPage(handlers.error)
            ]
        }), handlers);
        return session;
    },
};
const errorPage = (error) => {
    const message = String(error?.message ?? error ?? "Unknown error").replace(/[<&]/g, c => (c === "<" ? "&lt;" : "&amp;"));
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
