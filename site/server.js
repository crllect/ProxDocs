import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { markdownToHtml } from "./markdown.js";
import { nav, findPage, breadcrumbFor } from "./nav.js";
import { layout } from "./layout.js";
import { buildPage } from "./builder-page.js";
import { compose } from "../builder/index.js";
import {
	presets,
	engines,
	wirings,
	features,
	servers,
	hosts,
	incompatibilities
} from "../builder/options.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "docs");
const publicDir = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"public"
);

const searchDocuments = await Promise.all(
	nav
		.flatMap(section => section.items)
		.filter(page => page.file)
		.map(async page => {
			const source = await readFile(
				path.join(docsDir, page.file),
				"utf8"
			);
			const text = source
				.replace(/```[\s\S]*?```/g, " ")
				.replace(/[#*_`>\[\]()|]/g, " ")
				.replace(/\s+/g, " ")
				.trim();
			return { title: page.title, slug: page.slug, text };
		})
);

const mimeTypes = {
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon"
};

const send = (res, status, body, type = "text/html; charset=utf-8") => {
	res.writeHead(status, {
		"Content-Type": type,
		"Cache-Control": "no-store"
	});
	res.end(body);
};

const serveStatic = async (res, pathname) => {
	const target = path.join(publicDir, pathname.replace(/^\/static\//, ""));
	if (!target.startsWith(publicDir + path.sep)) return false;

	try {
		const info = await stat(target);
		if (!info.isFile()) return false;
		const body = await readFile(target);
		send(
			res,
			200,
			body,
			mimeTypes[path.extname(target)] ?? "application/octet-stream"
		);
		return true;
	} catch {
		return false;
	}
};

const renderDoc = async (res, slug) => {
	const page = findPage(slug);
	if (!page) return false;

	let source;
	try {
		source = await readFile(path.join(docsDir, page.file), "utf8");
	} catch {
		return false;
	}

	const { html, toc, title } = markdownToHtml(source, page.file);

	send(
		res,
		200,
		layout({
			title: title ?? page.title,
			slug,
			nav,
			breadcrumb: breadcrumbFor(slug),
			toc,
			body: html,
			sourcePath: `docs/${page.file}`
		})
	);
	return true;
};

const searchDocs = query => {
	const normalized = query.trim().toLowerCase();
	if (normalized.length < 2) return [];

	return searchDocuments
		.map(document => {
			const titleIndex = document.title.toLowerCase().indexOf(normalized);
			const textIndex = document.text.toLowerCase().indexOf(normalized);
			const matchIndex = textIndex >= 0 ? textIndex : 0;
			const start = Math.max(0, matchIndex - 70);
			const end = Math.min(
				document.text.length,
				matchIndex + normalized.length + 110
			);
			return {
				...document,
				titleIndex,
				textIndex,
				snippet: `${start ? "..." : ""}${document.text.slice(start, end)}${end < document.text.length ? "..." : ""}`
			};
		})
		.filter(result => result.titleIndex >= 0 || result.textIndex >= 0)
		.sort((a, b) => {
			const aScore =
				a.titleIndex >= 0 ? a.titleIndex : a.textIndex + 1000;
			const bScore =
				b.titleIndex >= 0 ? b.titleIndex : b.textIndex + 1000;
			return aScore - bScore;
		})
		.slice(0, 8)
		.map(({ title, slug, snippet }) => ({ title, slug, snippet }));
};

const server = http.createServer(async (req, res) => {
	try {
		let requestUrl;
		let pathname;
		try {
			requestUrl = new URL(req.url, "https://myproxy.com");
			pathname = decodeURIComponent(requestUrl.pathname);
		} catch {
			return send(res, 400, "Bad request", "text/plain; charset=utf-8");
		}

		if (pathname.startsWith("/static/")) {
			if (await serveStatic(res, pathname)) return;
			return send(res, 404, "Not found", "text/plain");
		}

		switch (pathname) {
			case "/api/search":
				if (req.method !== "GET") break;
				return send(
					res,
					200,
					JSON.stringify(
						searchDocs(requestUrl.searchParams.get("q") ?? "")
					),
					"application/json; charset=utf-8"
				);
			case "/api/options":
				return send(
					res,
					200,
					JSON.stringify({
						presets,
						engines,
						wirings,
						features,
						servers,
						hosts
					}),
					"application/json; charset=utf-8"
				);
			case "/api/preview": {
				if (req.method !== "POST") break;
				const body = await readBody(req);
				const { files, options, notes } = await compose(body);
				return send(
					res,
					200,
					JSON.stringify({
						options,
						notes,
						blocked: incompatibilities(options),
						files: Object.fromEntries(
							Object.entries(files).map(([name, contents]) => [
								name,
								contents
							])
						)
					}),
					"application/json; charset=utf-8"
				);
			}
			case "/api/download": {
				if (req.method !== "POST") break;
				const body = await readBody(req);
				const { files, options } = await compose(body);
				const { zip } = await import("./zip.js");
				const archive = zip(files);

				res.writeHead(200, {
					"Content-Type": "application/zip",
					"Content-Disposition": `attachment; filename="${options.name}.zip"`,
					"Content-Length": archive.length
				});
				return res.end(archive);
			}
			case "/build":
				return send(res, 200, buildPage({ nav }));
		}

		const slug =
			pathname === "/" ? "index" : pathname.replace(/^\/|\/$/g, "");
		if (await renderDoc(res, slug)) return;

		send(
			res,
			404,
			layout({
				title: "Not found",
				slug: "",
				nav,
				breadcrumb: [],
				toc: [],
				body: `<h1>Not found</h1><p>There is no page at <code>${escapeHtml(pathname)}</code>.</p>`
			})
		);
	} catch (error) {
		const tooLarge = error?.statusCode === 413;
		if (!tooLarge) console.error(error);
		send(
			res,
			tooLarge ? 413 : 500,
			tooLarge
				? "Request body too large"
				: `<h1>Server error</h1><pre>${escapeHtml(String(error?.stack ?? error))}</pre>`,
			tooLarge ? "text/plain; charset=utf-8" : undefined
		);
	}
});

const readBody = req => {
	return new Promise((resolve, reject) => {
		let data = "";
		let size = 0;
		let tooLarge = false;
		req.on("data", chunk => {
			if (tooLarge) return;
			size += chunk.length;
			if (size > 1e6) {
				tooLarge = true;
				data = "";
				reject(
					Object.assign(new Error("Body too large"), {
						statusCode: 413
					})
				);
				return;
			}
			data += chunk;
		});
		req.on("end", () => {
			if (tooLarge) return;
			try {
				resolve(data ? JSON.parse(data) : {});
			} catch {
				resolve({});
			}
		});
		req.on("error", reject);
	});
};

const escapeHtml = value => {
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

// Astro's dev server also defaults to 4321, and a developer reading the docs is
// very likely running a generated project beside them, so walk upward rather
// than dying on EADDRINUSE.
let port = Number(process.env.PORT) || 4321;
let attemptsLeft = 20;

const onListenError = error => {
	if (error.code !== "EADDRINUSE" || attemptsLeft-- <= 0) {
		console.error(`Could not listen on port ${port}: ${error.message}`);
		process.exit(1);
	}
	console.warn(`  Port ${port} is in use, trying ${port + 1}...`);
	port += 1;
	server.listen(port);
};

server.on("error", onListenError);
server.listen(port, () => {
	server.off("error", onListenError);
	console.log(`\n  ProxDocs listening on http://localhost:${port}`);
	console.log("  Documentation route: /\n  Builder route: /build\n");
});
