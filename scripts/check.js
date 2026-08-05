#!/usr/bin/env node

import { readFile, access, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import ts from "typescript";

import { nav } from "../site/nav.js";
import { markdownToHtml } from "../site/markdown.js";
import { shell } from "../site/layout.js";
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
	defaults as defaultOptions,
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

const seenSlugs = new Set();
const seenFiles = new Set();
for (const page of pages) {
	if (seenSlugs.has(page.slug)) fail(`${page.slug} appears twice in the nav`);
	if (seenFiles.has(page.file)) fail(`${page.file} is in the nav twice`);
	seenSlugs.add(page.slug);
	seenFiles.add(page.file);
	if (!page.description) fail(`${page.slug} has no nav description`);
	else if (page.description.length > 160)
		fail(
			`${page.slug} description is ${page.description.length} chars, over 160`
		);
}

const onDisk = [];
for (const dir of ["", "concepts", "guides", "reference"]) {
	const full = path.join(docsDir, dir);
	for (const entry of await readdir(full, { withFileTypes: true })) {
		if (entry.isFile() && entry.name.endsWith(".md")) {
			onDisk.push(dir ? `${dir}/${entry.name}` : entry.name);
		}
	}
}
for (const file of onDisk) {
	if (!seenFiles.has(file)) fail(`docs/${file} exists but is not in the nav`);
}

if (!failures) ok(`${pages.length} pages present, each once, all reachable`);

console.log("\nInternal links");

const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
let linkCount = 0;
let brokenLinks = 0;

const headingIds = new Map();

const anchorsFor = source => {
	const ids = new Set();
	const seen = new Map();
	let fenced = false;
	let first = true;

	for (const line of source.split("\n")) {
		if (/^\s*```/.test(line)) fenced = !fenced;
		if (fenced) continue;

		const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
		if (!heading) continue;
		if (heading[1].length === 1 && first) {
			first = false;
			continue;
		}

		const base =
			heading[2]
				.toLowerCase()
				.replace(/`/g, "")
				.replace(/[^\w\s-]/g, "")
				.trim()
				.replace(/\s+/g, "-") || "section";
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		ids.add(count ? `${base}-${count}` : base);
	}

	return ids;
};

for (const page of pages) {
	let source;
	try {
		source = await readFile(path.join(docsDir, page.file), "utf8");
	} catch {
		continue;
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
		const [target, anchor] = href.split("#");
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
			continue;
		}

		if (!anchor) continue;
		if (!headingIds.has(resolved)) {
			headingIds.set(
				resolved,
				anchorsFor(await readFile(resolved, "utf8"))
			);
		}
		if (!headingIds.get(resolved).has(anchor)) {
			fail(`${page.file} → ${href} (no such heading)`);
			brokenLinks++;
		}
	}
}

if (!brokenLinks) ok(`${linkCount} relative links and anchors resolve`);

console.log("\nHouse style");

const styleRules = [
	{
		pattern: /[“”‘’]/g,
		message: "curly quote, use a straight quote"
	}
];

let styleViolations = 0;
const styleSources = [
	...pages.map(page => ({
		label: page.file,
		file: path.join(docsDir, page.file)
	})),
	{ label: "README.md", file: path.join(root, "README.md") },
	{ label: "CONTRIBUTING.md", file: path.join(root, "CONTRIBUTING.md") }
];

for (const source of styleSources) {
	let text;
	try {
		text = await readFile(source.file, "utf8");
	} catch {
		continue;
	}
	const lines = text.split("\n");
	for (const rule of styleRules) {
		lines.forEach((line, index) => {
			if (!rule.pattern.test(line)) return;
			rule.pattern.lastIndex = 0;
			fail(`${source.label}:${index + 1} ${rule.message}`);
			styleViolations++;
		});
	}
}

if (!styleViolations) {
	ok(`${styleSources.length} files use plain punctuation`);
}

console.log("\nVersion pins");

const pinnedPackages = {
	"@mercuryworkshop/scramjet": versions.scramjet,
	"@mercuryworkshop/scramjet-controller": versions.scramjetController,
	"@mercuryworkshop/scramjet-utils": versions.scramjetUtils,
	"@mercuryworkshop/proxy-bootstrap": versions.proxyBootstrap,
	"@mercuryworkshop/libcurl-transport": versions.libcurlTransport,
	"@mercuryworkshop/epoxy-transport": versions.epoxyTransport,
	"@mercuryworkshop/proxy-transports": versions.proxyTransports,
	"@mercuryworkshop/wisp-js": versions.wispJs
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
if (hostile.server !== defaultOptions.server)
	fail("inherited server option was accepted");
if (hostile.packageManager !== defaultOptions.packageManager)
	fail("inherited package-manager option was accepted");
if (hostile.wiring !== defaultOptions.wiring)
	fail("inherited wiring option was accepted");
if (hostile.features.length) fail("inherited feature option was accepted");

const serverlessSwitch = resolveOptions({
	host: "vercel",
	server: "fastify",
	features: ["transportSwitch"]
}).options;
if (serverlessSwitch.features.includes("transportSwitch")) {
	fail("serverless build retained transport switching");
}
if (serverlessSwitch.server !== "express") {
	fail("serverless build retained a server without an exported handler");
}
const popupSettings = resolveOptions({ features: ["settings"] }).options;
if (popupSettings.features.includes("aboutPages")) {
	fail("settings forced custom protocols instead of using a popup");
}
if (!failures) ok("inherited properties and serverless features are rejected");

console.log("\nPart directives");

const partsDir = path.join(root, "builder", "parts");
const collectFiles = async dir => {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await collectFiles(full)));
		else out.push(full);
	}
	return out;
};

const producibleFlags = new Set([
	...Object.keys(languages),
	...Object.keys(packageManagers),
	...Object.keys(servers),
	...Object.keys(wirings),
	...Object.keys(styling),
	...Object.keys(features),
	...Object.keys(exampleNames),
	"scramjet",
	"node",
	"bun",
	"vanilla",
	"react",
	"astro",
	"vite",
	"nobundler",
	"vercel",
	"tailwindCdn",
	"scramjetManual",
	"frameworkFrontend",
	"vitePlugins",
	"menuPages",
	"menuSingle",
	"popupMenus",
	"requiresIsolation",
	"hasLibcurl",
	"hasEpoxy",
	"transportBare",
	"transportWisp",
	"hasWebsockets"
]);

let unknownFlags = 0;
let directiveCount = 0;
for (const file of await collectFiles(partsDir)) {
	const source = await readFile(file, "utf8");
	for (const [, raw] of source.matchAll(/#if[ \t]+(!?[A-Za-z_][\w]*)/g)) {
		directiveCount++;
		const flag = raw.replace(/^!/, "");
		if (producibleFlags.has(flag)) continue;
		fail(
			`${path.relative(root, file)} tests #if ${flag}, which the generator never sets`
		);
		unknownFlags++;
	}
}
if (!unknownFlags) {
	ok(`${directiveCount} #if directives reference producible flags`);
}

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
		label: "scramjet-epoxy",
		options: {
			engine: "scramjet",
			wiring: "manual",
			transports: ["epoxy"],
			features: ["browserControls"]
		}
	},
	{
		label: "scramjet-bare",
		options: {
			engine: "scramjet",
			wiring: "manual",
			transports: ["bare"],
			features: ["browserControls", "tabs"]
		}
	},
	{
		label: "scramjet-multi-transport",
		options: {
			engine: "scramjet",
			wiring: "manual",
			transports: ["libcurl", "epoxy", "bare"],
			features: ["browserControls", "settings"]
		}
	},
	{
		label: "scramjet-bare-vercel",
		options: {
			engine: "scramjet",
			wiring: "manual",
			transports: ["bare"],
			host: "vercel",
			features: ["browserControls"]
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

const exampleDirs = new Set(Object.values(exampleNames));
for (const entry of await readdir(path.join(root, "examples"), {
	withFileTypes: true
})) {
	if (!entry.isDirectory() || exampleDirs.has(entry.name)) continue;
	fail(
		`examples/${entry.name}/ is not generated by any preset. Run bun run examples`
	);
}

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

console.log(failures ? `\n${failures} problem(s)\n` : "\nAll checks passed\n");
process.exit(failures ? 1 : 0);
