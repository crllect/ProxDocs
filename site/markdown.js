import { marked } from "marked";
import path from "node:path";
import { highlight } from "./public/highlight.js";

export const markdownToHtml = (source, sourceFile = "index.md") => {
	const toc = [];
	const seen = new Map();
	let title = null;

	// parseInline returns HTML, so headings arrive with their entities already
	// escaped. Decode the five marked emits to recover real text: otherwise
	// "Scramjet's" slugs as "scramjet39s", and callers that escape again render
	// a literal &#39;. &amp; goes last so "&lt;" written as text survives.
	const decodeEntities = value =>
		value
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#0*39;/g, "'")
			.replace(/&#x0*27;/gi, "'")
			.replace(/&amp;/g, "&");

	const slugify = text => {
		const base =
			text
				.toLowerCase()
				.replace(/`/g, "")
				.replace(/[^\w\s-]/g, "")
				.trim()
				.replace(/\s+/g, "-") || "section";

		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return count ? `${base}-${count}` : base;
	};

	const renderer = new marked.Renderer();

	renderer.heading = function ({ tokens, depth }) {
		const text = this.parser.parseInline(tokens);
		const plain = decodeEntities(text.replace(/<[^>]+>/g, ""));

		if (depth === 1 && title === null) {
			title = plain;
			return `<h1>${text}</h1>\n`;
		}

		const id = slugify(plain);
		if (depth === 2 || depth === 3) toc.push({ id, text: plain, depth });

		return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${depth}>\n`;
	};

	renderer.link = function ({ href, title: linkTitle, tokens }) {
		const text = this.parser.parseInline(tokens);
		let target = href ?? "";

		const markdownLink = /^([^?#]+\.md)([?#].*)?$/.exec(target);
		if (!/^[a-z]+:|^#|^\/\//i.test(target) && markdownLink) {
			const resolved = path.posix.resolve(
				"/",
				path.posix.dirname(sourceFile),
				markdownLink[1]
			);
			target =
				resolved.replace(/\.md$/, "").replace(/\/index$/, "/") +
				(markdownLink[2] ?? "");
		}

		const attrs = [`href="${target}"`];
		if (linkTitle) attrs.push(`title="${linkTitle}"`);
		if (/^https?:/i.test(target))
			attrs.push('target="_blank" rel="noopener noreferrer"');

		return `<a ${attrs.join(" ")}>${text}</a>`;
	};

	renderer.code = ({ text, lang }) => {
		const language = (lang ?? "").split(/\s/)[0];
		const cls = language ? ` class="lang-${language}"` : "";
		return `<pre><code${cls}>${highlight(text, language)}\n</code></pre>\n`;
	};

	renderer.table = function ({ header, rows }) {
		const cells = (row, tag) =>
			"<tr>" +
			row
				.map(cell => {
					const align = cell.align ? ` align="${cell.align}"` : "";
					return `<${tag}${align}>${this.parser.parseInline(cell.tokens)}</${tag}>`;
				})
				.join("") +
			"</tr>";

		const hasHeader = header.some(
			cell => this.parser.parseInline(cell.tokens).trim() !== ""
		);
		const thead = hasHeader ? `<thead>${cells(header, "th")}</thead>` : "";
		const tbody = rows.map(row => cells(row, "td")).join("");

		return `<table${hasHeader ? "" : ' class="table--headless"'}>${thead}<tbody>${tbody}</tbody></table>\n`;
	};

	const html = marked.parse(source, { renderer, gfm: true, breaks: false });

	return { html, toc, title };
};
