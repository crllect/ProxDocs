import * as storage from "./storage.js";
const text = (max = 200) => (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    return s.length <= max ? s : fallback;
};
const bool = (value, fallback) => typeof value === "boolean" ? value : fallback;
const oneOf = (allowed) => (value, fallback) => allowed.includes(value) ? value : fallback;
const httpUrl = (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s)
        return "";
    try {
        const url = new URL(s);
        return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
    }
    catch {
        return fallback;
    }
};
const searchTemplate = (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s.includes("%s"))
        return fallback;
    try {
        const probe = new URL(s.replaceAll("%s", "test"));
        return ["http:", "https:"].includes(probe.protocol) ? s : fallback;
    }
    catch {
        return fallback;
    }
};
export const searchEngines = [
    {
        id: "brave",
        label: "Brave",
        template: "https://search.brave.com/search?q=%s"
    },
    {
        id: "duckduckgo",
        label: "DuckDuckGo",
        template: "https://duckduckgo.com/?q=%s"
    },
    {
        id: "startpage",
        label: "Startpage",
        template: "https://www.startpage.com/sp/search?query=%s"
    },
    { id: "bing", label: "Bing", template: "https://www.bing.com/search?q=%s" },
    {
        id: "google",
        label: "Google",
        template: "https://www.google.com/search?q=%s"
    }
];
export const sections = [
    { id: "browsing", label: "Browsing" },
];
export const schema = {
    searchEngine: {
        section: "browsing",
        label: "Search engine",
        default: "https://search.brave.com/search?q=%s",
        validate: searchTemplate,
        help: "Used when what you typed is not a URL. Must contain %s."
    },
    homeUrl: {
        section: "browsing",
        label: "Home page",
        default: "",
        validate: httpUrl,
        help: "Opened for new tabs."
    },
    saveHistory: {
        section: "browsing",
        label: "Save history",
        default: true,
        validate: bool
    }
};
export const defaults = Object.fromEntries(Object.entries(schema).map(([key, def]) => [key, def.default]));
const storeKey = "settings";
let current = null;
const listeners = new Set();
const validate = (raw) => {
    const out = {};
    const rejected = [];
    for (const [name, entry] of Object.entries(schema)) {
        const def = entry;
        const incoming = raw?.[name];
        if (incoming === undefined) {
            out[name] = def.default;
            continue;
        }
        const invalid = Symbol(name);
        const value = def.validate(incoming, invalid);
        if (value === invalid) {
            rejected.push(name);
            out[name] = def.default;
        }
        else {
            out[name] = value;
        }
    }
    return { settings: out, rejected };
};
export const load = () => {
    if (current)
        return current;
    current = validate(storage.read(storeKey, {})).settings;
    return current;
};
export const get = (name) => load()[name];
export const all = () => ({ ...load() });
export const set = (patch) => {
    const { settings, rejected } = validate({ ...load(), ...patch });
    current = settings;
    const persisted = storage.write(storeKey, settings);
    for (const fn of listeners)
        fn(settings, rejected);
    return { settings, rejected, persisted };
};
export const reset = () => {
    current = { ...defaults };
    const persisted = storage.write(storeKey, current);
    for (const fn of listeners)
        fn(current, []);
    return { settings: current, persisted };
};
export const onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};
