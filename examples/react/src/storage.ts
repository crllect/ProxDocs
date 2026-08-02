const namespace = "react";
const version = 1;

type Envelope<T> = { __v: number; value: T };

const key = (name: string): string => `${namespace}:${name}`;

export const read = <T>(name: string, fallback: T): T => {
	try {
		const raw = localStorage.getItem(key(name));
		if (raw === null) return fallback;

		const parsed = JSON.parse(raw) as Envelope<T> | T;
		if ((parsed as Envelope<T>)?.__v !== version) {
			return migrate(name, parsed, fallback);
		}
		return (parsed as Envelope<T>).value;
	} catch {
		return fallback;
	}
};

export const write = <T>(name: string, value: T): boolean => {
	try {
		const envelope: Envelope<T> = { __v: version, value };
		localStorage.setItem(key(name), JSON.stringify(envelope));
		return true;
	} catch {
		return false;
	}
};

export const remove = (name: string): void => {
	try {
		localStorage.removeItem(key(name));
	} catch {}
};

export const clearAll = (): void => {
	try {
		const prefix = `${namespace}:`;
		const names: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const name = localStorage.key(i);
			if (name?.startsWith(prefix)) names.push(name);
		}
		for (const name of names) localStorage.removeItem(name);
	} catch {}
};

const migrate = <T>(name: string, parsed: unknown, fallback: T): T => {
	if (parsed && typeof parsed === "object" && !("__v" in parsed)) {
		write(name, parsed as T);
		return parsed as T;
	}
	return fallback;
};
