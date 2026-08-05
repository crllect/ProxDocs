import { adjacent } from "./nav.js";
import { versions, verifiedOn } from "../builder/versions.js";

export const escapeHtml = value => {
	return String(value).replace(
		/[&<>"']/g,
		c =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;"
			})[c]
	);
};

export const sidebar = (nav, activeSlug) => {
	return nav
		.map(
			section => `
	<div class="nav-section">
		<h2>${escapeHtml(section.title)}</h2>
		<ul>
		${section.items
			.map(item => {
				const href = item.slug === "index" ? "/" : `/${item.slug}`;
				const active =
					item.slug === activeSlug ? ' class="active"' : "";
				const badge = item.isBuilder
					? ' <span class="badge">interactive</span>'
					: "";
				return `<li><a href="${href}"${active}>${escapeHtml(item.title)}${badge}</a></li>`;
			})
			.join("\n        ")}
		</ul>
	</div>`
		)
		.join("\n");
};

export const siteUrl = "https://docs.crllect.dev";
export const siteName = "ProxDocs";

export const canonicalFor = slug =>
	!slug || slug === "index" ? `${siteUrl}/` : `${siteUrl}/${slug}`;

export const shell = ({
	title,
	slug,
	nav,
	main,
	description = "",
	noindex = false,
	structuredData = null,
	extraHead = "",
	extraBody = ""
}) => {
	const canonical = canonicalFor(slug);
	const fullTitle =
		slug === "index"
			? `${escapeHtml(title)}`
			: `${escapeHtml(title)} · ${siteName}`;
	const summary = escapeHtml(description);

	const meta = description
		? `<meta name="description" content="${summary}">
	<meta property="og:description" content="${summary}">
	<meta name="twitter:description" content="${summary}">`
		: "";

	const jsonLd = structuredData
		? `<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, "\\u003c")}</script>`
		: "";

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>${fullTitle}</title>
	<link rel="stylesheet" href="/static/styles.css">
	<link rel="icon" href="/static/favicon.png" type="image/png" sizes="64x64">
	<link rel="icon" href="/static/favicon.webp" type="image/webp" sizes="64x64">
	<link rel="canonical" href="${canonical}">
	${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">'}
	${meta}
	<meta property="og:type" content="article">
	<meta property="og:site_name" content="${siteName}">
	<meta property="og:title" content="${escapeHtml(title)}">
	<meta property="og:url" content="${canonical}">
	<meta property="og:image" content="${siteUrl}/static/favicon.png">
	<meta name="twitter:card" content="summary">
	<meta name="twitter:title" content="${escapeHtml(title)}">
	${jsonLd}
	${extraHead}
</head>
<body>
<a class="skip" href="#content">Skip to content</a>

<header class="topbar">
	<button id="menu-toggle" class="menu-toggle" aria-label="Toggle navigation" aria-expanded="false">☰</button>
	<a class="brand" href="/">ProxDocs</a>
	<div class="docs-search">
		<form id="docs-search-form" role="search">
			<input id="docs-search" type="search" placeholder="Search docs" aria-label="Search documentation" autocomplete="off">
		</form>
		<div id="docs-search-results" class="docs-search__results" hidden></div>
	</div>
	<nav class="topbar__links">
	<a href="/build">Build</a>
	<a href="/reference/troubleshooting">Troubleshooting</a>
	<a href="https://github.com/crllect/ProxDocs" target="_blank" rel="noopener">GitHub</a>
	</nav>
	<button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme">◐</button>
</header>

<div class="layout">
	<aside id="sidebar" class="sidebar">
		${sidebar(nav, slug)}
	</aside>
	${main}
</div>

<script src="/static/site.js" type="module"></script>
<img style="width: 2px !important; height: 2px !important; position: fixed !important; bottom: -10px !important; right: -10px !important; display: block; pointer-events: none;" src="https://camo.githubusercontent.com/b280996b9b433cf0863cc7421bca2a03b6e05bc1aca10d94cdeb89421820d354/68747470733a2f2f6b6f6d617265762e636f6d2f67687076632f3f757365726e616d653d63726c6c65637426636f6c6f723d393739373937267374796c653d666f722d7468652d6261646765266c6162656c3d50726f66696c652b5669657773" alt="Profile Views">
${extraBody}
</body>
</html>`;
};

export const layout = ({
	title,
	slug,
	nav,
	breadcrumb,
	toc,
	body,
	sourcePath,
	description = "",
	noindex = false,
	updated = null
}) => {
	const { prev, next } = adjacent(slug);

	const tocHtml = toc.length
		? `<nav class="toc" aria-label="On this page">
		<h2>On this page</h2>
		<ul>
			${toc
				.map(
					h =>
						`<li class="toc-${h.depth}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`
				)
				.join("\n           ")}
		</ul>
	</nav>`
		: "";

	const crumbs = breadcrumb.length
		? `<p class="breadcrumb">${breadcrumb.map(c => escapeHtml(c.title)).join(" › ")}</p>`
		: "";

	const pager = `
	<nav class="pager">
		${prev ? `<a class="pager__prev" href="/${prev.slug}"><span>Previous</span>${escapeHtml(prev.title)}</a>` : "<span></span>"}
		${next ? `<a class="pager__next" href="/${next.slug}"><span>Next</span>${escapeHtml(next.title)}</a>` : "<span></span>"}
	</nav>`;

	const source = sourcePath
		? `<p class="source-link">Source: <code>${escapeHtml(sourcePath)}</code><br />Verified against Scramjet <code>${escapeHtml(versions.scramjet)}</code> and controller <code>${escapeHtml(versions.scramjetController)}</code> on ${escapeHtml(verifiedOn)}. If this page and upstream disagree, upstream is right.</p>`
		: "";

	const crumbTrail = [{ title: siteName, slug: "index" }].concat(
		breadcrumb.slice(0, -1).map(c => ({ title: c.title })),
		slug && slug !== "index" ? [{ title, slug }] : []
	);

	const structuredData = {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "TechArticle",
				headline: title,
				description,
				url: canonicalFor(slug),
				inLanguage: "en",
				isPartOf: {
					"@type": "WebSite",
					name: siteName,
					url: `${siteUrl}/`
				},
				...(updated ? { dateModified: updated } : {})
			},
			{
				"@type": "BreadcrumbList",
				itemListElement: crumbTrail.map((entry, index) => ({
					"@type": "ListItem",
					position: index + 1,
					name: entry.title,
					...(entry.slug ? { item: canonicalFor(entry.slug) } : {})
				}))
			}
		]
	};

	return shell({
		title,
		slug,
		nav,
		description,
		noindex,
		structuredData,
		main: `
	<main id="content" class="content">
		<article class="prose">
		${crumbs}
		${body}
		${source}
		${pager}
		</article>
	</main>
	${tocHtml}`
	});
};
