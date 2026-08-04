import {
	readFile,
	writeFile,
	mkdir,
	rm,
	readdir,
	copyFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { markdownToHtml } from "../site/markdown.js";
import { nav, breadcrumbFor } from "../site/nav.js";
import { layout } from "../site/layout.js";
import { sitemapXml, robotsTxt } from "../site/seo.js";
import { buildPage } from "../site/builder-page.js";
import { buildSearchIndex } from "../site/search-index.js";
import { partsDir } from "../builder/node.js";
import {
	presets,
	visible,
	engines,
	wirings,
	features,
	servers,
	hosts
} from "../builder/options.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "docs");
const publicDir = path.join(root, "site", "public");
const outDir = path.join(root, "dist");
const generatedDir = path.join(root, "functions", "_generated");

const buildDate = new Date().toISOString().slice(0, 10);

const write = async (relative, contents) => {
	const target = path.join(outDir, relative);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, contents);
	return contents.length;
};

const pageFor = slug => (slug === "index" ? "index.html" : `${slug}.html`);

const renderDoc = async page => {
	const source = await readFile(path.join(docsDir, page.file), "utf8");
	const { html, toc, title } = markdownToHtml(source, page.file);

	return layout({
		title: title ?? page.title,
		slug: page.slug,
		nav,
		breadcrumb: breadcrumbFor(page.slug),
		toc,
		body: html,
		description: page.description ?? "",
		updated: buildDate,
		sourcePath: `docs/${page.file}`
	});
};

const copyTree = async (from, to) => {
	await mkdir(to, { recursive: true });
	for (const entry of await readdir(from, { withFileTypes: true })) {
		const src = path.join(from, entry.name);
		const dest = path.join(to, entry.name);
		if (entry.isDirectory()) await copyTree(src, dest);
		else await copyFile(src, dest);
	}
};

const bundleParts = async () => {
	const parts = {};
	const walk = async dir => {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
				continue;
			}
			const relative = path
				.relative(partsDir, full)
				.split(path.sep)
				.join("/");
			parts[relative] = await readFile(full, "utf8");
		}
	};
	await walk(partsDir);

	const body = `// DONT TOUCH
export const parts = ${JSON.stringify(parts, null, 0)};

export const readPart = relative => {
	const contents = parts[relative];
	if (contents === undefined) {
		throw new Error(\`Unknown builder part: \${relative}\`);
	}
	return Promise.resolve(contents);
};
`;
	await mkdir(generatedDir, { recursive: true });
	await writeFile(path.join(generatedDir, "parts.js"), body);
	return { count: Object.keys(parts).length, bytes: body.length };
};

const run = async () => {
	await rm(outDir, { recursive: true, force: true });

	const pages = nav
		.flatMap(section => section.items)
		.filter(page => page.file);

	let bytes = 0;
	for (const page of pages) {
		bytes += await write(pageFor(page.slug), await renderDoc(page));
	}

	bytes += await write("build.html", buildPage({ nav }));

	bytes += await write(
		"404.html",
		layout({
			title: "Not found",
			slug: "",
			nav,
			breadcrumb: [],
			toc: [],
			noindex: true,
			body: "<h1>Not found</h1><p>There is no page at that address.</p>"
		})
	);

	await copyTree(publicDir, path.join(outDir, "static"));

	bytes += await write("sitemap.xml", sitemapXml(pages, buildDate));
	bytes += await write("robots.txt", robotsTxt());

	const index = await buildSearchIndex(docsDir);
	bytes += await write("static/search-index.json", JSON.stringify(index));

	bytes += await write(
		"static/options.json",
		JSON.stringify({
			presets,
			engines,
			wirings: visible(wirings),
			features,
			servers,
			hosts
		})
	);

	const parts = await bundleParts();

	console.log(
		`  ${pages.length} doc pages, /build, 404 (${(bytes / 1024).toFixed(0)} KB of HTML)`
	);
	console.log(`  search index: ${index.length} documents`);
	console.log(
		`  builder parts bundled: ${parts.count} files, ${(parts.bytes / 1024).toFixed(0)} KB`
	);
	console.log(`  dist written to ${path.relative(root, outDir)}\n`);
};

await run();
