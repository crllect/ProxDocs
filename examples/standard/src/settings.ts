import * as storage from "./storage.ts";

type Validator<T> = (value: unknown, fallback: T) => T;

type AnyField = {
	section: string;
	label: string;
	default: unknown;
	validate: (value: unknown, fallback: unknown) => unknown;
	help?: string;
};

const text =
	(max = 200): Validator<string> =>
	(value, fallback) => {
		const s = typeof value === "string" ? value.trim() : "";
		return s.length <= max ? s : fallback;
	};

const bool: Validator<boolean> = (value, fallback) =>
	typeof value === "boolean" ? value : fallback;

const oneOf =
	<T extends string>(allowed: readonly T[]): Validator<T> =>
	(value, fallback) =>
		allowed.includes(value as T) ? (value as T) : fallback;

const httpUrl: Validator<string> = (value, fallback) => {
	const s = typeof value === "string" ? value.trim() : "";
	if (!s) return "";
	try {
		const url = new URL(s);
		return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
	} catch {
		return fallback;
	}
};

const searchTemplate: Validator<string> = (value, fallback) => {
	const s = typeof value === "string" ? value.trim() : "";
	if (!s.includes("%s")) return fallback;
	try {
		const probe = new URL(s.replaceAll("%s", "test"));
		return ["http:", "https:"].includes(probe.protocol) ? s : fallback;
	} catch {
		return fallback;
	}
};

const transportIds = [
	"libcurl",
	"epoxy"
] as const;

const wispUrl: Validator<string> = (value, fallback) => {
	const s = typeof value === "string" ? value.trim() : "";
	if (!s) return "";
	try {
		const url = new URL(s);
		if (!["ws:", "wss:"].includes(url.protocol)) return fallback;
		if (url.username || url.password || url.hash) return fallback;
		if (location.protocol === "https:" && url.protocol !== "wss:")
			return fallback;
		if (!url.pathname.endsWith("/")) url.pathname += "/";
		return url.href;
	} catch {
		return fallback;
	}
};

export const searchEngines = [
	{
		id: "duckduckgo",
		label: "DuckDuckGo",
		template: "https://duckduckgo.com/?q=%s"
	},
	{
		id: "brave",
		label: "Brave",
		template: "https://search.brave.com/search?q=%s"
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

export type Settings = {
	searchEngine: string;
	homeUrl: string;
	transport: string;
	wispUrl: string;
};

export const sections = [
	{ id: "browsing", label: "Browsing" },
	{ id: "network", label: "Network" },
];

export const schema = {
	searchEngine: {
		section: "browsing",
		label: "Search engine",
		default: "https://duckduckgo.com/?q=%s",
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
	transport: {
		section: "network",
		label: "Transport",
		default: "libcurl",
		validate: oneOf(transportIds),
		help: "How requests leave your browser."
	},
	wispUrl: {
		section: "network",
		label: "Wisp server",
		default: "",
		validate: wispUrl,
		help: "Blank uses this site's own server."
	},
};

export const defaults = Object.fromEntries(
	Object.entries(schema).map(([key, def]) => [key, def.default])
) as unknown as Settings;

const storeKey = "settings";

let current: Settings | null = null;
const listeners = new Set<(settings: Settings, rejected: string[]) => void>();

const validate = (raw: Partial<Record<keyof Settings, unknown>>) => {
	const out: Record<string, unknown> = {};
	const rejected: string[] = [];

	for (const [name, entry] of Object.entries(schema)) {
		const def = entry as AnyField;
		const incoming = raw?.[name as keyof Settings];
		if (incoming === undefined) {
			out[name] = def.default;
			continue;
		}

		const invalid = Symbol(name);
		const value = def.validate(incoming, invalid);
		if (value === invalid) {
			rejected.push(name);
			out[name] = def.default;
		} else {
			out[name] = value;
		}
	}

	return { settings: out as Settings, rejected };
};

export const load = (): Settings => {
	if (current) return current;
	current = validate(storage.read(storeKey, {})).settings;
	return current;
};

export const get = <K extends keyof Settings>(name: K): Settings[K] =>
	load()[name];

export const all = (): Settings => ({ ...load() });

export const set = (patch: Partial<Settings>) => {
	const { settings, rejected } = validate({ ...load(), ...patch });
	current = settings;
	const persisted = storage.write(storeKey, settings);
	for (const fn of listeners) fn(settings, rejected);
	return { settings, rejected, persisted };
};

export const reset = () => {
	current = { ...defaults };
	const persisted = storage.write(storeKey, current);
	for (const fn of listeners) fn(current, []);
	return { settings: current, persisted };
};

export const onChange = (
	fn: (settings: Settings, rejected: string[]) => void
) => {
	listeners.add(fn);
	return () => listeners.delete(fn);
};
