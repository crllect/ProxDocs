import { shell, escapeHtml } from "./layout.js";
import {
	presets,
	languages,
	packageManagers,
	runtimes,
	servers,
	frontends,
	bundlers,
	styling,
	transports,
	features,
	defaults
} from "../builder/options.js";

const choice = (type, name, id, def, checked) => `
  <label class="choice">
    <input type="${type}" name="${name}" value="${id}" ${checked ? "checked" : ""}>
    <span class="choice__body">
      <span class="choice__label">
        ${escapeHtml(def.label)}
        ${def.deprecated ? '<span class="badge badge--warn">deprecated</span>' : ""}
      </span>
      <span class="choice__tagline">${escapeHtml(def.tagline ?? "")}</span>
      ${def.detail ? `<span class="choice__detail">${escapeHtml(def.detail)}</span>` : ""}
      ${
			def.docs
				? `<a class="choice__docs" href="${def.docs}" target="_blank" rel="noopener">Read the guide →</a>`
				: ""
		}
    </span>
  </label>`;

const radios = (name, table, selected) =>
	Object.entries(table)
		.map(([id, def], i) =>
			choice("radio", name, id, def, selected ? id === selected : i === 0)
		)
		.join("");

const group = (legend, body, attrs = "") => `
  <fieldset ${attrs}>
    <legend>${escapeHtml(legend)}</legend>
    <div class="choices">${body}</div>
  </fieldset>`;

export const buildPage = ({ nav }) => {
	const presetButtons = Object.entries(presets)
		.map(
			([id, preset]) => `
    <button type="button" class="preset" data-preset="${id}">
      <span class="preset__label">${escapeHtml(preset.label)}</span>
      <span class="preset__description">${escapeHtml(preset.description)}</span>
    </button>`
		)
		.join("");

	const main = `
  <main id="content" class="content content--wide">
    <article class="prose">
      <h1>Build your proxy</h1>
      <p>
        Answer the questions and download a project that already works. Every
        choice maps to real files in the output, nothing is scaffolding you
        have to fill in later.
      </p>
      <p class="muted">
        Prefer the terminal? <code>node builder/cli.js --out ./my-proxy --preset standard</code>
      </p>
      <p class="muted">
        Choices that cannot work with what you have already picked are greyed
        out, with the reason on hover.
      </p>

      <h2>Start from a preset</h2>
      <div class="presets">${presetButtons}</div>

      <form id="builder">
        <h2>Or answer them yourself</h2>

        <fieldset>
          <legend>Project name</legend>
          <input type="text" name="name" value="my-proxy" class="text-input" pattern="[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?" maxlength="60">
        </fieldset>

        ${group("Language", radios("language", languages, defaults.language))}
        ${group("Package manager", radios("packageManager", packageManagers, defaults.packageManager))}
        ${group("Runtime", radios("runtime", runtimes, defaults.runtime))}
        ${group("Server framework", radios("server", servers, defaults.server))}
        ${group("Frontend", radios("frontend", frontends, defaults.frontend))}
        ${group("Build step", radios("bundler", bundlers, defaults.bundler))}
        ${group("Styling", radios("styling", styling, defaults.styling))}
        ${group(
			"Transports",
			Object.entries(transports)
				.map(([id, def]) =>
					choice(
						"checkbox",
						"transport",
						id,
						def,
						defaults.transports.includes(id)
					)
				)
				.join("")
		)}

        <fieldset>
          <legend>Features
            <span class="legend-actions">
              <button type="button" id="features-all" class="linkish">Select all</button>
              <button type="button" id="features-none" class="linkish">Clear</button>
            </span>
          </legend>
          <div class="choices">
            ${Object.entries(features)
				.map(([id, def]) =>
					choice(
						"checkbox",
						"features",
						id,
						def,
						defaults.features.includes(id)
					)
				)
				.join("")}
          </div>
        </fieldset>

      </form>

      <div id="notes" class="notes" hidden></div>

      <h2>Result</h2>
      <div class="result">
        <div class="result__actions">
          <button id="download" type="button" class="primary">Download .zip</button>
          <span id="summary" class="muted"></span>
        </div>
        <div class="result__body">
          <ul id="filelist" class="filelist"></ul>
          <div class="filepreview__wrap"><pre id="filepreview" class="filepreview"><code></code></pre></div>
        </div>
      </div>
    </article>
  </main>`;

	return shell({ title: "Build your proxy", slug: "build", nav, main });
};
