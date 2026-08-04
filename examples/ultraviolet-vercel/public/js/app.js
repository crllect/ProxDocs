import { engine } from "./engine.js";
import { resolveInput, formatForDisplay } from "./url.js";
import * as settings from "./settings.js";
import * as visitLog from "./history.js";
import * as internal from "./internal.js";
import { registerInternalPages } from "./internal-pages.js";
const $ = (selector) => document.querySelector(selector);
const addressBar = $("#address");
const frames = $("#frames");
const status = $("#status");
let addressBarFocused = false;
addressBar.addEventListener("focus", () => (addressBarFocused = true));
addressBar.addEventListener("blur", () => (addressBarFocused = false));
registerInternalPages();
const frame = document.createElement("iframe");
frame.className = "frame frame--active";
frames.append(frame);
let session = null;
let sessionPending = null;
const state = { url: "", loading: false };
const internalHistory = new internal.InternalHistory();
const visited = [];
let visitedIndex = -1;
const record = (url) => {
    state.url = url;
    if (visited[visitedIndex] === url)
        return;
    const existing = visited.lastIndexOf(url, visitedIndex - 1);
    if (existing >= 0) {
        visitedIndex = existing;
        return;
    }
    visited.splice(visitedIndex + 1);
    visited.push(url);
    visitedIndex = visited.length - 1;
};
const canGoBack = () => visitedIndex > 0;
const canGoForward = () => visitedIndex >= 0 && visitedIndex < visited.length - 1;
const goBack = () => {
    if (!canGoBack())
        return null;
    return visited[--visitedIndex] ?? null;
};
const goForward = () => {
    if (!canGoForward())
        return null;
    return visited[++visitedIndex] ?? null;
};
const ensureSession = async () => {
    if (session)
        return session;
    if (sessionPending)
        return sessionPending;
    sessionPending = engine.createSession(frame, {
        url: url => {
            if (frame.srcdoc)
                return;
            record(url);
            if (settings.get("saveHistory"))
                visitLog.record(url);
            render();
        },
        loading: () => {
            state.loading = true;
            render();
        },
        ready: () => {
            state.loading = false;
            render();
        },
        error: error => {
            state.loading = false;
            setStatus(error?.message ?? String(error));
        },
        escape: url => void navigate(url)
    });
    try {
        session = await sessionPending;
    }
    finally {
        sessionPending = null;
    }
    return session;
};
const currentSession = () => session;
const currentUrl = () => state.url;
const currentTitle = () => state.url;
const isLoading = () => state.loading;
const startUrl = () => {
    const configured = settings.get("homeUrl");
    if (configured)
        return configured;
    return internal.homeUrl;
};
const searchTemplate = () => {
    return settings.get("searchEngine");
};
const navigate = async (input, options = {}) => {
    const { url, kind } = resolveInput(input, searchTemplate());
    switch (kind) {
        case "empty":
            return;
        case "blocked":
            setStatus("That address cannot be opened through the proxy.");
            return;
        case "external":
            location.assign(url);
            return;
        case "internal": {
            const html = internal.render(url);
            if (html === null)
                return;
            if (options.record !== false) {
                internalHistory.push(url);
                record(url);
            }
            else
                state.url = url;
            frame.removeAttribute("src");
            frame.srcdoc = html;
            render();
            return;
        }
        default: {
            setStatus("");
            internalHistory.clear();
            frame.removeAttribute("srcdoc");
            await ensureSession();
            if (options.record === false)
                state.url = url;
            else
                record(url);
            session.go(url);
            render();
        }
    }
};
const refreshInternalPages = (names) => {
    if (internal.isInternal(currentUrl()) &&
        names.includes(internal.pageName(currentUrl()) ?? "")) {
        void navigate(currentUrl(), { record: false });
    }
};
visitLog.onChange(() => refreshInternalPages(["history"]));
addEventListener("message", event => {
    if (event.origin !== location.origin)
        return;
    if (!internal.isInternal(currentUrl()))
        return;
    if (event.source !== frame.contentWindow)
        return;
    const data = event.data;
    if (!data || typeof data !== "object")
        return;
    switch (data.type) {
        case "internal:open":
            if (typeof data.url === "string")
                void navigate(data.url);
            break;
        case "internal:settings": {
            if (!data.patch || typeof data.patch !== "object")
                break;
            const { rejected, persisted } = settings.set(data.patch);
            const saved = persisted
                ? "Saved."
                : "Applied for this session, but browser storage is unavailable.";
            setStatus(rejected.length
                ? `${saved} Invalid values reset: ${rejected.join(", ")}.`
                : saved);
            void navigate(currentUrl());
            break;
        }
        case "internal:action":
            switch (data.action) {
                case "clear-history":
                    setStatus(visitLog.clear()
                        ? "History cleared."
                        : "History cleared for this session, but browser storage is unavailable.");
                    void navigate(currentUrl());
                    break;
                case "reset-settings":
                    const { persisted } = settings.reset();
                    setStatus(persisted
                        ? "Settings reset."
                        : "Reset for this session, but browser storage is unavailable.");
                    void navigate(currentUrl());
                    break;
            }
            break;
        case "internal:popup-blocked":
            setStatus("The browser blocked the popup.");
            break;
    }
});
const render = () => {
    const url = currentUrl();
    if (!addressBarFocused)
        addressBar.value = url ? formatForDisplay(url) : "";
    $("#back").disabled = !canGoBack();
    $("#forward").disabled = !canGoForward();
    $("#reload").disabled =
        !currentSession() && !internal.isInternal(url);
    if (isLoading())
        setStatus("Loading");
    else if (status.textContent === "Loading")
        setStatus("");
};
const setStatus = (message) => {
    status.textContent = message ?? "";
    status.hidden = !message;
};
$("#omnibox").addEventListener("submit", event => {
    event.preventDefault();
    addressBar.blur();
    void navigate(addressBar.value);
});
$("#back").addEventListener("click", () => {
    const url = goBack();
    if (url)
        void navigate(url, { record: false });
});
$("#forward").addEventListener("click", () => {
    const url = goForward();
    if (url)
        void navigate(url, { record: false });
});
$("#reload").addEventListener("click", () => {
    if (internal.isInternal(currentUrl())) {
        void navigate(currentUrl());
        return;
    }
    currentSession()?.reload();
});
const menu = $("#menu");
const menuToggle = $("#menu-toggle");
menuToggle.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    menuToggle.setAttribute("aria-expanded", String(!menu.hidden));
});
for (const button of menu.querySelectorAll("[data-open]")) {
    button.addEventListener("click", () => {
        menu.hidden = true;
        menuToggle.setAttribute("aria-expanded", "false");
        void navigate(button.dataset.open);
    });
}
addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey))
        return;
    switch (event.key) {
        case "l":
            event.preventDefault();
            addressBar.focus();
            addressBar.select();
            break;
    }
});
render();
void navigate(startUrl());
