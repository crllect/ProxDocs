import { compose } from "../../builder/index.js";
import { incompatibilities } from "../../builder/options.js";
import { readPart } from "../_generated/parts.js";

const json = (body, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" }
	});

export const onRequestPost = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	try {
		const { files, options, notes } = await compose(body, { readPart });
		return json({
			options,
			notes,
			blocked: incompatibilities(options),
			files
		});
	} catch (error) {
		return json({ error: String(error?.message ?? error) }, 400);
	}
};
