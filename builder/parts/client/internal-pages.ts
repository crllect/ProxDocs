import { definePage, escapeHtml, listPages } from "./internal.ts";
import { engine } from "./engine.ts";
//#if settings
import * as settings from "./settings.ts";
//#endif
//#if history
import * as visitLog from "./history.ts";
//#endif
//#if bookmarks
import * as bookmarks from "./bookmarks.ts";
//#endif

//#if settings
//#if transportSwitch
const transportOptions = [
	//#insert TRANSPORT_OPTIONS
] as {
	id: string;
	label: string;
	detail: string;
}[];
//#endif

const options = <T extends { label: string }>(
	list: readonly T[],
	selected: unknown,
	valueOf: (item: T) => string
) =>
	list
		.map(
			item =>
				`<option value="${escapeHtml(valueOf(item))}"${
					valueOf(item) === selected ? " selected" : ""
				}>${escapeHtml(item.label)}</option>`
		)
		.join("");

const row = (
	name: string,
	def: { label: string; help?: string },
	control: string
) => `
  <div class="field">
    <label for="f-${name}">${escapeHtml(def.label)}</label>
    ${control}
    ${def.help ? `<p class="field__help">${escapeHtml(def.help)}</p>` : ""}
  </div>`;

const control = (name: string, def: { default: unknown }, value: unknown) => {
	switch (name) {
		case "searchEngine":
			return `<select id="f-${name}" name="${name}">${options(
				settings.searchEngines,
				value,
				e => e.template
			)}</select>`;

		//#if transportSwitch
		case "transport":
			return `<select id="f-${name}" name="${name}">${options(
				transportOptions,
				value,
				t => t.id
			)}</select>`;
		//#endif

		//#if cloak
		case "cloakPreset":
			return `<select id="f-${name}" name="${name}">${settings.cloakPresets
				.map(
					preset =>
						`<option value="${preset.id}" data-title="${escapeHtml(preset.title)}" data-favicon="${escapeHtml(preset.favicon)}"${preset.id === value ? " selected" : ""}>${escapeHtml(preset.label)}</option>`
				)
				.join("")}</select>`;
		//#endif

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
//#endif

export const registerInternalPages = () => {
	//#if aboutPages
	definePage("home", {
		title: "new tab",
		render: () => `
      <main class="internal">
        <h1>{{PROJECT_TITLE}}</h1>
        <p>type an address above</p>
        <ul>
          ${listPages()
				.filter(page => page.name !== "home")
				.map(
					page =>
						`<li><a href="#" data-open="${page.url}">${escapeHtml(page.url)}</a></li>`
				)
				.join("")}
        </ul>
      </main>`
	});

	definePage("about", {
		title: "about",
		render: () => {
			const sj = (
				window as never as {
					$scramjet?: { versionInfo?: { version?: string } };
				}
			).$scramjet;
			const facts: [string, string][] = [
				["engine", "{{ENGINE_LABEL}}"],
				["version", sj?.versionInfo?.version ?? "{{ENGINE_VERSION}}"],
				[
					"transport",
					engine.getTransport?.().kind ?? "{{DEFAULT_TRANSPORT}}"
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
				.map(
					([k, v]) =>
						`<li>${escapeHtml(k)}: <span class="dim">${escapeHtml(v)}</span></li>`
				)
				.join("")}
        </ul>
      </main>`;
		}
	});
	//#endif

	//#if settings
	definePage("settings", {
		title: "settings",
		render: () => {
			const current = settings.all() as Record<string, unknown>;
			const fields = Object.entries(settings.schema) as [string, never][];

			const section = (id: string, label: string) => {
				const rows = fields
					.filter(
						([, def]) => (def as { section: string }).section === id
					)
					.map(([name, def]) =>
						row(name, def, control(name, def, current[name]))
					)
					.join("");

				if (!rows) return "";

				//#if cloak
				const preset = settings.cloakPresets.find(
					item => item.id === settings.get("cloakPreset")
				);
				const cloakTitle =
					preset && preset.id !== "custom"
						? preset.title
						: settings.get("cloakTitle");
				const cloakFavicon =
					preset && preset.id !== "custom"
						? preset.favicon
						: settings.get("cloakFavicon");
				const extra =
					id === "cloaking"
						? `<div class="actions">
                 <button type="button" data-action="cloak-aboutblank" data-cloak-title="${escapeHtml(cloakTitle)}" data-cloak-favicon="${escapeHtml(cloakFavicon)}">open in about:blank</button>
                 <button type="button" data-action="cloak-blob" data-cloak-title="${escapeHtml(cloakTitle)}" data-cloak-favicon="${escapeHtml(cloakFavicon)}">open as blob</button>
               </div>`
						: "";
				//#else
				const extra = "";
				//#endif

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
	//#endif

	//#if history
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
				.map(
					group => `
            <h2>${escapeHtml(group.day)}</h2>
            <ul>
              ${group.items
					.map(
						entry =>
							`<li><a href="#" data-open="${escapeHtml(entry.url)}">${escapeHtml(
								entry.title || entry.url
							)}</a> <span class="dim">${escapeHtml(entry.url)}</span></li>`
					)
					.join("")}
            </ul>`
				)
				.join("")}
        </main>`;
		}
	});
	//#endif

	//#if bookmarks
	definePage("bookmarks", {
		title: "bookmarks",
		render: () => {
			const items = bookmarks.all();

			if (!items.length) {
				return `<main class="internal"><h1>bookmarks</h1><p>use the bookmark button to add one</p></main>`;
			}

			return `
        <main class="internal">
          <h1>bookmarks</h1>
          <ul>
            ${items
				.map(
					item =>
						`<li><a href="#" data-open="${escapeHtml(item.url)}">${escapeHtml(
							item.title
						)}</a> <span class="dim">${escapeHtml(item.url)}</span></li>`
				)
				.join("")}
          </ul>
        </main>`;
		}
	});
	//#endif
};
