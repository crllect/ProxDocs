const directive =
	/^[ \t]*(?:\/\/|\/\*|\{\/\*|<!--|#)\s*#(if|else|endif)\b[ \t]*([^\r\n*>-]*?)\s*(?:\*\/\}?|-->)?[ \t]*$/;
const insertion =
	/^([ \t]*)(?:\/\/|\/\*|<!--|#)\s*#insert\s+(\w+)\s*(?:\*\/|-->)?[ \t]*$/;

export const render = (source, test, vars = {}) => {
	const out = [];
	const stack = [];
	let keeping = true;

	for (const line of source.split("\n")) {
		const insertMatch = insertion.exec(line);
		if (insertMatch) {
			if (keeping) {
				const [, indent, name] = insertMatch;
				const value = Object.hasOwn(vars, name)
					? String(vars[name])
					: "";
				out.push(
					...value
						.split("\n")
						.map(insertedLine => indent + insertedLine)
				);
			}
			continue;
		}

		const match = directive.exec(line);

		if (match) {
			const [, kind, rawArg] = match;

			switch (kind) {
				case "if": {
					const negated = rawArg.startsWith("!");
					const flag = (negated ? rawArg.slice(1) : rawArg).trim();
					const value = negated ? !test(flag) : test(flag);
					stack.push({ parentKeeping: keeping, taken: value });
					keeping = keeping && value;
					continue;
				}
				case "else": {
					const frame = stack[stack.length - 1];
					if (!frame) throw new Error("#else without #if");
					keeping = frame.parentKeeping && !frame.taken;
					frame.taken = true;
					continue;
				}
				case "endif": {
					const frame = stack.pop();
					if (!frame) throw new Error("#endif without #if");
					keeping = frame.parentKeeping;
					continue;
				}
			}
		}

		if (keeping) out.push(line);
	}

	if (stack.length) throw new Error("unterminated #if block");

	return out
		.join("\n")
		.replace(/\{\{(\w+)\}\}/g, (whole, name) =>
			Object.hasOwn(vars, name) ? String(vars[name]) : whole
		)
		.replace(/\n{3,}/g, "\n\n");
};
