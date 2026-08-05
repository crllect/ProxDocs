export const nav = [
	{
		title: "Start here",
		items: [
			{
				slug: "index",
				file: "index.md",
				title: "Overview",
				description:
					"How interception proxies like Scramjet and Ultraviolet work, and a generator that builds you a working one."
			},
			{
				slug: "guides/quickstart",
				file: "guides/quickstart.md",
				title: "Quickstart",
				description:
					"Build a working Scramjet proxy from nothing in about two minutes, and understand each file it generates."
			},
			{
				slug: "build",
				title: "Build your proxy",
				external: false,
				isBuilder: true
			}
		]
	},
	{
		title: "Concepts",
		items: [
			{
				slug: "concepts/how-proxies-work",
				file: "concepts/how-proxies-work.md",
				title: "How a proxy works",
				description:
					"The four layers of an interception proxy, and one request traced end to end through all of them."
			},
			{
				slug: "concepts/engines",
				file: "concepts/engines.md",
				title: "Proxy engines",
				description:
					"What a proxy engine does, why this site documents Scramjet, and what the older engines you will see referenced actually were."
			},
			{
				slug: "concepts/wisp-vs-bare",
				file: "concepts/wisp-vs-bare.md",
				title: "Wisp vs Bare",
				description:
					"The two tunnel protocols behind web proxies, what each one exposes to your server, and why wisp won."
			},
			{
				slug: "concepts/transports",
				file: "concepts/transports.md",
				title: "Transports",
				description:
					"libcurl, epoxy, and bare. What each transport does, how to choose, and how to switch at runtime."
			},
			{
				slug: "concepts/bare-mux",
				file: "concepts/bare-mux.md",
				title: "bare-mux and proxy-transports",
				description:
					"What bare-mux is, why Ultraviolet 3.x needs it, and what replaced it in Scramjet 2.x."
			},
			{
				slug: "concepts/cross-origin-isolation",
				file: "concepts/cross-origin-isolation.md",
				title: "Cross-origin isolation",
				description:
					"Why Scramjet needs COOP and COEP headers, what SharedArrayBuffer has to do with it, and what breaks without them."
			},
			{
				slug: "concepts/scramjet-internals",
				file: "concepts/scramjet-internals.md",
				title: "Inside Scramjet",
				description:
					"Scramjet's own codebase: the packages, the Rust rewriter, what each build output is, and how to run its tests."
			}
		]
	},
	{
		title: "Guides",
		items: [
			{
				slug: "guides/multiple-tabs",
				file: "guides/multiple-tabs.md",
				title: "Multiple tabs",
				description:
					"Real proxy tabs that keep their pages alive, with one controller, one frame each, and no reload on switch."
			},
			{
				slug: "guides/settings",
				file: "guides/settings.md",
				title: "Settings",
				description:
					"A validated, persisted settings system for a proxy, and why storage is untrusted input on your own origin."
			},
			{
				slug: "guides/url-parsing-and-history",
				file: "guides/url-parsing-and-history.md",
				title: "URL parsing and history",
				description:
					"Turn address-bar input into a URL correctly, and build back and forward that behave like a browser."
			},
			{
				slug: "guides/custom-protocols",
				file: "guides/custom-protocols.md",
				title: "Custom protocols",
				description:
					"Internal pages on your own scheme, plus Scramjet fake origins served entirely from a plugin."
			},
			{
				slug: "guides/cookies-and-sessions",
				file: "guides/cookies-and-sessions.md",
				title: "Cookies and sessions",
				description:
					"Where Scramjet stores cookies, how sessions persist across tabs, and what commonly breaks logins."
			},
			{
				slug: "guides/cookies-and-sessions",
				file: "guides/cookies-and-sessions.md",
				title: "Cookies and sessions",
				description:
					"Where Scramjet keeps cookies, how the CookieJar persists and syncs across tabs, and the three things that break logins."
			},
			{
				slug: "guides/search-engines",
				file: "guides/search-engines.md",
				title: "Search engines",
				description:
					"Which search engines survive a web proxy, which only work in development, and why Google blocks server IPs."
			},
			{
				slug: "guides/wiring",
				file: "guides/wiring.md",
				title: "Wiring Scramjet",
				description:
					"How to serve Scramjet's browser files, service worker, and Wisp endpoint, with pinned package versions."
			},
			{
				slug: "guides/serverless",
				file: "guides/serverless.md",
				title: "Serverless deployment",
				description:
					"Deploy an all-in-one proxy to Vercel and similar hosts using the Bare transport, and the real limits that come with it."
			},
			{
				slug: "guides/frameworks",
				file: "guides/frameworks.md",
				title: "Framework integrations",
				description:
					"Wiring a proxy into React, Astro, Vite, Fastify, Next.js, SvelteKit, and Bun."
			},
			{
				slug: "guides/deployment",
				file: "guides/deployment.md",
				title: "Deployment",
				description:
					"Hosting a proxy with HTTPS and WebSockets, which platforms work, and the capacity numbers to plan for."
			},
			{
				slug: "guides/running-a-proxy",
				file: "guides/running-a-proxy.md",
				title: "Running a proxy",
				description:
					"What happens after launch: bandwidth, filtering vendors, rate limiting, abuse reports, and what to log."
			},
			{
				slug: "guides/site-best-practices",
				file: "guides/site-best-practices.md",
				title: "Practices worth knowing",
				description:
					"What proxied pages can reach on your origin, what codecs and cloaking actually hide, and how to say so honestly."
			}
		]
	},
	{
		title: "Reference",
		items: [
			{
				slug: "reference/scramjet-config",
				file: "reference/scramjet-config.md",
				title: "Config and flags",
				description:
					"Every Scramjet config option and feature flag, what each one changes, and how siteFlags overrides work per origin."
			},
			{
				slug: "reference/plugins-and-hooks",
				file: "reference/plugins-and-hooks.md",
				title: "Plugins and hooks",
				description:
					"Scramjet plugin API and every hook it exposes, with the context and props each one gives you."
			},
			{
				slug: "reference/controller-api",
				file: "reference/controller-api.md",
				title: "Controller and Frame API",
				description:
					"Every member of the Controller and Frame classes, the types they exchange, and the ones that do not do what they look like."
			},
			{
				slug: "reference/core-api",
				file: "reference/core-api.md",
				title: "Core API and types",
				description:
					"Every class, function, and type on the $scramjet global, with the signatures and the behaviour they do not advertise."
			},
			{
				slug: "reference/site-compatibility",
				file: "reference/site-compatibility.md",
				title: "Site compatibility",
				description:
					"Why a given site fails through a proxy, whether it is DRM, bot detection, CSP, or a flag you can change."
			},
			{
				slug: "reference/versions",
				file: "reference/versions.md",
				title: "Version matrix",
				description:
					"Which versions of Scramjet, Ultraviolet, and the transport packages work together, verified against npm."
			},
			{
				slug: "reference/breaking-changes",
				file: "reference/breaking-changes.md",
				title: "Breaking changes",
				description:
					"What changed between Scramjet 1.x and 2.x, and between the old and new transport packages."
			},
			{
				slug: "reference/troubleshooting",
				file: "reference/troubleshooting.md",
				title: "Troubleshooting",
				description:
					"Fixes for the errors people actually hit building a web proxy, ordered by how often each is the answer."
			},
			{
				slug: "reference/official-docs",
				file: "reference/official-docs.md",
				title: "Official docs and licensing",
				description:
					"Upstream repositories, published docs, and the licensing rules that apply to a proxy you distribute."
			},
			{
				slug: "reference/glossary",
				file: "reference/glossary.md",
				title: "Glossary",
				description:
					"Every term in the web proxy ecosystem, defined in one line with a link to the page that teaches it."
			}
		]
	}
];

const bySlug = new Map();
for (const section of nav) {
	for (const item of section.items) {
		if (item.file)
			bySlug.set(item.slug, { ...item, section: section.title });
	}
}

export const findPage = slug => bySlug.get(slug) ?? null;

export const breadcrumbFor = slug => {
	const page = bySlug.get(slug);
	if (!page) return [];
	return page.section === "Start here"
		? [{ title: page.title }]
		: [{ title: page.section }, { title: page.title }];
};

export const adjacent = slug => {
	const flat = nav.flatMap(s => s.items.filter(i => i.file));
	const index = flat.findIndex(i => i.slug === slug);
	return {
		prev: index > 0 ? flat[index - 1] : null,
		next: index >= 0 && index < flat.length - 1 ? flat[index + 1] : null
	};
};
