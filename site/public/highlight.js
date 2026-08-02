const keywords = new Set([
	"async",
	"await",
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"declare",
	"default",
	"delete",
	"do",
	"else",
	"export",
	"extends",
	"false",
	"finally",
	"for",
	"from",
	"function",
	"get",
	"if",
	"implements",
	"import",
	"in",
	"instanceof",
	"interface",
	"let",
	"new",
	"null",
	"of",
	"return",
	"set",
	"static",
	"super",
	"switch",
	"this",
	"throw",
	"true",
	"try",
	"type",
	"typeof",
	"undefined",
	"var",
	"void",
	"while",
	"yield"
]);

const shellCommands = new Set([
	"cd",
	"curl",
	"echo",
	"git",
	"node",
	"npm",
	"npx",
	"pnpm",
	"yarn",
	"bun",
	"bunx",
	"sudo",
	"systemctl",
	"docker",
	"mkdir",
	"rm",
	"cp",
	"tsc",
	"vite",
	"tsx",
	"ls",
	"cat",
	"chmod",
	"journalctl"
]);

const escapeHtml = value =>
	value.replace(
		/[&<>]/g,
		c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]
	);

const wrap = (type, text) =>
	`<span class="tok-${type}">${escapeHtml(text)}</span>`;

const highlightCode = source => {
	let out = "";
	let i = 0;

	while (i < source.length) {
		const rest = source.slice(i);

		const comment =
			/^\/\/[^\n]*/.exec(rest) ?? /^\/\*[\s\S]*?\*\//.exec(rest);
		if (comment) {
			out += wrap("comment", comment[0]);
			i += comment[0].length;
			continue;
		}

		const string =
			/^(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/.exec(
				rest
			);
		if (string) {
			out += wrap("string", string[0]);
			i += string[0].length;
			continue;
		}

		const number = /^\b\d[\d_]*(?:\.\d+)?\b/.exec(rest);
		if (number) {
			out += wrap("number", number[0]);
			i += number[0].length;
			continue;
		}

		const word = /^[A-Za-z_$][\w$]*/.exec(rest);
		if (word) {
			const name = word[0];

			if (keywords.has(name)) out += wrap("keyword", name);
			else if (/^\s*\(/.test(rest.slice(name.length)))
				out += wrap("function", name);
			else out += escapeHtml(name);

			i += name.length;
			continue;
		}

		out += escapeHtml(source[i]);
		i += 1;
	}

	return out;
};

const highlightShell = source => {
	let out = "";
	let i = 0;

	while (i < source.length) {
		const rest = source.slice(i);

		const comment = /^#[^\n]*/.exec(rest);
		if (comment) {
			out += wrap("comment", comment[0]);
			i += comment[0].length;
			continue;
		}

		const string = /^(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/.exec(
			rest
		);
		if (string) {
			out += wrap("string", string[0]);
			i += string[0].length;
			continue;
		}

		const flag = /^\s--?[\w-]+/.exec(rest);
		if (flag) {
			out += flag[0].slice(
				0,
				flag[0].length - flag[0].trimStart().length
			);
			out += wrap("attr", flag[0].trimStart());
			i += flag[0].length;
			continue;
		}

		const word = /^[A-Za-z_][\w./-]*/.exec(rest);
		if (word) {
			const name = word[0];
			out += shellCommands.has(name)
				? wrap("keyword", name)
				: escapeHtml(name);
			i += name.length;
			continue;
		}

		out += escapeHtml(source[i]);
		i += 1;
	}

	return out;
};

const highlightMarkup = source =>
	source
		.replace(
			/[&<>"']/g,
			c =>
				({
					"&": "&amp;",
					"<": "&lt;",
					">": "&gt;",
					'"': "&quot;",
					"'": "&#39;"
				})[c]
		)
		.replace(
			/(&lt;\/?)([\w-]+)/g,
			(whole, bracket, name) => `${bracket}${wrap("tag", name)}`
		)
		.replace(
			/([\w-]+)=(&quot;)([^&]*)\2/g,
			(whole, attr, quote, value) =>
				`${wrap("attr", attr)}=<span class="tok-string">${quote}${value}${quote}</span>`
		);

export const highlight = (source, language = "") => {
	switch (language.toLowerCase()) {
		case "js":
		case "javascript":
		case "ts":
		case "typescript":
		case "jsx":
		case "tsx":
		case "json":
			return highlightCode(source);

		case "bash":
		case "sh":
		case "shell":
			return highlightShell(source);

		case "html":
		case "xml":
			return highlightMarkup(source);

		default:
			return escapeHtml(source);
	}
};
