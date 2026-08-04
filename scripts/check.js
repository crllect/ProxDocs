#!/usr/bin/env node

import { readFile, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import ts from "typescript";

import { nav } from "../site/nav.js";
import { markdownToHtml } from "../site/markdown.js";
import { shell, canonicalFor, siteUrl } from "../site/layout.js";
import { highlight } from "../site/public/highlight.js";
import { compose } from "../builder/node.js";
import { toJavaScript } from "../builder/transpile.js";
import { versions, verifiedOn } from "../builder/versions.js";
import {
	presets,
	features,
	wirings,
	languages,
	servers,
	styling,
	packageManagers,
	exampleNames,
	resolve as resolveOptions
} from "../builder/options.js";

const run = promisify(execFile);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "docs");

let failures = 0;
const fail = message => {
	console.error(`  FAIL  ${message}`);
	failures++;
};
const ok = message => console.log(`  ok    ${message}`);
const posix = value => value.split(path.sep).join("/");

console.log("\nDocumentation files");

const pages = nav.flatMap(section => section.items.filter(item => item.file));
const known = new Set(pages.map(p => p.slug));

for (const page of pages) {
	try {
		await access(path.join(docsDir, page.file));
	} catch {
		fail(`${page.file} is in the nav but does not exist`);
	}
}
if (!failures) ok(`${pages.length} pages present`);

console.log("\nPage metadata");

const seenDescriptions = new Map();
for (const page of pages) {
	const text = page.description;
	if (!text) {
		fail(`${page.slug} has no description in site/nav.js`);
		continue;
	}
	if (text.length < 70 || text.length > 165) {
		fail(
			`${page.slug} description is ${text.length} chars, want 70 to 165`
		);
	}
	const duplicate = seenDescriptions.get(text);
	if (duplicate)
		fail(`${page.slug} repeats the description from ${duplicate}`);
	else seenDescriptions.set(text, page.slug);

	const canonical = canonicalFor(page.slug);
	const expected =
		page.slug === "index" ? `${siteUrl}/` : `${siteUrl}/${page.slug}`;
	if (canonical !== expected) {
		fail(`${page.slug} canonical resolved to ${canonical}`);
	}
}
if (!failures) ok(`${pages.length} descriptions and canonical URLs are unique`);

console.log("\nInternal links");

const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
let linkCount = 0;
let brokenLinks = 0;

for (const page of pages) {
	let source;
	try {
		source = await readFile(path.join(docsDir, page.file), "utf8");
	} catch {
		continue;
	}
	if (
		/(?:example\.(?:com|org|net)|evil\.com|yourproxy\.com|site\.com|test@example\.com)/i.test(
			source
		)
	) {
		fail(`${page.file} contains a generic placeholder domain`);
	}
	if (/<https?:\/\/localhost(?::\d+)?(?:\/[^>]*)?>/i.test(source)) {
		fail(`${page.file} contains a hardcoded localhost link`);
	}

	for (const [, href] of source.matchAll(linkPattern)) {
		if (/^(https?:|mailto:|#)/i.test(href)) continue;
		if (href.startsWith("/")) {
			const slug = href.replace(/^\/|\/$/g, "");
			if (slug && slug !== "build" && !known.has(slug)) {
				fail(`${page.file} → ${href} (no such route)`);
				brokenLinks++;
			}
			continue;
		}

		linkCount++;
		const [target] = href.split("#");
		if (!target) continue;

		const resolved = path.resolve(
			path.dirname(path.join(docsDir, page.file)),
			target
		);
		try {
			await access(resolved);
		} catch {
			fail(`${page.file} → ${href}`);
			brokenLinks++;
		}
	}
}

if (!brokenLinks) ok(`${linkCount} relative links resolve`);

console.log("\nVersion pins");

const pinnedPackages = {
	"@mercuryworkshop/scramjet": versions.scramjet,
	"@mercuryworkshop/scramjet-controller": versions.scramjetController,
	"@mercuryworkshop/scramjet-utils": versions.scramjetUtils,
	"@mercuryworkshop/proxy-bootstrap": versions.proxyBootstrap,
	"@mercuryworkshop/libcurl-transport": versions.libcurlTransport,
	"@mercuryworkshop/epoxy-transport": versions.epoxyTransport,
	"@mercuryworkshop/proxy-transports": versions.proxyTransports,
	"@mercuryworkshop/bare-mux": versions.bareMux,
	"@mercuryworkshop/wisp-js": versions.wispJs,
	"@titaniumnetwork-dev/ultraviolet": versions.ultraviolet
};

let pinCount = 0;
let stalePins = 0;

const bareVersion = value => value.replace(/^[\^~]/, "");

for (const page of pages) {
	let source;
	try {
		source = await readFile(path.join(docsDir, page.file), "utf8");
	} catch {
		continue;
	}

	for (const [name, expected] of Object.entries(pinnedPackages)) {
		const escaped = name.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&");
		const pattern = new RegExp(`${escaped}@([\\w.^~-]+)`, "g");

		for (const [, found] of source.matchAll(pattern)) {
			pinCount++;
			if (bareVersion(found) === bareVersion(expected)) continue;
			fail(
				`${page.file} pins ${name}@${found}, but builder/versions.js says ${expected}`
			);
			stalePins++;
		}
	}

	if (page.slug === "reference/versions" && !source.includes(verifiedOn)) {
		fail(
			`${page.file} does not carry the verifiedOn date from builder/versions.js (${verifiedOn})`
		);
		stalePins++;
	}
}

if (!stalePins) {
	ok(`${pinCount} version pins match builder/versions.js`);
}

console.log("\nMarkdown rendering");

const oneLine = markdownToHtml(
	"```js\nconst value = 1;\n```",
	"guides/test.md"
).html;
if (!oneLine.includes("const") || !oneLine.includes("value")) {
	fail("one-line code block lost its text");
}

const headless = markdownToHtml(
	"| | |\n| --- | --- |\n|a|b|",
	"guides/test.md"
).html;
if (headless.includes("<thead>")) fail("blank table heading was rendered");

const relativeLink = markdownToHtml(
	"[Settings](settings.md)",
	"guides/test.md"
).html;
if (!relativeLink.includes('href="/guides/settings"')) {
	fail("relative Markdown route was not resolved from its source page");
}

const markup = markdownToHtml(
	'```html\n<script type="module"></script>\n```',
	"guides/test.md"
).html;
if (markup.includes("&amp;quot;"))
	fail("HTML highlighting double-escaped quotes");
if (!headless.includes('class="table--headless"'))
	fail("headless table class is missing");
const previewHighlight = highlight('const value = "<safe>";', "ts");
if (
	!previewHighlight.includes('class="tok-keyword"') ||
	previewHighlight.includes("<safe>")
) {
	fail("builder preview highlighting is missing or unsafe");
}
const searchableShell = shell({
	title: "Search check",
	slug: "",
	nav: [],
	main: ""
});
if (
	!searchableShell.includes('id="docs-search"') ||
	!searchableShell.includes('id="docs-search-results"')
) {
	fail("documentation search controls are missing");
}
if (!failures) ok("code blocks, headless tables, and relative routes render");

console.log("\nProject names");

const nameCases = [
	[".proxy", "proxy"],
	["_proxy", "proxy"],
	["..", "my-proxy"],
	["node_modules", "node_modules-project"],
	["favicon.ico", "favicon.ico-project"]
];
for (const [input, expected] of nameCases) {
	const actual = resolveOptions({ name: input }).options.name;
	if (actual !== expected)
		fail(`${input} became ${actual}, expected ${expected}`);
}
if (!failures) ok(`${nameCases.length} invalid npm names are normalized`);

console.log("\nOption values");

const hostile = resolveOptions({
	server: "__proto__",
	packageManager: "constructor",
	wiring: "toString",
	features: ["__proto__"]
}).options;
if (hostile.server !== "express") fail("inherited server option was accepted");
if (hostile.packageManager !== "npm")
	fail("inherited package-manager option was accepted");
if (hostile.wiring !== "manual") fail("inherited wiring option was accepted");
if (hostile.features.length) fail("inherited feature option was accepted");

const serverlessSwitch = resolveOptions({
	host: "vercel",
	server: "fastify",
	features: ["transportSwitch"]
}).options;
if (serverlessSwitch.features.includes("transportSwitch")) {
	fail("Vercel build retained transport switching");
}
if (serverlessSwitch.server !== "express") {
	fail("Vercel build retained a server without an exported handler");
}
const popupSettings = resolveOptions({ features: ["settings"] }).options;
if (popupSettings.features.includes("aboutPages")) {
	fail("settings forced custom protocols instead of using a popup");
}
if (!failures) ok("inherited properties and serverless features are rejected");

console.log("\nGenerator output");
const generatorFailureStart = failures;

const combinations = [
	...Object.entries(presets).map(([name, preset]) => ({
		label: `preset:${name}`,
		options: preset.options
	})),

	...Object.keys(features).flatMap(feature =>
		Object.keys(wirings).flatMap(wiring =>
			Object.keys(languages).map(language => ({
				label: `${language}-${wiring}-${feature}`,
				options: {
					language,
					wiring,
					engine: "scramjet",
					features: [feature]
				}
			}))
		)
	),

	...Object.entries(servers).flatMap(([server, def]) =>
		def.runtimes.map(runtime => ({
			label: `${server}-${runtime}`,
			options: { server, runtime, features: ["browserControls", "tabs"] }
		}))
	),

	...Object.keys(packageManagers).map(packageManager => ({
		label: `pm-${packageManager}`,
		options: { packageManager, features: ["browserControls"] }
	})),

	...Object.keys(styling).map(stylingChoice => ({
		label: `styling-${stylingChoice}`,
		options: {
			styling: stylingChoice,
			features: ["settings", "aboutPages"]
		}
	})),

	{
		label: "nobundler-js",
		options: {
			language: "js",
			bundler: "none",
			features: Object.keys(features)
		}
	},

	{
		label: "uv-wisp",
		options: {
			engine: "ultraviolet",
			transport: "libcurl",
			features: ["browserControls", "tabs", "settings", "transportSwitch"]
		}
	},
	{
		label: "scramjet-epoxy",
		options: {
			engine: "scramjet",
			wiring: "manual",
			transport: "epoxy",
			features: ["browserControls"]
		}
	},
	{
		label: "uv-epoxy",
		options: {
			engine: "ultraviolet",
			transport: "epoxy",
			features: ["browserControls"]
		}
	},
	{
		label: "uv-bare-vercel",
		options: {
			engine: "ultraviolet",
			transport: "bare",
			host: "vercel",
			features: ["browserControls", "settings", "history"]
		}
	},
	{
		label: "uv-all",
		options: {
			engine: "ultraviolet",
			transport: "libcurl",
			features: Object.keys(features)
		}
	}
];

const tmp = await mkdtemp(path.join(os.tmpdir(), "pt-check-"));
let checked = 0;
const clientTypeChecks = [];

for (const combo of combinations) {
	let files;
	try {
		({ files } = await compose({ name: "checkapp", ...combo.options }));
	} catch (error) {
		fail(`${combo.label}: compose threw - ${error.message}`);
		continue;
	}

	const dir = path.join(tmp, combo.label.replace(/[^a-z0-9]+/gi, "-"));
	const jsFiles = [];
	const tsFiles = [];
	const clientTsFiles = [];

	for (const [relative, contents] of Object.entries(files)) {
		const target = path.join(dir, relative);
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, contents);
		if (relative.endsWith(".js")) jsFiles.push(target);
		if (relative.endsWith(".ts") && !relative.endsWith(".d.ts"))
			tsFiles.push([relative, contents]);
		if (
			/^(src|public\/js)\/.+\.ts$/.test(relative) &&
			!relative.endsWith(".d.ts")
		) {
			clientTsFiles.push(target);
		}
	}

	let packageData;
	try {
		packageData = JSON.parse(files["package.json"]);
	} catch (error) {
		fail(
			`${combo.label}: package.json is not valid JSON - ${error.message}`
		);
	}

	if (combo.label.endsWith("-epoxy")) {
		if (!packageData?.dependencies?.["@mercuryworkshop/epoxy-transport"]) {
			fail(`${combo.label}: epoxy dependency is missing`);
		}
		const engine = Object.entries(files).find(([name]) =>
			/(?:src|public\/js)\/engine\.(?:js|ts)$/.test(name)
		)?.[1];
		if (!engine?.includes('/epoxy/index.mjs"')) {
			fail(`${combo.label}: engine does not load epoxy`);
		}
		if (
			!files[
				`server.${combo.options.language === "js" ? "js" : "ts"}`
			]?.includes("/epoxy/")
		) {
			fail(`${combo.label}: server does not expose epoxy`);
		}
	}

	if (combo.label === "uv-bare-vercel") {
		const config = JSON.parse(files["vercel.json"]);
		const includeFiles = config.builds?.[0]?.config?.includeFiles ?? [];
		if (!includeFiles.includes("dist/**")) {
			fail("uv-bare-vercel: Vercel function omits built client assets");
		}
		if (
			!config.builds?.some(build => build.use === "@vercel/static-build")
		) {
			fail("uv-bare-vercel: Vercel does not build the Vite client");
		}
		if (config.routes?.[0]?.handle !== "filesystem") {
			fail("uv-bare-vercel: Vercel does not serve the built client");
		}
		const server = files["server.ts"];
		if (!server.includes("export default handleRequest")) {
			fail("uv-bare-vercel: server does not export a Vercel handler");
		}
		if (!server.includes("if (!process.env.VERCEL)")) {
			fail("uv-bare-vercel: server cannot run locally");
		}
		const engine = files["src/engine.ts"];
		if (
			engine.indexOf("registration.active") >
			engine.indexOf("registration.installing")
		) {
			fail("uv-bare-vercel: active service worker is not preferred");
		}
	}

	if (combo.label === "preset:react") {
		if (
			!files["src/ProxyShell.tsx"] ||
			!files["src/main.tsx"] ||
			!files["vite.config.ts"]?.includes("react()")
		) {
			fail("preset:react: React shell or Vite plugin is missing");
		}
		if (
			!packageData?.dependencies?.react ||
			!packageData?.dependencies?.["react-dom"] ||
			!packageData?.devDependencies?.["@vitejs/plugin-react"]
		) {
			fail("preset:react: React dependencies are missing");
		}
		if (
			!files["src/styles.css"]?.includes("#root") ||
			!files["src/styles.css"]?.includes(".app-root")
		) {
			fail(
				"preset:react: framework shell does not preserve frame height"
			);
		}
	}

	if (combo.label === "preset:astroPreact") {
		if (
			!files["astro.config.mjs"] ||
			!files["src/pages/index.astro"] ||
			!files["src/ProxyShell.tsx"]
		) {
			fail("preset:astroPreact: Astro or Preact files are missing");
		}
		if (
			packageData?.scripts?.build !== "astro build" ||
			packageData?.scripts?.typecheck !== "astro check" ||
			!packageData?.dependencies?.preact ||
			!packageData?.devDependencies?.astro ||
			!packageData?.devDependencies?.["@astrojs/preact"]
		) {
			fail(
				"preset:astroPreact: Astro scripts or dependencies are missing"
			);
		}
		if (!files["src/styles.css"]?.includes("astro-island")) {
			fail(
				"preset:astroPreact: island wrapper does not preserve frame height"
			);
		}
	}

	if (combo.label === "preset:everything") {
		if (
			!files["README.md"]?.includes("bun install") ||
			files["README.md"]?.includes("npm install")
		) {
			fail(
				"preset:everything: README does not use the selected package manager"
			);
		}
	}

	for (const file of jsFiles) {
		try {
			await run(process.execPath, ["--check", file]);
		} catch (error) {
			fail(
				`${combo.label}: ${path.relative(dir, file)} - ${String(error.stderr).split("\n")[0]}`
			);
		}
	}

	for (const [relative, contents] of tsFiles) {
		try {
			await toJavaScript(contents, relative);
		} catch (error) {
			fail(
				`${combo.label}: ${relative} - ${error.message.split("\n")[0]}`
			);
		}
	}

	if (clientTsFiles.length)
		clientTypeChecks.push({
			label: combo.label,
			dir,
			files: clientTsFiles
		});

	for (const [relative, contents] of Object.entries(files)) {
		if (/#(if|else|endif|insert)\b/.test(contents)) {
			fail(
				`${combo.label}: ${relative} still contains template directives`
			);
		}
		if (/\{\{[A-Z_]+\}\}/.test(contents)) {
			const [match] = contents.match(/\{\{[A-Z_]+\}\}/);
			fail(
				`${combo.label}: ${relative} has an unsubstituted variable ${match}`
			);
		}
		if (/\s+,|,\s+,/.test(contents)) {
			fail(
				`${combo.label}: ${relative} contains malformed comma spacing`
			);
		}
		if (relative.endsWith(".html") && contents.includes("<!--")) {
			fail(`${combo.label}: ${relative} contains an HTML comment`);
		}
		if (/\.(?:js|ts)$/.test(relative) && /^\s*\/\/(?!#)/m.test(contents)) {
			fail(`${combo.label}: ${relative} contains a prose comment`);
		}
	}

	checked++;
}

const cliBuild = path.join(tmp, "cli-package-manager");
try {
	await run(process.execPath, [
		path.join(root, "builder/cli.js"),
		"--out",
		cliBuild,
		"--package-manager",
		"bun"
	]);
	const cliReadme = await readFile(path.join(cliBuild, "README.md"), "utf8");
	if (
		!cliReadme.includes("bun install") ||
		cliReadme.includes("npm install")
	) {
		fail(
			"CLI package-manager flag is not reflected in the generated README"
		);
	}
} catch (error) {
	fail(`CLI package-manager check failed: ${error.message}`);
}

const program = ts.createProgram(
	clientTypeChecks.flatMap(check => check.files),
	{
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		allowImportingTsExtensions: true,
		noEmit: true,
		strict: true,
		skipLibCheck: true,
		lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"]
	}
);

for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
	const message = ts.flattenDiagnosticMessageText(
		diagnostic.messageText,
		" "
	);
	const missing = /Cannot find module '([^']+)'/.exec(message)?.[1];
	if (
		diagnostic.code === 2307 &&
		missing &&
		/\.(?:css|scss)(?:\?.*)?$/.test(missing)
	)
		continue;

	const owner = diagnostic.file
		? clientTypeChecks.find(check =>
				diagnostic.file.fileName.startsWith(posix(check.dir) + "/")
			)
		: undefined;
	const where = diagnostic.file
		? path.relative(owner?.dir ?? tmp, diagnostic.file.fileName) +
			(diagnostic.start === undefined
				? ""
				: `:${diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1}`)
		: (owner?.label ?? "generator");
	fail(`${owner?.label ?? "generator"}: ${where} - ${message}`);
}

await rm(tmp, { recursive: true, force: true, maxRetries: 3 });

if (checked === combinations.length && failures === generatorFailureStart)
	ok(`${checked} combinations generate, parse, and type-check`);

console.log("\nGenerated examples");

let staleExamples = 0;
let crlfExamples = 0;

for (const [preset, directory] of Object.entries(exampleNames)) {
	const { files } = await compose({
		...presets[preset].options,
		name: directory
	});

	for (const [relative, expected] of Object.entries(files)) {
		try {
			const actual = await readFile(
				path.join(root, "examples", directory, relative),
				"utf8"
			);
			if (actual !== expected) {
				if (actual.replace(/\r\n/g, "\n") === expected) crlfExamples++;
				fail(`examples/${directory}/${relative} is stale`);
				staleExamples++;
			}
		} catch {
			fail(`examples/${directory}/${relative} is missing`);
			staleExamples++;
		}
	}
}

if (crlfExamples) {
	console.error(
		`  hint  ${crlfExamples} of those differ only in line endings. Git checked them out as CRLF; run "git add --renormalize ." to restore LF.`
	);
}
if (!staleExamples) ok("all preset files match the generator");

console.log("\nURL parsing");

const parserBuild = await compose({
	name: "https",
	language: "js",
	bundler: "none",
	features: ["aboutPages"]
});
const parser = await import(
	`data:text/javascript,${encodeURIComponent(parserBuild.files["public/js/url.js"])}`
);
const search = "https://search.brave.com/search?q=%s";
const parserCases = [
	["localhost:3000", "url"],
	["crllect.dev:8080", "url"],
	["https://crllect.dev", "url"],
	["mailto:hello@crllect.dev", "external"],
	["javascript:alert(1)", "blocked"]
];

for (const [input, kind] of parserCases) {
	const result = parser.resolveInput(input, search);
	if (result.kind !== kind)
		fail(`${input} resolved as ${result.kind}, expected ${kind}`);
}
if (parser.INTERNAL_SCHEME === "https:")
	fail("reserved project name became an internal scheme");
if (!failures) ok(`${parserCases.length} address classes resolve correctly`);

console.log("\nInternal navigation");

const internalBuild = await compose({
	name: "internalcheck",
	language: "js",
	bundler: "none",
	features: ["browserControls", "aboutPages"]
});
const internalModule = await import(
	`data:text/javascript,${encodeURIComponent(internalBuild.files["public/js/internal.js"])}`
);
const internalHistory = new internalModule.InternalHistory();
internalHistory.push("internalcheck://newtab");
internalHistory.push("internalcheck://settings");
if (internalHistory.back() !== "internalcheck://newtab") {
	fail("internal back did not return to the previous page");
}
if (internalHistory.forward() !== "internalcheck://settings") {
	fail("internal forward did not return to the next page");
}
internalHistory.back();
internalHistory.push("internalcheck://about");
if (internalHistory.forward() !== null) {
	fail("new internal navigation did not discard forward history");
}
internalHistory.clear();
if (internalHistory.canGoBack || internalHistory.canGoForward) {
	fail("internal history did not clear before external navigation");
}
const internalApp = internalBuild.files["public/js/app.js"];
if (
	!internalApp.includes("internalHistory.push(url)") ||
	!internalApp.includes("internalHistory.clear()")
) {
	fail("internal pages do not keep a stack across srcdoc assignments");
}
if (!failures)
	ok("back, forward, branching, and reset work per internal stack");

console.log("\nBrowser controls");

for (const [label, options] of [
	["without custom protocols", { features: ["browserControls"] }],
	["with custom protocols", { features: ["browserControls", "aboutPages"] }],
	["with tabs", { features: ["browserControls", "tabs"] }]
]) {
	const build = await compose({
		name: "controlscheck",
		language: "js",
		bundler: "none",
		...options
	});
	const app = build.files["public/js/app.js"];

	if (
		!app.includes('$("#back").disabled = !canGoBack()') ||
		!app.includes('$("#forward").disabled = !canGoForward()')
	) {
		fail(`back and forward never gray out ${label}`);
	}
	if (
		!app.includes("const url = goBack();") ||
		!app.includes("navigate(url, { record: false })")
	) {
		fail(`back and forward do not replay the visit stack ${label}`);
	}
}
if (!failures) ok("back and forward track navigation state in every build");

console.log("\nPopup menus");

const popupBuild = await compose({
	name: "popupcheck",
	language: "js",
	bundler: "none",
	features: ["settings"]
});
const popupHtml = popupBuild.files["public/index.html"];
const popupApp = popupBuild.files["public/js/app.js"];
if (popupBuild.options.features.includes("aboutPages")) {
	fail("popup settings build enabled custom protocols");
}
if (
	!popupHtml.includes('data-popup="settings"') ||
	popupHtml.includes('id="back"')
) {
	fail("settings popup depends on browser controls");
}
if (
	!popupApp.includes("doc.write(html)") ||
	popupApp.includes("popupFrame.srcdoc")
) {
	fail("popup renderer would add to browser history");
}
if (!popupApp.includes("element.inert = true")) {
	fail("popup does not isolate keyboard focus from the proxy shell");
}
if (popupBuild.files["public/js/url.js"].includes("popupcheck:")) {
	fail("popup settings build recognizes a custom protocol");
}
if (!failures)
	ok(
		"settings render without custom protocols, browser controls, or history navigation"
	);

console.log("\nNavigation compatibility");

const braveBuild = await compose({
	name: "bravecheck",
	language: "ts",
	bundler: "vite",
	engine: "scramjet",
	wiring: "manual",
	features: ["browserControls", "tabs", "aboutPages"]
});
const braveEngine = braveBuild.files["src/engine.ts"];
const braveTabs = braveBuild.files["src/tabs.ts"];
const braveApp = braveBuild.files["src/app.ts"];
const everythingBuild = await compose({
	...presets.everything.options,
	name: "refreshcheck"
});
if (
	!braveEngine.includes('super("history-url", [])') ||
	!braveEngine.includes("url ?? context.client.url.href")
) {
	fail("Scramjet does not preserve omitted History URLs");
}
if (
	!braveTabs.includes("historyIndex") ||
	!braveTabs.includes("if (this.element.srcdoc) return")
) {
	fail("tab navigation does not retain internal-page history safely");
}
if (
	!braveApp.includes("tabs.active?.canGoBack") ||
	!braveApp.includes("navigate(url, { record: false })")
) {
	fail("browser controls do not use the tab navigation stack");
}
if (
	!braveBuild.files["src/internal.ts"].includes("homeUrl") ||
	braveBuild.files["src/internal.ts"].includes("newtabUrl") ||
	!braveApp.includes("tab.url = url")
) {
	fail("internal new-tab routes do not retain their active tab URL");
}
if (
	braveEngine.includes("return new URL(location.href)") ||
	!braveEngine.includes("data:text/html,${encodeURIComponent(errorPage")
) {
	fail("escaped proxy navigations can load the shell in an iframe");
}
if (
	!everythingBuild.files["src/app.ts"].includes(
		'visitLog.onChange(() => refreshInternalPages(["history"]))'
	) ||
	!everythingBuild.files["src/app.ts"].includes(
		'bookmarks.onChange(() => refreshInternalPages(["bookmarks"]))'
	)
) {
	fail("protocol-backed history and bookmarks do not refresh while open");
}
if (!failures)
	ok("Brave history URLs and tab control state are handled per session");

console.log(failures ? `\n${failures} problem(s)\n` : "\nAll checks passed\n");
process.exit(failures ? 1 : 0);
