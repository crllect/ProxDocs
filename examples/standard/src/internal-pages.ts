import { definePage, escapeHtml, listPages } from "./internal.ts";
import { engine } from "./engine.ts";
import * as settings from "./settings.ts";

const transportOptions = [
	{ id: "libcurl", label: "libcurl", detail: "Widest compatibility, heavier to start." },
	{ id: "epoxy", label: "epoxy", detail: "Lighter and faster, slightly pickier." }
] as {
	id: string;
	label: string;
	detail: string;
}[];

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

		case "transport":
			return `<select id="f-${name}" name="${name}">${options(
				transportOptions,
				value,
				t => t.id
			)}</select>`;

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

};
