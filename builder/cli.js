#!/usr/bin/env node

import { mkdir, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

import { compose } from "./node.js";
import {
	presets,
	engines,
	features,
	wirings,
	servers,
	hosts,
	languages,
	runtimes,
	bundlers,
	styling,
	transports,
	packageManagers,
	frontends
} from "./options.js";

const parseArgs = argv => {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) continue;

		const [flag, inlineValue] = arg.slice(2).split("=", 2);
		const key = flag === "package-manager" ? "packageManager" : flag;
		const value =
			inlineValue ??
			(argv[i + 1]?.startsWith("--") ? undefined : argv[++i]);

		if (key === "features")
			out.features = (value ?? "").split(",").filter(Boolean);
		else if (key === "help") out.help = true;
		else out[key] = value ?? true;
	}
	return out;
};

const usage = () => {
	const list = obj => Object.keys(obj).join(" | ");
	console.log(`
Scaffold a proxy from the ProxDocs builder.

  node builder/cli.js --out <dir> [options]

Options
  --out <dir>        where to write. required
  --preset <name>    ${list(presets)}
  --name <name>      project name (default: the output directory name)

  --language <id>    ${list(languages)}
  --package-manager  ${list(packageManagers)}
  --runtime <id>     ${list(runtimes)}
  --server <id>      ${list(servers)}
  --frontend <id>    ${list(frontends)}
  --bundler <id>     ${list(bundlers)}
  --styling <id>     ${list(styling)}

  --engine <id>      ${list(engines)}
  --wiring <id>      ${list(wirings)}
  --transport <id>   ${list(transports)}
  --host <id>        ${list(hosts)}

  --features a,b,c   ${Object.keys(features).join(",")}
  --force            write into a non-empty directory

Illegal combinations are corrected automatically and reported, so you can ask
for anything and see what it resolved to.

Examples
  node builder/cli.js --out ./my-proxy --preset barebones
  node builder/cli.js --out ./my-proxy --preset standard
  node builder/cli.js --out ./my-proxy --engine scramjet --wiring manual \\
      --features tabs,settings,transportSwitch,history
`);
};

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.out) {
	usage();
	process.exit(args.help ? 0 : 1);
}

const outDir = path.resolve(String(args.out));

const preset = args.preset ? presets[args.preset] : null;
if (args.preset && !preset) {
	console.error(
		`Unknown preset "${args.preset}". Options: ${Object.keys(presets).join(", ")}`
	);
	process.exit(1);
}

const raw = {
	...(preset?.options ?? {}),
	name: args.name ?? path.basename(outDir)
};

for (const key of [
	"language",
	"packageManager",
	"runtime",
	"server",
	"frontend",
	"bundler",
	"styling",
	"engine",
	"wiring",
	"transport",
	"host"
]) {
	if (args[key]) raw[key] = args[key];
}
if (Array.isArray(args.features)) raw.features = args.features;

try {
	const existing = await readdir(outDir);
	if (existing.length && !args.force) {
		console.error(
			`${outDir} is not empty. Pass --force to write into it anyway.`
		);
		process.exit(1);
	}
} catch (error) {
	if (error.code !== "ENOENT") throw error;
}

const { files, options, notes } = await compose(raw);

for (const [relative, contents] of Object.entries(files)) {
	const target = path.join(outDir, relative);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, contents);
}

console.log(`\nCreated ${Object.keys(files).length} files in ${outDir}`);
console.log(
	`  ${languages[options.language].label} · ${runtimes[options.runtime].label} · ` +
		`${packageManagers[options.packageManager].label} · ${servers[options.server].label} · ` +
		`${frontends[options.frontend].label} · ${bundlers[options.bundler].label} · ` +
		`${styling[options.styling].label}`
);
console.log(
	`  ${engines[options.engine].label}, ${options.wiring} wiring, ${options.transport} transport`
);
console.log(
	`  features: ${options.features.length ? options.features.join(", ") : "none (barebones)"}`
);

if (notes.length) {
	console.log("\nAdjustments:");
	for (const note of notes) console.log(`  - ${note}`);
}

const pm = packageManagers[options.packageManager];
console.log(
	`\nNext:\n  cd ${path.relative(process.cwd(), outDir) || "."}\n  ${pm.install}\n  ${pm.run} start\n`
);
