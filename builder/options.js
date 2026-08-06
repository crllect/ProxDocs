export const languages = {
	ts: {
		label: "TypeScript",
		tagline: "Types on the engine adapter and every feature module.",
		detail: "Needs a bundler, because the browser cannot run .ts directly."
	},
	js: {
		label: "JavaScript",
		tagline: "The same code with the types erased.",
		detail: "Pair with no build step to edit files and just refresh."
	}
};

export const packageManagers = {
	npm: {
		label: "npm",
		tagline: "Ships with Node.",
		run: "npm run",
		exec: "npx",
		install: "npm install"
	},
	pnpm: {
		label: "pnpm",
		tagline: "Faster, hard-links its store.",
		run: "pnpm",
		exec: "pnpm dlx",
		install: "pnpm install"
	},
	yarn: {
		label: "yarn",
		tagline: "Still common in older projects.",
		run: "yarn",
		exec: "yarn dlx",
		install: "yarn install"
	},
	bun: {
		label: "bun",
		tagline: "Fastest install of the four.",
		run: "bun run",
		exec: "bunx",
		install: "bun install"
	}
};

export const runtimes = {
	node: {
		label: "Node",
		tagline: "Node 20 or newer.",
		detail: "TypeScript on the server runs through tsx."
	},
	bun: {
		label: "Bun",
		tagline: "Runs the TypeScript server with no loader.",
		detail: "Only Express is reliable here; see the note in this file."
	}
};

export const servers = {
	express: {
		label: "Express",
		tagline: "The community default. Every proxy guide assumes it.",
		runtimes: ["node", "bun"]
	},
	fastify: {
		label: "Fastify",
		tagline: "Faster and stricter. What most large proxy sites run.",
		detail: "Node only.",
		runtimes: ["node"]
	}
};

export const frontends = {
	vanilla: {
		label: "Vanilla",
		tagline: "Plain DOM calls. Nothing between you and the engine.",
		detail: "The best one to read first.",
		needsBundler: false
	},
	react: {
		label: "React",
		tagline: "A React-rendered shell around the same engine adapter.",
		detail: "Vite mounts the proxy controller after React commits the shell.",
		needsBundler: true
	},
	astro: {
		label: "Astro + Preact",
		tagline: "A static Astro page with a hydrated Preact proxy island.",
		detail: "Astro builds the page; Preact owns the interactive shell.",
		needsBundler: true
	}
};

export const bundlers = {
	none: {
		label: "No build step",
		tagline: "Plain files in public/, served as-is.",
		detail: "JavaScript and plain CSS only."
	},
	vite: {
		label: "Vite",
		tagline: "Dev server with reload, bundled production build.",
		detail: "Required for TypeScript, SCSS, Tailwind, React or Astro."
	}
};

export const styling = {
	plain: { label: "Plain CSS", tagline: "No tooling.", needsBundler: false },
	scss: {
		label: "SCSS",
		tagline: "Nesting and variables.",
		needsBundler: true
	},
	tailwind: {
		label: "Tailwind",
		tagline: "Utility classes.",
		detail: "With no build step it loads from the Tailwind CDN instead.",
		needsBundler: false
	}
};

export const engines = {
	scramjet: {
		label: "Scramjet",
		tagline:
			"Rust/WASM rewriter, frames and plugins. Runs over Wisp or Bare.",
		detail: "The current generation, and the only engine this builder ships.",
		requiresIsolation: true,
		docs: "/concepts/engines"
	}
};

export const wirings = {
	bootstrap: {
		label: "Bootstrap",
		tagline: "proxy-bootstrap fetches and serves every asset for you.",
		detail: "Three lines of server code. Pins one transport at boot, resolves packages at runtime, and cannot use the Bare transport.",
		engines: ["scramjet"],
		hidden: true,
		docs: "/guides/wiring"
	},
	manual: {
		label: "Manual",
		tagline: "You mount each package yourself from node_modules.",
		detail: "More server code, but you control versions and can serve both transports.",
		engines: ["scramjet"],
		docs: "/guides/wiring"
	}
};

const transportOrder = ["libcurl", "epoxy", "bare"];

export const transports = {
	libcurl: {
		label: "libcurl",
		tagline: "curl in WebAssembly, over wisp. Widest site compatibility.",
		backend: "wisp",
		module: "/libcurl/index.mjs",
		docs: "/concepts/transports",
		engines: ["scramjet"]
	},
	epoxy: {
		label: "epoxy",
		tagline:
			"A Rust TLS stack in WebAssembly, over wisp. Smaller than libcurl.",
		backend: "wisp",
		module: "/epoxy/index.mjs",
		docs: "/concepts/transports",
		engines: ["scramjet"]
	},
	bare: {
		label: "bare",
		tagline: "Plain HTTP to a Bare server. Works without WebSockets.",
		detail: "The only transport that runs on request/response serverless hosts. Your server can inspect target request and response data, and WebSocket sites will not work.",
		backend: "bare",
		module: "/baremod/index.mjs",
		docs: "/guides/serverless",
		engines: ["scramjet"]
	}
};

export const features = {
	browserControls: {
		label: "Browser controls",
		tagline: "Back, forward and reload, wired to the frame's own history.",
		docs: "/guides/url-parsing-and-history"
	},
	tabs: {
		label: "Multiple tabs",
		tagline: "One proxy session per tab, kept alive in the background.",
		docs: "/guides/multiple-tabs"
	},
	settings: {
		label: "Settings",
		tagline: "Validated, persisted settings. Search engine, home page.",
		docs: "/guides/settings"
	},
	transportSwitch: {
		label: "Transport switching",
		tagline:
			"Pick libcurl, epoxy or bare at runtime, or point at another wisp server.",
		docs: "/concepts/transports"
	},
	history: {
		label: "History",
		tagline:
			"A persisted visit log, separate from per-tab back and forward.",
		docs: "/guides/url-parsing-and-history"
	},
	bookmarks: {
		label: "Bookmarks",
		tagline: "A saved list, using the same storage layer as settings.",
		docs: "/guides/settings"
	},
	cloak: {
		label: "Cloaking",
		tagline: "about:blank, blob, and title/icon presets, each toggleable.",
		docs: "/guides/settings#cloaking"
	},
	quietServiceWorker: {
		label: "Quiet service worker",
		tagline:
			"Silence log, info and debug inside the worker. Warnings and errors stay.",
		docs: "/guides/deployment#the-service-worker-cache"
	},
	aboutPages: {
		label: "Custom protocols",
		tagline: "Internal pages on your own scheme, e.g. proxy://settings.",
		docs: "/guides/custom-protocols"
	}
};

const needsStorage = ["settings", "history", "bookmarks", "cloak"];

export const presets = {
	minimal: {
		label: "Minimal",
		description:
			"One iframe and a URL bar, plain JavaScript with no build step. " +
			"Read this one first; every other preset is this plus features.",
		options: {
			language: "js",
			packageManager: "bun",
			runtime: "node",
			server: "express",
			frontend: "vanilla",
			bundler: "none",
			styling: "plain",
			engine: "scramjet",
			wiring: "manual",
			transports: ["libcurl"],
			features: ["browserControls"]
		}
	},
	standard: {
		label: "Standard",
		description:
			"The recommended setup. TypeScript, Vite and Tailwind on Fastify, " +
			"with tabs, settings and transport switching.",
		options: {
			language: "ts",
			packageManager: "bun",
			runtime: "node",
			server: "fastify",
			frontend: "vanilla",
			bundler: "vite",
			styling: "tailwind",
			engine: "scramjet",
			wiring: "manual",
			transports: ["libcurl", "epoxy"],
			features: ["browserControls", "tabs", "settings"]
		}
	},
	everything: {
		label: "Everything",
		description:
			"Every feature enabled, on Bun with Tailwind. Heavier than you need.",
		options: {
			language: "ts",
			packageManager: "bun",
			runtime: "bun",
			server: "express",
			frontend: "vanilla",
			bundler: "vite",
			styling: "tailwind",
			engine: "scramjet",
			wiring: "manual",
			transports: ["libcurl", "epoxy", "bare"],
			features: Object.keys(features)
		}
	},
	serverless: {
		label: "Serverless",
		description:
			"Scramjet over a Bare server, for serverless hosts that cannot hold a WebSocket open.",
		options: {
			language: "js",
			packageManager: "bun",
			runtime: "node",
			server: "express",
			frontend: "vanilla",
			bundler: "none",
			styling: "plain",
			engine: "scramjet",
			wiring: "manual",
			transports: ["bare"],
			features: ["browserControls", "settings", "history", "aboutPages"]
		}
	},
	react: {
		label: "React",
		description: "A React shell built with TypeScript and Vite.",
		options: {
			language: "ts",
			packageManager: "bun",
			runtime: "node",
			server: "express",
			frontend: "react",
			bundler: "vite",
			styling: "plain",
			engine: "scramjet",
			wiring: "manual",
			transports: ["libcurl"],
			features: ["browserControls", "tabs", "settings"]
		}
	},
	astroPreact: {
		label: "Astro + Preact",
		description:
			"A static Astro frontend with a hydrated Preact proxy island.",
		options: {
			language: "ts",
			packageManager: "bun",
			runtime: "node",
			server: "express",
			frontend: "astro",
			bundler: "vite",
			styling: "plain",
			engine: "scramjet",
			wiring: "manual",
			transports: ["libcurl"],
			features: ["browserControls", "settings"]
		}
	}
};

export const exampleNames = {
	minimal: "minimal",
	standard: "standard",
	everything: "everything",
	serverless: "serverless",
	react: "react",
	astroPreact: "astro-preact"
};

export const defaults = {
	name: "my-proxy",
	language: "ts",
	packageManager: "bun",
	runtime: "node",
	server: "fastify",
	frontend: "vanilla",
	bundler: "vite",
	styling: "plain",
	engine: "scramjet",
	wiring: "manual",
	transports: ["libcurl"],
	vercel: false,
	features: ["browserControls", "tabs"]
};

export const incompatibilities = opts => {
	const out = {
		language: {},
		runtime: {},
		server: {},
		frontend: {},
		bundler: {},
		styling: {},
		engine: {},
		wiring: {},
		transport: {},
		features: {}
	};

	if (opts.vercel) {
		out.transport.libcurl =
			"Wisp needs a WebSocket, which serverless hosts cannot hold open.";
		out.transport.epoxy =
			"Wisp needs a WebSocket, which serverless hosts cannot hold open.";
		out.wiring.bootstrap =
			"proxy-bootstrap only wires Wisp transports, which need a WebSocket.";
		out.runtime.bun = "Vercel functions run Node.";
		out.server.fastify =
			"The generated Vercel function exports an Express handler.";
		out.features.transportSwitch =
			"Vercel cannot use the Wisp transports available to the switcher.";
	}

	if (opts.wiring === "bootstrap") {
		out.transport.bare =
			"proxy-bootstrap 0.0.5 ships a stub that throws for bare. Use manual wiring.";
		out.transport.epoxy =
			"proxy-bootstrap 0.0.5 does not serve its epoxy client correctly.";
		out.features.transportSwitch =
			"Bootstrap serves only the transport it was configured with.";
	}

	const bundlerReasons = [];
	if (opts.language === "ts") bundlerReasons.push("TypeScript");
	if (styling[opts.styling]?.needsBundler)
		bundlerReasons.push(styling[opts.styling].label);
	if (frontends[opts.frontend]?.needsBundler)
		bundlerReasons.push(frontends[opts.frontend].label);

	if (bundlerReasons.length) {
		out.bundler.none = `${bundlerReasons.join(" and ")} needs a build step.`;
	}

	if (opts.bundler === "none") {
		out.language.ts =
			"The browser cannot run TypeScript without a build step.";
		out.styling.scss = "SCSS has to be compiled.";
	}

	for (const [id, def] of Object.entries(servers)) {
		if (!def.runtimes.includes(opts.runtime)) {
			out.server[id] =
				`${def.label} does not work correctly on ${runtimes[opts.runtime].label}.`;
		}
	}

	if (opts.server === "fastify")
		out.runtime.bun = "Fastify serves empty bodies under Bun.";

	return out;
};

export const resolve = (raw = {}) => {
	const notes = [];
	const opts = { ...defaults, ...raw };

	opts.name =
		String(opts.name || defaults.name)
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^[._-]+|[._-]+$/g, "")
			.slice(0, 60) || defaults.name;
	if (["node_modules", "favicon.ico"].includes(opts.name)) {
		opts.name += "-project";
	}

	const pick = (field, table) => {
		if (Object.hasOwn(table, opts[field])) return;
		if (Object.hasOwn(raw, field) && raw[field] !== undefined) {
			notes.push(
				`${field} "${String(raw[field]).slice(0, 40)}" is not one of ${Object.keys(table).join(", ")}. Using ${defaults[field]}.`
			);
		}
		opts[field] = defaults[field];
	};

	pick("language", languages);
	pick("packageManager", packageManagers);
	pick("runtime", runtimes);
	pick("server", servers);
	pick("frontend", frontends);
	pick("bundler", bundlers);
	pick("styling", styling);
	pick("engine", engines);
	pick("wiring", wirings);

	opts.vercel = opts.vercel === true || opts.vercel === "true";

	if (!wirings[opts.wiring]?.engines.includes(opts.engine)) {
		opts.wiring = "manual";
	}

	let selected = Array.isArray(opts.transports)
		? opts.transports
		: opts.transports
			? [opts.transports]
			: opts.transport
				? [opts.transport]
				: [];
	selected = transportOrder.filter(
		id =>
			selected.includes(id) &&
			transports[id].engines.includes(opts.engine)
	);
	if (!selected.length) selected = ["libcurl"];

	if (opts.wiring === "bootstrap" && selected.includes("epoxy")) {
		notes.push(
			"proxy-bootstrap 0.0.5 cannot serve epoxy correctly, so epoxy was dropped."
		);
		selected = selected.filter(id => id !== "epoxy");
	}

	if (opts.wiring === "bootstrap" && selected.includes("bare")) {
		notes.push(
			"proxy-bootstrap 0.0.5 cannot wire the Bare transport, so manual wiring was used."
		);
		opts.wiring = "manual";
	}

	if (opts.vercel) {
		if (selected.some(id => transports[id].backend === "wisp")) {
			notes.push(
				"A Vercel function cannot hold a WebSocket open, so only Bare was kept."
			);
		}
		selected = ["bare"];
	}

	if (!selected.length) selected = ["libcurl"];
	opts.transports = selected;
	opts.transport = selected[0];

	if (opts.runtime === "bun" && opts.vercel) {
		notes.push("Vercel functions run Node, so the runtime was switched.");
		opts.runtime = "node";
	}

	if (opts.server === "fastify" && opts.vercel) {
		notes.push(
			"The Vercel function needs an exported handler, so Express was used."
		);
		opts.server = "express";
	}

	if (!servers[opts.server].runtimes.includes(opts.runtime)) {
		notes.push(
			`${servers[opts.server].label} does not work on ${runtimes[opts.runtime].label}, so Express was used.`
		);
		opts.server = "express";
	}

	const bundlerReasons = [];
	if (opts.language === "ts") bundlerReasons.push("TypeScript");
	if (styling[opts.styling].needsBundler)
		bundlerReasons.push(styling[opts.styling].label);
	if (frontends[opts.frontend].needsBundler)
		bundlerReasons.push(frontends[opts.frontend].label);

	if (bundlerReasons.length && opts.bundler !== "vite") {
		notes.push(
			`${bundlerReasons.join(" and ")} needs a build step, so Vite was enabled.`
		);
		opts.bundler = "vite";
	}

	const requested = Array.isArray(opts.features)
		? [...new Set(opts.features)]
		: [];
	const selectedFeatures = [];

	for (const key of requested) {
		if (!Object.hasOwn(features, key)) continue;

		if (key === "transportSwitch" && opts.transports.length > 1) {
			selectedFeatures.push(key);
			continue;
		}

		if (key === "transportSwitch" && opts.vercel) {
			notes.push(
				"A Vercel function cannot hold a WebSocket open, so only the Bare transport is available and switching was removed."
			);
			continue;
		}

		if (key === "transportSwitch" && opts.wiring === "bootstrap") {
			notes.push(
				"Transport switching needs manual wiring, so bootstrap was switched off."
			);
			opts.wiring = "manual";
		}

		selectedFeatures.push(key);
	}

	const dependsOn = (feature, dependency, why) => {
		if (
			selectedFeatures.includes(feature) &&
			!selectedFeatures.includes(dependency)
		) {
			selectedFeatures.push(dependency);
			notes.push(why);
		}
	};

	if (
		opts.transports.length > 1 &&
		!selectedFeatures.includes("transportSwitch")
	) {
		selectedFeatures.push("transportSwitch");
		notes.push(
			"More than one transport was selected, so transport switching is on."
		);
	}

	dependsOn(
		"bookmarks",
		"settings",
		"Bookmarks use the settings storage layer."
	);
	dependsOn(
		"transportSwitch",
		"settings",
		"Transport switching stores its choice in settings."
	);
	dependsOn(
		"cloak",
		"settings",
		"Cloaking reads its title and icon from settings."
	);
	dependsOn(
		"history",
		"settings",
		"History uses a setting to control whether visits are saved."
	);
	opts.features = Object.keys(features).filter(k =>
		selectedFeatures.includes(k)
	);
	opts.needsStorage = opts.features.some(f => needsStorage.includes(f));
	opts.transportBackend = transports[opts.transport].backend;

	return { options: opts, notes };
};

export const availability = opts => {
	const reasons = incompatibilities(opts);
	const tables = {
		language: languages,
		runtime: runtimes,
		server: servers,
		frontend: frontends,
		bundler: bundlers,
		styling: styling,
		engine: engines
	};

	const blocked = {};
	const consequence = {};

	for (const [field, table] of Object.entries(tables)) {
		blocked[field] = {};
		consequence[field] = {};

		for (const value of Object.keys(table)) {
			if (value === opts[field]) continue;

			const attempt = resolve({ ...opts, [field]: value });
			const applied = attempt.options[field] === value;
			const reason = reasons[field]?.[value];

			if (!applied) {
				blocked[field][value] =
					reason ?? `${value} cannot be used with these choices.`;
			} else if (attempt.notes.length) {
				consequence[field][value] = attempt.notes.join(" ");
			}
		}
	}

	blocked.transport = {};
	consequence.transport = {};
	for (const id of Object.keys(transports)) {
		if (opts.transports.includes(id)) continue;
		const attempt = resolve({
			...opts,
			transports: [...opts.transports, id]
		});
		if (!attempt.options.transports.includes(id)) {
			blocked.transport[id] =
				reasons.transport?.[id] ??
				`${id} cannot be used with these choices.`;
		} else if (attempt.notes.length) {
			consequence.transport[id] = attempt.notes.join(" ");
		}
	}

	blocked.features = {};
	consequence.features = {};
	for (const key of Object.keys(features)) {
		if (opts.features.includes(key)) continue;
		const attempt = resolve({
			...opts,
			features: [...opts.features, key]
		});
		if (!attempt.options.features.includes(key)) {
			blocked.features[key] =
				reasons.features?.[key] ??
				`${key} cannot be used with these choices.`;
		} else if (attempt.notes.length) {
			consequence.features[key] = attempt.notes.join(" ");
		}
	}

	return { blocked, consequence };
};

export const has = (opts, feature) => opts.features.includes(feature);

export const visible = group =>
	Object.fromEntries(
		Object.entries(group).filter(([, value]) => !value.hidden)
	);
