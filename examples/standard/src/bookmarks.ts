import * as storage from "./storage.ts";
import { originOf } from "./url.ts";

export type Bookmark = {
	url: string;
	title: string;
	at: number;
};

const storeKey = "bookmarks";
const maxItems = 500;

let items: Bookmark[] | null = null;
const listeners = new Set<(items: Bookmark[]) => void>();

const load = (): Bookmark[] => {
	if (items) return items;
	const raw = storage.read<unknown>(storeKey, []);
	items = Array.isArray(raw)
		? raw.filter(
				(b): b is Bookmark =>
					Boolean(b) && typeof (b as Bookmark).url === "string"
			)
		: [];
	return items;
};

const persist = (): void => {
	storage.write(storeKey, items);
	for (const fn of listeners) fn(items!);
};

export const all = (): Bookmark[] => {
	return [...load()];
};

export const has = (url: string): boolean => {
	return load().some(b => b.url === url);
};

export const add = (url: string, title = ""): boolean => {
	if (!url || !/^https?:/i.test(url)) return false;
	const list = load();
	if (has(url)) return false;
	if (list.length >= maxItems) return false;

	list.push({
		url,
		title: title || originOf(url).replace(/^https?:\/\//, "") || url,
		at: Date.now()
	});
	persist();
	return true;
};

export const remove = (url: string): void => {
	const list = load();
	const before = list.length;
	items = list.filter(b => b.url !== url);
	if (items.length !== before) persist();
};

export const toggle = (url: string, title?: string): boolean => {
	if (has(url)) {
		remove(url);
		return false;
	}
	return add(url, title);
};

export const move = (url: string, toIndex: number): void => {
	const list = load();
	const from = list.findIndex(b => b.url === url);
	if (from === -1) return;
	const [item] = list.splice(from, 1);
	list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, item);
	persist();
};

export const onChange = (fn: (items: Bookmark[]) => void): (() => void) => {
	listeners.add(fn);
	return () => listeners.delete(fn);
};
