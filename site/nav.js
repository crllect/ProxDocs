export const nav = [
	{
		title: "Start here",
		items: [
			{ slug: "index", file: "index.md", title: "Overview" },
			{
				slug: "guides/quickstart",
				file: "guides/quickstart.md",
				title: "Quickstart"
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
				title: "How a proxy works"
			},
			{
				slug: "concepts/scramjet-vs-ultraviolet",
				file: "concepts/scramjet-vs-ultraviolet.md",
				title: "Scramjet vs Ultraviolet"
			},
			{
				slug: "concepts/wisp-vs-bare",
				file: "concepts/wisp-vs-bare.md",
				title: "Wisp vs Bare"
			},
			{
				slug: "concepts/transports",
				file: "concepts/transports.md",
				title: "Transports"
			},
			{
				slug: "concepts/bare-mux",
				file: "concepts/bare-mux.md",
				title: "bare-mux and proxy-transports"
			},
			{
				slug: "concepts/cross-origin-isolation",
				file: "concepts/cross-origin-isolation.md",
				title: "Cross-origin isolation"
			}
		]
	},
	{
		title: "Guides",
		items: [
			{
				slug: "guides/multiple-tabs",
				file: "guides/multiple-tabs.md",
				title: "Multiple tabs"
			},
			{
				slug: "guides/settings",
				file: "guides/settings.md",
				title: "Settings"
			},
			{
				slug: "guides/url-parsing-and-history",
				file: "guides/url-parsing-and-history.md",
				title: "URL parsing and history"
			},
			{
				slug: "guides/custom-protocols",
				file: "guides/custom-protocols.md",
				title: "Custom protocols"
			},
			{
				slug: "guides/cookies-and-sessions",
				file: "guides/cookies-and-sessions.md",
				title: "Cookies and sessions"
			},
			{
				slug: "guides/search-engines",
				file: "guides/search-engines.md",
				title: "Search engines"
			},
			{
				slug: "guides/wiring",
				file: "guides/wiring.md",
				title: "Bootstrap or manual"
			},
			{
				slug: "guides/ultraviolet-vercel",
				file: "guides/ultraviolet-vercel.md",
				title: "Ultraviolet on Vercel"
			},
			{
				slug: "guides/frameworks",
				file: "guides/frameworks.md",
				title: "Framework integrations"
			},
			{
				slug: "guides/deployment",
				file: "guides/deployment.md",
				title: "Deployment"
			},
			{
				slug: "guides/running-a-proxy",
				file: "guides/running-a-proxy.md",
				title: "Running a proxy"
			},
			{
				slug: "guides/site-best-practices",
				file: "guides/site-best-practices.md",
				title: "Practices worth knowing"
			}
		]
	},
	{
		title: "Reference",
		items: [
			{
				slug: "reference/scramjet-config",
				file: "reference/scramjet-config.md",
				title: "Config and flags"
			},
			{
				slug: "reference/plugins-and-hooks",
				file: "reference/plugins-and-hooks.md",
				title: "Plugins and hooks"
			},
			{
				slug: "reference/site-compatibility",
				file: "reference/site-compatibility.md",
				title: "Site compatibility"
			},
			{
				slug: "reference/versions",
				file: "reference/versions.md",
				title: "Version matrix"
			},
			{
				slug: "reference/breaking-changes",
				file: "reference/breaking-changes.md",
				title: "Breaking changes"
			},
			{
				slug: "reference/troubleshooting",
				file: "reference/troubleshooting.md",
				title: "Troubleshooting"
			},
			{
				slug: "reference/official-docs",
				file: "reference/official-docs.md",
				title: "Official docs and licensing"
			},
			{
				slug: "reference/glossary",
				file: "reference/glossary.md",
				title: "Glossary"
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
