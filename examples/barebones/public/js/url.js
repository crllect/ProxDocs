const looksLikeUrl = /^(?:(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:.]+\]|[^\s/?#@]+\.[^\s/?#@.]{2,})(?::\d+)?(?:[/?#]\S*)?)$/iu;
const proxyableSchemes = new Set(["http:", "https:"]);
const blockedSchemes = new Set([
    "javascript:",
    "data:",
    "vbscript:",
    "file:",
    "blob:",
    "filesystem:"
]);
export const resolveInput = (input, searchTemplate) => {
    const text = String(input ?? "").trim();
    if (!text)
        return { url: "", kind: "empty" };
    if (looksLikeUrl.test(text)) {
        try {
            const parsed = new URL(`https://${text}`);
            if (!parsed.username && !parsed.password)
                return { url: parsed.href, kind: "url" };
        }
        catch { }
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
        try {
            const parsed = new URL(text);
            if (parsed.username ||
                parsed.password ||
                blockedSchemes.has(parsed.protocol)) {
                return { url: "", kind: "blocked" };
            }
            return proxyableSchemes.has(parsed.protocol)
                ? { url: parsed.href, kind: "url" }
                : { url: parsed.href, kind: "external" };
        }
        catch {
            return { url: "", kind: "blocked" };
        }
    }
    return {
        url: searchTemplate.replace("%s", encodeURIComponent(text)),
        kind: "search"
    };
};
export const formatForDisplay = (url) => {
    try {
        const parsed = new URL(url);
        const host = parsed.host.replace(/^www\./, "");
        const rest = parsed.pathname === "/" ? "" : parsed.pathname;
        return host + rest + parsed.search + parsed.hash;
    }
    catch {
        return url;
    }
};
export const originOf = (url) => {
    try {
        return new URL(url).origin;
    }
    catch {
        return "";
    }
};
