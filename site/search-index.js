import { readFile } from "node:fs/promises";
import path from "node:path";

import { nav } from "./nav.js";

export const buildSearchIndex = docsDir =>
	Promise.all(
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
