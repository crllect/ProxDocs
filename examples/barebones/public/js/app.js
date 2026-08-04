import { engine } from "./engine.js";
import { resolveInput, formatForDisplay } from "./url.js";
const $ = (selector) => document.querySelector(selector);
const addressBar = $("#address");
const frames = $("#frames");
const status = $("#status");
let addressBarFocused = false;
addressBar.addEventListener("focus", () => (addressBarFocused = true));
addressBar.addEventListener("blur", () => (addressBarFocused = false));
const frame = document.createElement("iframe");
frame.className = "frame frame--active";
frames.append(frame);
let session = null;
let sessionPending = null;
const state = { url: "", loading: false };
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
            record(url);
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
    return "";
};
const searchTemplate = () => {
    return "https://search.brave.com/search?q=%s";
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
        default: {
            setStatus("");
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
const render = () => {
    const url = currentUrl();
    if (!addressBarFocused)
        addressBar.value = url ? formatForDisplay(url) : "";
    $("#back").disabled = !canGoBack();
    $("#forward").disabled = !canGoForward();
    $("#reload").disabled = !currentSession();
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
$("#reload").addEventListener("click", () => currentSession()?.reload());
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
