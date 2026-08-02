let connection = null;
let ready = null;
export const defaultWispUrl = () => {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    return scheme + "//" + location.host + "/wisp/";
};
export const bareUrl = new URL("/bare/", location.href).href;
let currentTransport = {
    kind: "bare",
    wisp: "",
    bare: ""
};
const transportEntry = (kind) => {
    switch (kind) {
        case "bare":
            return {
                module: "/baremod/index.mjs",
                args: [currentTransport.bare || bareUrl]
            };
        default:
            return null;
    }
};
const applyTransport = async () => {
    const entry = transportEntry(currentTransport.kind) ??
        transportEntry("bare");
    if (!entry)
        throw new Error(`No transport available for "${currentTransport.kind}"`);
    await connection.setTransport(entry.module, entry.args);
};
const registerServiceWorker = async () => {
    if (!("serviceWorker" in navigator)) {
        throw new Error("Service workers are unavailable. The page must be served over https:// " +
            "or from a localhost secure context.");
    }
    const registration = await navigator.serviceWorker.register("/uv-sw.js", {
        scope: __uv$config.prefix
    });
    const worker = registration.active ?? registration.installing ?? registration.waiting;
    if (worker && worker.state !== "activated") {
        await new Promise((resolve, reject) => {
            const check = () => {
                if (worker.state === "activated")
                    resolve();
                if (worker.state === "redundant")
                    reject(new Error("Service worker installation failed"));
            };
            worker.addEventListener("statechange", check);
            check();
        });
    }
    return registration;
};
const boot = async () => {
    await registerServiceWorker();
    connection = new BareMux.BareMuxConnection("/baremux/worker.js");
    await applyTransport();
    return connection;
};
const pollIntervalMs = 250;
class UltravioletSession {
    url = "";
    #element;
    #handlers;
    #timer = null;
    #lastEncoded = "";
    #destroyed = false;
    constructor(element, handlers) {
        this.#element = element;
        this.#handlers = handlers;
        this.#element.addEventListener("load", () => {
            this.#poll();
            this.#handlers.ready?.();
        });
        this.#timer = setInterval(() => this.#poll(), pollIntervalMs);
    }
    get element() {
        return this.#element;
    }
    #poll() {
        if (this.#destroyed)
            return;
        let pathname;
        try {
            pathname = this.#element.contentWindow?.location.pathname ?? "";
        }
        catch {
            return;
        }
        if (!pathname.startsWith(__uv$config.prefix))
            return;
        const encoded = pathname.slice(__uv$config.prefix.length);
        if (!encoded || encoded === this.#lastEncoded)
            return;
        this.#lastEncoded = encoded;
        try {
            const decoded = __uv$config.decodeUrl(encoded);
            this.url = decoded;
            this.#handlers.url?.(decoded);
        }
        catch { }
    }
    go(url) {
        if (this.#destroyed)
            return;
        this.#handlers.loading?.();
        this.#element.src = __uv$config.prefix + __uv$config.encodeUrl(url);
    }
    back() {
        if (!this.#destroyed)
            this.#element.contentWindow?.history.back();
    }
    forward() {
        if (!this.#destroyed)
            this.#element.contentWindow?.history.forward();
    }
    reload() {
        if (!this.#destroyed)
            this.#element.contentWindow?.location.reload();
    }
    destroy() {
        this.#destroyed = true;
        if (this.#timer)
            clearInterval(this.#timer);
        this.#element.remove();
    }
}
export const engine = {
    id: "ultraviolet",
    label: "Ultraviolet",
    supportsTransportSwitch: false,
    requiresIsolation: false,
    async init() {
        ready ??= boot();
        return ready;
    },
    async createSession(element, handlers = {}) {
        await this.init();
        return new UltravioletSession(element, handlers);
    },
};
export default engine;
