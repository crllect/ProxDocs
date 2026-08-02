import type { ResolvedInput } from "./types.ts";

//#if aboutPages
export const internalScheme = "{{INTERNAL_SCHEME}}:";
//#endif

const looksLikeUrl =
	/^(?:(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:.]+\]|[^\s/?#@]+\.[^\s/?#@.]{2,})(?::\d+)?(?:[/?#]\S*)?)$/iu;

const proxyableSchemes = new Set(["http:", "https:"]);
const blockedSchemes = new Set([
	"javascript:",
	"data:",
	"vbscript:",
	"file:",
	"blob:",
	"filesystem:"
]);

export const resolveInput = (
	input: string,
	searchTemplate: string
): ResolvedInput => {
	const text = String(input ?? "").trim();

	if (!text) return { url: "", kind: "empty" };

	//#if aboutPages
	if (text.slice(0, internalScheme.length).toLowerCase() === internalScheme) {
		return { url: text, kind: "internal" };
	}
	//#endif

	if (looksLikeUrl.test(text)) {
		try {
			const parsed = new URL(`https://${text}`);
			if (!parsed.username && !parsed.password)
				return { url: parsed.href, kind: "url" };
		} catch {}
	}

	if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
		try {
			const parsed = new URL(text);
			if (
				parsed.username ||
				parsed.password ||
				blockedSchemes.has(parsed.protocol)
			) {
				return { url: "", kind: "blocked" };
			}
			return proxyableSchemes.has(parsed.protocol)
				? { url: parsed.href, kind: "url" }
				: { url: parsed.href, kind: "external" };
		} catch {
			return { url: "", kind: "blocked" };
		}
	}

	return {
		url: searchTemplate.replace("%s", encodeURIComponent(text)),
		kind: "search"
	};
};

export const formatForDisplay = (url: string): string => {
	try {
		const parsed = new URL(url);
		//#if aboutPages
		if (parsed.protocol === internalScheme) return parsed.href;
		//#endif
		const host = parsed.host.replace(/^www\./, "");
		const rest = parsed.pathname === "/" ? "" : parsed.pathname;
		return host + rest + parsed.search + parsed.hash;
	} catch {
		return url;
	}
};

export const originOf = (url: string): string => {
	try {
		return new URL(url).origin;
	} catch {
		return "";
	}
};
