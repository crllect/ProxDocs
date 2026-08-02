import { definePage, escapeHtml, listPages } from "./internal.js";
import { engine } from "./engine.js";
import * as settings from "./settings.js";
import * as visitLog from "./history.js";
const options = (list, selected, valueOf) => list
    .map(item => `<option value="${escapeHtml(valueOf(item))}"${valueOf(item) === selected ? " selected" : ""}>${escapeHtml(item.label)}</option>`)
    .join("");
const row = (name, def, control) => `
  <div class="field">
    <label for="f-${name}">${escapeHtml(def.label)}</label>
    ${control}
    ${def.help ? `<p class="field__help">${escapeHtml(def.help)}</p>` : ""}
  </div>`;
const control = (name, def, value) => {
    switch (name) {
        case "searchEngine":
            return `<select id="f-${name}" name="${name}">${options(settings.searchEngines, value, e => e.template)}</select>`;
        default:
            const type = ["homeUrl", "wispUrl", "cloakFavicon"].includes(name)
                ? "url"
                : "text";
            const custom = ["cloakTitle", "cloakFavicon"].includes(name)
                ? " data-custom-cloak"
                : "";
            return typeof def.default === "boolean"
                ? `<input id="f-${name}" type="checkbox" name="${name}"${value ? " checked" : ""}>`
                : `<input id="f-${name}" type="${type}" name="${name}" value="${escapeHtml(value ?? "")}" autocomplete="off" spellcheck="false"${custom}>`;
    }
};
export const registerInternalPages = () => {
    definePage("home", {
        title: "new tab",
        render: () => `
      <main class="internal">
        <h1>Ultraviolet Vercel</h1>
        <p>type an address above</p>
        <ul>
          ${listPages()
            .filter(page => page.name !== "home")
            .map(page => `<li><a href="#" data-open="${page.url}">${escapeHtml(page.url)}</a></li>`)
            .join("")}
        </ul>
      </main>`
    });
    definePage("about", {
        title: "about",
        render: () => {
            const sj = window.$scramjet;
            const facts = [
                ["engine", "Ultraviolet 3.x"],
                ["version", sj?.versionInfo?.version ?? "3.2.10"],
                [
                    "transport",
                    engine.getTransport?.().kind ?? "bare"
                ],
                ["cross-origin isolated", crossOriginIsolated ? "yes" : "no"],
                [
                    "service worker",
                    navigator.serviceWorker?.controller?.scriptURL ??
                        "not controlling"
                ]
            ];
            return `
      <main class="internal">
        <h1>about</h1>
        <ul>
          ${facts
                .map(([k, v]) => `<li>${escapeHtml(k)}: <span class="dim">${escapeHtml(v)}</span></li>`)
                .join("")}
        </ul>
      </main>`;
        }
    });
    definePage("settings", {
        title: "settings",
        render: () => {
            const current = settings.all();
            const fields = Object.entries(settings.schema);
            const section = (id, label) => {
                const rows = fields
                    .filter(([, def]) => def.section === id)
                    .map(([name, def]) => row(name, def, control(name, def, current[name])))
                    .join("");
                if (!rows)
                    return "";
                const extra = "";
                return `<h2>${escapeHtml(label)}</h2>${rows}${extra}`;
            };
            return `
        <main class="internal">
          <h1>settings</h1>
          <form data-settings-form>
            ${settings.sections.map(s => section(s.id, s.label)).join("")}
            <div class="actions">
              <button type="submit">save</button>
              <button type="button" data-action="reset-settings">reset</button>
            </div>
          </form>
        </main>`;
        }
    });
    definePage("history", {
        title: "history",
        render: () => {
            const groups = visitLog.grouped();
            if (!groups.length) {
                return `<main class="internal"><h1>history</h1><p>empty</p></main>`;
            }
            return `
        <main class="internal">
          <h1>history</h1>
          <div class="actions"><button type="button" data-action="clear-history">clear</button></div>
          ${groups
                .map(group => `
            <h2>${escapeHtml(group.day)}</h2>
            <ul>
              ${group.items
                .map(entry => `<li><a href="#" data-open="${escapeHtml(entry.url)}">${escapeHtml(entry.title || entry.url)}</a> <span class="dim">${escapeHtml(entry.url)}</span></li>`)
                .join("")}
            </ul>`)
                .join("")}
        </main>`;
        }
    });
};
