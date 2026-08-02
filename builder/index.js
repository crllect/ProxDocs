import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	resolve as resolveOptions,
	has,
	engines,
	features,
	languages,
	runtimes,
	servers,
	bundlers,
	styling,
	transports,
	hosts,
	packageManagers,
	frontends
} from "./options.js";
import { render } from "./template.js";
import { toJavaScript, rewriteImportExtensions } from "./transpile.js";
import { versions, scramjetSpecifiers, verifiedOn } from "./versions.js";

const partsDir = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"parts"
);
const part = relative => readFile(path.join(partsDir, relative), "utf8");

export const compose = async (raw = {}) => {
	const { options, notes } = resolveOptions(raw);

	const isScramjet = options.engine === "scramjet";
	const isBootstrap = options.wiring === "bootstrap";
	const isVite = options.bundler === "vite";
	const isTs = options.language === "ts";
	const isReact = options.frontend === "react";
	const isAstro = options.frontend === "astro";
	const isFramework = isReact || isAstro;
	const ext = isTs ? "ts" : "js";
	const componentExt = isTs ? "tsx" : "jsx";

	const srcDir = isVite ? "src" : "public/js";
	const staticRoot = isVite ? "dist" : "public";
	const appEntry = isVite ? `/src/app.${ext}` : "/js/app.js";
	const styleExt = options.styling === "scss" ? "scss" : "css";
	const hasMenuPages = [
		"settings",
		"history",
		"bookmarks",
		"aboutPages"
	].some(feature => options.features.includes(feature));

	const flags = new Set([
		options.engine,
		options.wiring,
		options.server,
		options.language,
		options.runtime,
		options.styling,
		options.frontend,
		options.packageManager,
		options.host,
		options.bundler === "vite" ? "vite" : "nobundler",
		`transport${cap(options.transportBackend)}`,
		...options.features
	]);

	if (isScramjet && !isBootstrap) flags.add("scramjetManual");
	if (isFramework) flags.add("frameworkFrontend");
	if (isReact || options.styling === "tailwind") flags.add("vitePlugins");
	if (hasMenuPages) flags.add("menuPages");
	if (hasMenuPages && !options.features.includes("aboutPages"))
		flags.add("popupMenus");
	if (engines[options.engine].requiresIsolation)
		flags.add("requiresIsolation");
	if (
		options.transport === "libcurl" ||
		options.features.includes("transportSwitch")
	) {
		flags.add("hasLibcurl");
	}
	if (
		options.transport === "epoxy" ||
		options.features.includes("transportSwitch")
	) {
		flags.add("hasEpoxy");
	}
	if (
		isBootstrap ||
		options.transportBackend === "wisp" ||
		(options.transportBackend === "bare" && options.host !== "vercel")
	) {
		flags.add("hasWebsockets");
	}

	const test = flag => flags.has(flag);

	const transportOptions = transportChoices(options);
	const serverCommand = devServerCommand(options, isTs);
	const clientCommand = frontendCommand(options);
	const vars = {
		PROJECT_NAME: options.name,
		PROJECT_TITLE: titleCase(options.name),
		PORT: options.host === "vercel" ? 3000 : 8080,
		STORAGE_NAMESPACE: options.name,
		INTERNAL_SCHEME: internalScheme(options.name),
		SCRAMJET_VERSION: versions.scramjet,
		ENGINE_VERSION:
			options.engine === "scramjet"
				? versions.scramjet
				: versions.ultraviolet.replace(/^[^\d]*/, ""),
		ENGINE_LABEL: engines[options.engine].label,
		DEFAULT_TRANSPORT: options.transport,
		TRANSPORT_IDS: transportOptions
			.map(transport => JSON.stringify(transport.id))
			.join(",\n"),
		TRANSPORT_OPTIONS: transportOptions
			.map(transport => inlineObject(transport))
			.join(",\n"),
		STATIC_ROOT: staticRoot,
		APP_ENTRY: appEntry,
		CLIENT_EXT: ext,
		COMPONENT_EXT: componentExt,
		STYLE_EXT: styleExt,
		VITE_PROXY_ROUTES: Object.entries(viteProxyConfig(options))
			.map(([route, config]) => `${JSON.stringify(route)}: ${config}`)
			.join(",\n"),
		DEV_SERVER_EXECUTABLE: serverCommand.executable,
		DEV_SERVER_ARGS: serverCommand.args.map(JSON.stringify).join(",\n"),
		DEV_CLIENT_EXECUTABLE: clientCommand.executable,
		DEV_CLIENT_ARGS: clientCommand.args.map(JSON.stringify).join(",\n")
	};

	const files = {};

	const emitSource = async (source, destinationBase) => {
		const rendered = render(await part(source), test, vars);
		if (isTs) {
			files[`${destinationBase}.ts`] = rendered;
		} else {
			files[`${destinationBase}.js`] = rewriteImportExtensions(
				toJavaScript(rendered, source),
				"js"
			);
		}
	};

	const emitRaw = async (source, destination) => {
		files[destination] = render(await part(source), test, vars);
	};
	const emitComponent = async (source, destinationBase) => {
		files[`${destinationBase}.${componentExt}`] = render(
			await part(source),
			test,
			vars
		);
	};

	if (isTs) await emitSource("client/types.ts", `${srcDir}/types`);
	await emitSource("client/app.ts", `${srcDir}/app`);
	await emitSource("client/url.ts", `${srcDir}/url`);
	await emitSource(
		isScramjet ? "engine/scramjet.ts" : "engine/ultraviolet.ts",
		`${srcDir}/engine`
	);

	if (options.needsStorage)
		await emitSource("client/storage.ts", `${srcDir}/storage`);
	if (has(options, "settings"))
		await emitSource("client/settings.ts", `${srcDir}/settings`);
	if (has(options, "tabs"))
		await emitSource("client/tabs.ts", `${srcDir}/tabs`);
	if (has(options, "history"))
		await emitSource("client/history.ts", `${srcDir}/history`);
	if (has(options, "bookmarks"))
		await emitSource("client/bookmarks.ts", `${srcDir}/bookmarks`);
	if (has(options, "cloak"))
		await emitSource("client/cloak.ts", `${srcDir}/cloak`);
	if (hasMenuPages) {
		await emitSource("client/internal.ts", `${srcDir}/internal`);
		await emitSource(
			"client/internal-pages.ts",
			`${srcDir}/internal-pages`
		);
	}

	if (isReact) {
		await emitRaw("client/react-index.html", "index.html");
		await emitComponent("client/ProxyShell.tsx", "src/ProxyShell");
		await emitComponent("client/react-main.tsx", "src/main");
	} else if (isAstro) {
		await emitRaw("client/index.astro", "src/pages/index.astro");
		await emitComponent("client/ProxyShell.tsx", "src/ProxyShell");
	} else {
		await emitRaw(
			"client/index.html",
			isVite ? "index.html" : "public/index.html"
		);
	}

	const css = render(await part("client/styles.css"), test, vars);
	if (isVite) {
		files[`src/styles.${styleExt}`] = styleSheet(css, options.styling);
	} else {
		files["public/styles.css"] = css;
	}

	if (isScramjet && !isBootstrap) {
		await emitRaw("raw/sw-scramjet.js", "public/sw.js");
	}
	if (!isScramjet) {
		await emitRaw("raw/uv-sw.js", "public/uv-sw.js");
		await emitRaw("raw/uv.config.js", "public/uv-config.js");
	}

	await emitSource(`server/${options.server}.ts`, "server");

	if (isVite) {
		if (isAstro) await emitRaw("raw/astro.config.mjs", "astro.config.mjs");
		else await emitSource("raw/vite.config.ts", "vite.config");
		await emitRaw("raw/dev.js", "dev.js");
	}
	if (isTs) {
		files["tsconfig.json"] = tsconfig(options) + "\n";
		await emitRaw("raw/vendor.d.ts", `${srcDir}/vendor.d.ts`);
	}

	files["package.json"] =
		packageJson(options, { isVite, isTs, isReact, isAstro, staticRoot }) +
		"\n";
	files["LICENSE"] = await part("raw/LICENSE");
	files["README.md"] = readme(options, notes, vars, { isVite, isTs, srcDir });
	files[".gitignore"] = [
		"node_modules/",
		"dist/",
		"coverage/",
		".vite/",
		".cache/",
		"*.tsbuildinfo",
		"",
		".env",
		".env.*",
		"!.env.example",
		"!.env.*.example",
		"*.log",
		".vercel/",
		"",
		".DS_Store",
		"Thumbs.db",
		".idea/",
		".vscode/",
		"*.swp",
		"*.swo",
		"*~",
		""
	].join("\n");

	if (options.host === "vercel") {
		const builds = [
			{
				src: `server.${ext}`,
				use: "@vercel/node",
				config: {
					includeFiles: [
						`${staticRoot}/**`,
						"node_modules/@titaniumnetwork-dev/ultraviolet/**",
						"node_modules/@mercuryworkshop/bare-mux/**",
						"node_modules/@mercuryworkshop/bare-as-module3/**"
					]
				}
			}
		];
		if (isVite) {
			builds.push({
				src: "package.json",
				use: "@vercel/static-build",
				config: { distDir: "dist" }
			});
		}
		files["vercel.json"] =
			JSON.stringify(
				{
					version: 2,
					builds,
					routes: [
						...(isVite ? [{ handle: "filesystem" }] : []),
						{ src: "/(.*)", dest: `server.${ext}` }
					]
				},
				null,
				2
			) + "\n";
	}

	return { files, options, notes };
};

const transportChoices = options => {
	if (!options.features.includes("transportSwitch")) {
		const t = transports[options.transport];
		return [{ id: options.transport, label: t.label, detail: t.detail }];
	}
	if (options.transportBackend === "bare") {
		return [{ id: "bare", label: "bare", detail: transports.bare.detail }];
	}
	return [
		{
			id: "libcurl",
			label: "libcurl",
			detail: "Widest compatibility, heavier to start."
		},
		{
			id: "epoxy",
			label: "epoxy",
			detail: "Lighter and faster, slightly pickier."
		}
	];
};

const devServerCommand = (options, isTs) => {
	if (options.runtime === "bun")
		return { executable: "bun", args: [`server.${isTs ? "ts" : "js"}`] };
	if (!isTs) return { executable: "node", args: ["server.js"] };

	switch (options.packageManager) {
		case "pnpm":
			return { executable: "pnpm", args: ["exec", "tsx", "server.ts"] };
		case "yarn":
			return { executable: "yarn", args: ["tsx", "server.ts"] };
		case "bun":
			return { executable: "bunx", args: ["tsx", "server.ts"] };
		default:
			return { executable: "npx", args: ["tsx", "server.ts"] };
	}
};

const frontendCommand = options => {
	const command = options.frontend === "astro" ? "astro" : "vite";
	const args = options.frontend === "astro" ? [command, "dev"] : [command];
	switch (options.packageManager) {
		case "pnpm":
			return { executable: "pnpm", args: ["exec", ...args] };
		case "yarn":
			return { executable: "yarn", args };
		case "bun":
			return { executable: "bunx", args };
		default:
			return { executable: "npx", args };
	}
};

// Values are emitted as raw code, not JSON, so the targets can interpolate the
// `backendPort` const that the config file resolves from BACKEND_PORT.
const viteProxyConfig = options => {
	const proxy = {};
	const switches = options.features.includes("transportSwitch");
	const backend = "`http://127.0.0.1:${backendPort}`";
	const http = route => {
		proxy[route] = backend;
	};

	if (options.engine === "scramjet") {
		if (options.wiring === "bootstrap") {
			for (const p of [
				"/bootstrap-init.js",
				"/sw.js",
				"/scram",
				"/controller",
				"/clients"
			])
				http(p);
		} else {
			for (const p of ["/scram", "/utils", "/controller"]) http(p);
			if (options.transport === "libcurl" || switches) http("/libcurl");
			if (options.transport === "epoxy" || switches) http("/epoxy");
		}
	} else {
		for (const p of ["/uv", "/baremux"]) http(p);
		if (options.transportBackend === "wisp") {
			if (options.transport === "libcurl" || switches) http("/libcurl");
			if (options.transport === "epoxy" || switches) http("/epoxy");
		} else {
			http("/baremod");
			http("/bare");
		}
	}

	if (options.transportBackend === "wisp" || options.wiring === "bootstrap") {
		proxy["/wisp"] =
			"{ target: `ws://127.0.0.1:${backendPort}`, ws: true }";
	}

	return proxy;
};

const styleSheet = (css, stylingChoice) => {
	if (stylingChoice === "tailwind") {
		return `@import "tailwindcss";

@layer components {
${css
	.split("\n")
	.map(line => (line.trim() ? "\t" + line : line))
	.join("\n")}
}
`;
	}

	if (stylingChoice === "scss") {
		return css;
	}

	return css;
};

const tsconfig = options => {
	const isVite = options.bundler === "vite";
	const isReact = options.frontend === "react";
	const isAstro = options.frontend === "astro";
	return JSON.stringify(
		{
			...(isAstro ? { extends: "astro/tsconfigs/strict" } : {}),
			compilerOptions: {
				target: "ES2022",
				lib: ["ES2022", "DOM", "DOM.Iterable"],
				module: "ESNext",
				moduleResolution: "bundler",
				noEmit: true,
				allowImportingTsExtensions: true,
				verbatimModuleSyntax: true,
				erasableSyntaxOnly: true,
				strict: true,
				noUncheckedIndexedAccess: false,
				skipLibCheck: true,
				isolatedModules: true,
				resolveJsonModule: true,
				...(isReact || isAstro
					? {
							jsx: "react-jsx",
							jsxImportSource: isAstro ? "preact" : "react"
						}
					: {}),
				types: isAstro
					? ["astro/client", "vite/client"]
					: isVite
						? ["vite/client"]
						: []
			},
			include: [
				isVite ? "src" : "public/js",
				"server.ts",
				...(isVite && !isAstro ? ["vite.config.ts"] : [])
			]
		},
		null,
		2
	);
};

const packageJson = (
	options,
	{ isVite, isTs, isReact, isAstro, staticRoot }
) => {
	const deps = {};
	const devDeps = {};
	const ext = isTs ? "ts" : "js";
	const bun = options.runtime === "bun";

	if (options.server === "express") deps.express = versions.express;
	if (options.server === "fastify") {
		deps.fastify = versions.fastify;
		deps["@fastify/static"] = versions.fastifyStatic;
	}
	if (options.server === "hono") {
		deps.hono = versions.hono;
		deps["@hono/node-server"] = versions.honoNodeServer;
	}

	if (options.engine === "scramjet") {
		if (options.wiring === "bootstrap") {
			deps["@mercuryworkshop/proxy-bootstrap"] = versions.proxyBootstrap;
		} else {
			Object.assign(deps, scramjetSpecifiers);
			if (
				options.transport === "libcurl" ||
				options.features.includes("transportSwitch")
			) {
				deps["@mercuryworkshop/libcurl-transport"] =
					versions.libcurlTransport;
			}
			if (
				options.transport === "epoxy" ||
				options.features.includes("transportSwitch")
			) {
				deps["@mercuryworkshop/epoxy-transport"] =
					versions.epoxyTransport;
			}
			deps["@mercuryworkshop/wisp-js"] = versions.wispJs;
		}
	} else {
		deps["@titaniumnetwork-dev/ultraviolet"] = versions.ultraviolet;
		deps["@mercuryworkshop/bare-mux"] = versions.bareMux;

		if (options.transportBackend === "wisp") {
			if (
				options.transport === "libcurl" ||
				options.features.includes("transportSwitch")
			) {
				deps["@mercuryworkshop/libcurl-transport"] =
					versions.libcurlTransportLegacy;
			}
			if (
				options.transport === "epoxy" ||
				options.features.includes("transportSwitch")
			) {
				deps["@mercuryworkshop/epoxy-transport"] =
					versions.epoxyTransportLegacy;
			}
			deps["@mercuryworkshop/wisp-js"] = versions.wispJs;
		} else {
			deps["@mercuryworkshop/bare-as-module3"] = versions.bareAsModule3;
			deps["@tomphttp/bare-server-node"] = versions.bareServerNode;
		}
	}

	if (isVite) {
		devDeps.vite = isAstro ? versions.viteAstro : versions.vite;
		if (options.styling === "scss") devDeps.sass = versions.sass;
		if (options.styling === "tailwind") {
			devDeps.tailwindcss = versions.tailwindcss;
			devDeps["@tailwindcss/vite"] = versions.tailwindVite;
		}
	}
	if (isReact) {
		deps.react = versions.react;
		deps["react-dom"] = versions.reactDom;
		devDeps["@vitejs/plugin-react"] = versions.viteReact;
	}
	if (isAstro) {
		deps.preact = versions.preact;
		devDeps.astro = versions.astro;
		devDeps["@astrojs/preact"] = versions.astroPreact;
		if (isTs) devDeps["@astrojs/check"] = versions.astroCheck;
	}
	if (isTs) {
		devDeps.typescript = versions.typescript;
		if (!bun) devDeps.tsx = versions.tsx;
		devDeps["@types/node"] = versions.typesNode;
		if (options.server === "express")
			devDeps["@types/express"] = versions.typesExpress;
		if (isReact) {
			devDeps["@types/react"] = versions.typesReact;
			devDeps["@types/react-dom"] = versions.typesReactDom;
		}
	}

	const pm = packageManagers[options.packageManager];
	const runServer = bun
		? `bun server.${ext}`
		: isTs
			? "tsx server.ts"
			: "node server.js";

	const scripts = {};
	if (isVite) {
		scripts.build = isAstro ? "astro build" : "vite build";
		scripts.start = `${pm.run} build && ${runServer}`;
		scripts.dev = bun ? "bun dev.js" : "node dev.js";
		scripts.server = runServer;
	} else {
		scripts.start = runServer;
		scripts.dev = runServer;
	}
	if (isTs) scripts.typecheck = isAstro ? "astro check" : "tsc --noEmit";

	return JSON.stringify(
		{
			name: options.name,
			version: "1.0.0",
			private: true,
			type: "module",
			scripts,
			engines: bun ? undefined : { node: isAstro ? ">=22.12" : ">=20" },
			dependencies: sortKeys(deps),
			...(Object.keys(devDeps).length
				? { devDependencies: sortKeys(devDeps) }
				: {})
		},
		null,
		2
	);
};

const readme = (options, notes, vars, { isVite, isTs, srcDir }) => {
	const engine = engines[options.engine];
	const pm = packageManagers[options.packageManager];
	const install = pm.install;
	const start = `${pm.run} start`;

	const lines = [
		`# ${vars.PROJECT_TITLE}`,
		"",
		`Generated by [ProxDocs](https://github.com/crllect/ProxDocs). Package versions verified ${verifiedOn}.`,
		"",
		"## Run it",
		"",
		"```bash",
		install,
		start,
		"```",
		"",
		`The server listens on port ${vars.PORT}, or the first free port above it if that one is taken. Set \`PORT\` to choose a starting point.`,
		""
	];

	if (isVite) {
		lines.push(
			"`start` builds the frontend and then serves it. For live reload:",
			"",
			"```bash",
			`${pm.run} dev`,
			"```",
			"",
			"That runs the backend and Vite together. Vite alone is not enough: the",
			"service worker fetches the engine bundles from the backend, and without",
			"it you get an importScripts 500 and a blank page.",
			""
		);
	}

	lines.push(
		"## What this build is",
		"",
		"| Field | Value |",
		"| --- | --- |",
		`| Language | ${languages[options.language].label} |`,
		`| Package manager | ${packageManagers[options.packageManager].label} |`,
		`| Runtime | ${runtimes[options.runtime].label} |`,
		`| Frontend | ${frontends[options.frontend].label} |`,
		`| Server | ${servers[options.server].label} |`,
		`| Build | ${bundlers[options.bundler].label} |`,
		`| Styling | ${styling[options.styling].label} |`,
		`| Engine | ${engine.label} |`,
		`| Wiring | ${options.wiring} |`,
		`| Transport | ${transports[options.transport].label} (${options.transportBackend}) |`,
		`| Target host | ${hosts[options.host].label} |`,
		"",
		"### Features",
		"",
		options.features.length
			? options.features
					.map(
						f =>
							`- **${features[f].label}:** ${features[f].tagline}`
					)
					.join("\n")
			: "_None. This is the barebones build._",
		""
	);

	if (notes.length) {
		lines.push(
			"### Adjustments made when generating",
			"",
			...notes.map(n => `- ${n}`),
			""
		);
	}

	const e = isTs ? "ts" : "js";
	lines.push(
		"## Licence",
		"",
		"This generated project is licensed AGPL-3.0-only. If you modify and deploy",
		"AGPL software for other people to use over a network, review the source-offer",
		"requirements in `LICENSE`.",
		"",
		"## Where things are",
		"",
		"```",
		`server.${e}${" ".repeat(Math.max(1, 22 - `server.${e}`.length))}static files + the tunnel endpoint`,
		`${srcDir}/engine.${e}${" ".repeat(Math.max(1, 22 - `${srcDir}/engine.${e}`.length))}the ONLY file that talks to the proxy engine`,
		`${srcDir}/app.${e}${" ".repeat(Math.max(1, 22 - `${srcDir}/app.${e}`.length))}DOM wiring; rewrite this freely`,
		`${srcDir}/url.${e}${" ".repeat(Math.max(1, 22 - `${srcDir}/url.${e}`.length))}address-bar input -> URL`,
		...(isTs
			? [
					`${srcDir}/types.${e}${" ".repeat(Math.max(1, 22 - `${srcDir}/types.${e}`.length))}the engine interface, read this first`
				]
			: []),
		"```",
		"",
		`\`engine.${e}\` implements a small interface (\`init\`, \`createSession\`, \`setTransport\`).`,
		"Feature modules use that interface. Changing engines also changes server mounts,",
		"dependencies, service-worker files, and transport setup.",
		""
	);

	if (engine.requiresIsolation) {
		lines.push(
			"## Requirements",
			"",
			"- **HTTPS in production.** Service workers do not run on plain HTTP",
			"  (localhost is exempt).",
			"- **Cross-origin isolation.** The server sets `Cross-Origin-Opener-Policy`",
			"  and `Cross-Origin-Embedder-Policy`. Scramjet's wasm rewriter needs",
			"  `SharedArrayBuffer`, which browsers withhold without them.",
			"- **WebSockets.** The Wisp tunnel is a long-lived WebSocket, so serverless",
			"  hosts will not work. Use a VPS, Render, Fly, Railway, or similar.",
			""
		);
	}

	if (options.host === "vercel") {
		lines.push(
			"## Deploying to Vercel",
			"",
			"`vercel.json` routes everything to the server, which runs as a serverless",
			"function. That means:",
			"",
			"- WebSocket-dependent sites will not work. Functions cannot hold a socket open.",
			"- The Bare server terminates target TLS and can inspect request and response data.",
			"",
			"These are limits of the serverless deployment model.",
			""
		);
	}

	return lines.join("\n");
};

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const titleCase = name =>
	name
		.split(/[-_.]+/)
		.filter(Boolean)
		.map(w => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ") || "My Proxy";

const internalScheme = name => {
	const cleaned = name.replace(/[^a-z0-9]/g, "");
	if (!/^[a-z]/.test(cleaned)) return "app";
	const reserved = new Set([
		"about",
		"blob",
		"chrome",
		"data",
		"edge",
		"file",
		"ftp",
		"http",
		"https",
		"javascript",
		"mailto",
		"tel",
		"viewsource"
	]);
	return reserved.has(cleaned) ? `${cleaned}app` : cleaned.slice(0, 20);
};

const sortKeys = obj =>
	Object.fromEntries(
		Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
	);

const inlineObject = object =>
	`{ ${Object.entries(object)
		.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
		.join(", ")} }`;

export { resolveOptions, engines, features };
