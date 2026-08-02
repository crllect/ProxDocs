import { compose } from "../../builder/index.js";
import { zip } from "../../site/zip.js";
import { readPart } from "../_generated/parts.js";

export const onRequestPost = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	try {
		const { files, options } = await compose(body, { readPart });
		const archive = zip(files);

		return new Response(archive, {
			headers: {
				"content-type": "application/zip",
				"content-disposition": `attachment; filename="${options.name}.zip"`,
				"content-length": String(archive.length)
			}
		});
	} catch (error) {
		return new Response(String(error?.message ?? error), {
			status: 400,
			headers: { "content-type": "text/plain; charset=utf-8" }
		});
	}
};
