import { canonicalFor, siteUrl } from "./layout.js";

export const sitemapXml = (pages, lastmod) => {
	const entries = [
		{ slug: "index", priority: "1.0" },
		...pages
			.filter(page => page.slug !== "index")
			.map(page => ({ slug: page.slug, priority: "0.8" })),
		{ slug: "build", priority: "0.7" }
	];

	const urls = entries
		.map(
			({ slug, priority }) => `	<url>
		<loc>${canonicalFor(slug)}</loc>
		<lastmod>${lastmod}</lastmod>
		<changefreq>weekly</changefreq>
		<priority>${priority}</priority>
	</url>`
		)
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
};

export const robotsTxt = () => `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
