import { compose } from "../../builder/index.js";
import { availability } from "../../builder/options.js";
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
		const { blocked, consequence } = availability(options);
		return json({ options, notes, blocked, consequence, files });
	} catch (error) {
		return json({ error: String(error?.message ?? error) }, 400);
	}
};
