import * as storage from "./storage.js";
const storeKey = "history";
const maxEntries = 1000;
const dedupeWindowMs = 30_000;
let entries = null;
const listeners = new Set();
const isValid = (entry) => {
    const v = entry;
    return (Boolean(v) &&
        typeof v.url === "string" &&
        /^https?:/i.test(v.url) &&
        typeof v.title === "string" &&
        typeof v.at === "number" &&
        Number.isFinite(v.at));
};
const load = () => {
    if (entries)
        return entries;
    const raw = storage.read(storeKey, []);
    entries = Array.isArray(raw) ? raw.filter(isValid) : [];
    return entries;
};
const persist = () => {
    const persisted = storage.write(storeKey, entries);
    for (const fn of listeners)
        fn(entries);
    return persisted;
};
export const record = (url, title = "") => {
    if (!url || !/^https?:/i.test(url))
        return;
    const list = load();
    const now = Date.now();
    const last = list[0];
    if (last && last.url === url && now - last.at < dedupeWindowMs) {
        last.at = now;
        if (title)
            last.title = title;
        persist();
        return;
    }
    list.unshift({ url, title, at: now });
    if (list.length > maxEntries)
        list.length = maxEntries;
    persist();
};
export const all = () => [...load()];
export const search = (query) => {
    const needle = String(query ?? "")
        .trim()
        .toLowerCase();
    if (!needle)
        return all();
    return load().filter(entry => entry.url.toLowerCase().includes(needle) ||
        (entry.title ?? "").toLowerCase().includes(needle));
};
export const grouped = () => {
    const groups = new Map();
    for (const entry of load()) {
        const day = new Date(entry.at).toDateString();
        if (!groups.has(day))
            groups.set(day, []);
        groups.get(day).push(entry);
    }
    return [...groups.entries()].map(([day, items]) => ({ day, items }));
};
export const removeEntry = (url, at) => {
    const list = load();
    entries = list.filter(entry => !(entry.url === url && entry.at === at));
    persist();
};
export const clear = () => {
    entries = [];
    return persist();
};
export const onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};
