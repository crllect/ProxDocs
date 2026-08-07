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

const highlightCode = (source, jsx = false) => {
	let out = "";
	let i = 0;
	let previous = "";
	let inTag = false;

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
			previous = string[0].slice(-1);
			i += string[0].length;
			continue;
		}

		const number = /^\b\d[\d_]*(?:\.\d+)?\b/.exec(rest);
		if (number) {
			out += wrap("number", number[0]);
			previous = number[0].slice(-1);
			i += number[0].length;
			continue;
		}

		if (jsx && !/[\w$)\]]/.test(previous)) {
			const element = /^<\/?([A-Za-z][\w.:-]*)/.exec(rest);
			if (element) {
				out +=
					escapeHtml(element[0].slice(0, -element[1].length)) +
					wrap("tag", element[1]);
				previous = ">";
				inTag = true;
				i += element[0].length;
				continue;
			}
		}

		const word = (
			jsx && inTag ? /^[A-Za-z_$][\w$-]*/ : /^[A-Za-z_$][\w$]*/
		).exec(rest);
		if (word) {
			const name = word[0];
			const after = rest.slice(name.length);

			if (jsx && inTag && /^\s*=/.test(after)) out += wrap("attr", name);
			else if (keywords.has(name)) out += wrap("keyword", name);
			else if (/^\s*\(/.test(after)) out += wrap("function", name);
			else out += escapeHtml(name);

			previous = name.slice(-1);
			i += name.length;
			continue;
		}

		const character = source[i];
		if (character === ">") inTag = false;
		if (!/\s/.test(character)) previous = character;

		out += escapeHtml(character);
		i += 1;
	}

	return out;
};

const highlightJson = source => {
	let out = "";
	let i = 0;

	while (i < source.length) {
		const rest = source.slice(i);

		const string = /^"(?:[^"\\\n]|\\.)*"/.exec(rest);
		if (string) {
			const isKey = /^\s*:/.test(rest.slice(string[0].length));
			out += wrap(isKey ? "attr" : "string", string[0]);
			i += string[0].length;
			continue;
		}

		const number = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(rest);
		if (number) {
			out += wrap("number", number[0]);
			i += number[0].length;
			continue;
		}

		const literal = /^(?:true|false|null)\b/.exec(rest);
		if (literal) {
			out += wrap("keyword", literal[0]);
			i += literal[0].length;
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

const highlightCss = source => {
	const inPrelude = rest => /^[^{};]*\{/.test(rest);

	let out = "";
	let i = 0;
	let parens = 0;

	while (i < source.length) {
		const rest = source.slice(i);

		const comment =
			/^\/\*[\s\S]*?\*\//.exec(rest) ?? /^\/\/[^\n]*/.exec(rest);
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

		const variable = /^\$[\w-]+/.exec(rest);
		if (variable) {
			out += wrap("attr", variable[0]);
			i += variable[0].length;
			continue;
		}

		const atRule = /^@[\w-]+/.exec(rest);
		if (atRule) {
			out += wrap("keyword", atRule[0]);
			i += atRule[0].length;
			continue;
		}

		const bang = /^!\s*[\w-]+/.exec(rest);
		if (bang) {
			out += wrap("keyword", bang[0]);
			i += bang[0].length;
			continue;
		}

		const fn = /^[\w-]+(?=\()/.exec(rest);
		if (fn) {
			out += wrap("function", fn[0]);
			i += fn[0].length;
			continue;
		}

		const number = /^-?(?:\d+\.?\d*|\.\d+)(?:[a-z]+|%)?/i.exec(rest);
		if (number) {
			out += wrap("number", number[0]);
			i += number[0].length;
			continue;
		}

		const declaration = /^[\w-]+(?=\s*:)/.exec(rest);
		if (declaration && (parens > 0 || !inPrelude(rest))) {
			out += wrap("attr", declaration[0]);
			i += declaration[0].length;
			continue;
		}

		if (parens === 0 && inPrelude(rest)) {
			const selector = /^(?:[.#&][\w-]*|::?[\w-]+|\[[^\]\n]*\])/.exec(
				rest
			);
			if (selector) {
				out += wrap("attr", selector[0]);
				i += selector[0].length;
				continue;
			}

			const element = /^[\w-]+/.exec(rest);
			if (element) {
				out += wrap("tag", element[0]);
				i += element[0].length;
				continue;
			}
		}

		const hex = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.exec(rest);
		if (hex) {
			out += wrap("number", hex[0]);
			i += hex[0].length;
			continue;
		}

		const character = source[i];
		if (character === "(") parens += 1;
		if (character === ")") parens = Math.max(0, parens - 1);

		out += escapeHtml(character);
		i += 1;
	}

	return out;
};

const highlightMarkdownInline = source => {
	let out = "";
	let i = 0;

	while (i < source.length) {
		const rest = source.slice(i);

		const code = /^(`+)[^\n]*?\1/.exec(rest);
		if (code) {
			out += wrap("string", code[0]);
			i += code[0].length;
			continue;
		}

		const link = /^(!?\[)([^\]\n]*)(\]\()([^)\s]*)([^)\n]*)(\))/.exec(rest);
		if (link) {
			out +=
				escapeHtml(link[1]) +
				wrap("function", link[2]) +
				escapeHtml(link[3]) +
				wrap("attr", link[4]) +
				escapeHtml(link[5]) +
				escapeHtml(link[6]);
			i += link[0].length;
			continue;
		}

		const strong = /^(\*\*|__)(?=\S)[\s\S]*?\S\1/.exec(rest);
		if (strong) {
			out += wrap("tag", strong[0]);
			i += strong[0].length;
			continue;
		}

		const emphasis = /^([*_])(?=\S)[^*_\n]*\S\1/.exec(rest);
		if (emphasis) {
			out += wrap("tag", emphasis[0]);
			i += emphasis[0].length;
			continue;
		}

		const autolink = /^<https?:\/\/[^>\s]+>/.exec(rest);
		if (autolink) {
			out += wrap("attr", autolink[0]);
			i += autolink[0].length;
			continue;
		}

		out += escapeHtml(source[i]);
		i += 1;
	}

	return out;
};

const highlightMarkdown = source => {
	let inFence = false;

	return source
		.split("\n")
		.map(line => {
			if (/^\s*(?:```|~~~)/.test(line)) {
				inFence = !inFence;
				return wrap("comment", line);
			}

			if (inFence) return escapeHtml(line);

			if (/^\s{0,3}#{1,6}(?:\s|$)/.test(line))
				return wrap("keyword", line);

			if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,}|={3,})\s*$/.test(line))
				return wrap("keyword", line);

			const quote = /^(\s{0,3}>+\s?)/.exec(line);
			if (quote)
				return (
					wrap("comment", quote[1]) +
					highlightMarkdownInline(line.slice(quote[1].length))
				);

			const list = /^(\s*(?:[-*+]|\d+[.)])\s+)/.exec(line);
			if (list)
				return (
					wrap("keyword", list[1]) +
					highlightMarkdownInline(line.slice(list[1].length))
				);

			return highlightMarkdownInline(line);
		})
		.join("\n");
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

const highlightAstro = source => {
	const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source);
	if (!frontmatter) return highlightMarkup(source);

	return (
		wrap("comment", "---\n") +
		highlightCode(frontmatter[1], true) +
		wrap("comment", "\n---") +
		highlightMarkup(source.slice(frontmatter[0].length))
	);
};

const highlightYaml = source =>
	source
		.split("\n")
		.map(line => {
			const comment = /^(\s*)(#.*)$/.exec(line);
			if (comment) return comment[1] + wrap("comment", comment[2]);

			const key = /^(\s*)(-\s+)?([\w.$-]+)(:)(\s*)([\s\S]*?)(\s*)$/.exec(
				line
			);
			if (!key) return escapeHtml(line);

			const value = key[6];
			let rendered = escapeHtml(value);
			if (/^(?:"[^"]*"|'[^']*')$/.test(value))
				rendered = wrap("string", value);
			else if (/^-?\d+(?:\.\d+)?$/.test(value))
				rendered = wrap("number", value);
			else if (/^(?:true|false|null|yes|no|on|off)$/i.test(value))
				rendered = wrap("keyword", value);

			return (
				key[1] +
				(key[2] ? wrap("keyword", key[2]) : "") +
				wrap("attr", key[3]) +
				key[4] +
				key[5] +
				rendered +
				key[7]
			);
		})
		.join("\n");

const highlightConfig = source =>
	source
		.split("\n")
		.map(line => {
			const comment = /^(\s*)([#;].*)$/.exec(line);
			if (comment) return comment[1] + wrap("comment", comment[2]);

			const section = /^(\s*)(\[[^\]]*\])(\s*)$/.exec(line);
			if (section)
				return section[1] + wrap("tag", section[2]) + section[3];

			const setting = /^(\s*)([\w.$-]+)(\s*=\s*)([\s\S]*)$/.exec(line);
			if (!setting) return escapeHtml(line);

			const value = setting[4];
			const quoted = /^"[^"]*"|^'[^']*'/.test(value);
			const number = /^-?\d+(?:\.\d+)?$/.test(value);
			const literal = /^(?:true|false)$/i.test(value);

			let rendered = escapeHtml(value);
			if (quoted) rendered = wrap("string", value);
			else if (number) rendered = wrap("number", value);
			else if (literal) rendered = wrap("keyword", value);

			return (
				setting[1] + wrap("attr", setting[2]) + setting[3] + rendered
			);
		})
		.join("\n");

const highlightDirective = source => {
	let out = "";
	let i = 0;
	let atLineStart = true;

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
			atLineStart = false;
			i += string[0].length;
			continue;
		}

		const variable = /^\$[\w{}]+/.exec(rest);
		if (variable) {
			out += wrap("attr", variable[0]);
			atLineStart = false;
			i += variable[0].length;
			continue;
		}

		const number = /^\b\d+(?:\.\d+)*[a-z%]*\b/i.exec(rest);
		if (number) {
			out += wrap("number", number[0]);
			atLineStart = false;
			i += number[0].length;
			continue;
		}

		const word = /^[A-Za-z_][\w.-]*/.exec(rest);
		if (word) {
			out += atLineStart ? wrap("keyword", word[0]) : escapeHtml(word[0]);
			atLineStart = false;
			i += word[0].length;
			continue;
		}

		const character = source[i];
		if (character === "\n" || character === "{" || character === ";")
			atLineStart = true;

		out += escapeHtml(character);
		i += 1;
	}

	return out;
};

const highlightDockerfile = source =>
	source
		.split("\n")
		.map(line => {
			const comment = /^(\s*)(#.*)$/.exec(line);
			if (comment) return comment[1] + wrap("comment", comment[2]);

			const instruction = /^(\s*)([A-Z]+)(\s+)([\s\S]*)$/.exec(line);
			if (!instruction) return highlightShell(line);

			return (
				instruction[1] +
				wrap("keyword", instruction[2]) +
				instruction[3] +
				highlightShell(instruction[4])
			);
		})
		.join("\n");

const highlightHttp = source =>
	source
		.split("\n")
		.map(line => {
			const request = /^([A-Z]+)(\s+)(\S+)(\s+)(HTTP\/[\d.]+)$/.exec(
				line
			);
			if (request)
				return (
					wrap("keyword", request[1]) +
					request[2] +
					wrap("string", request[3]) +
					request[4] +
					wrap("tag", request[5])
				);

			const status = /^(HTTP\/[\d.]+)(\s+)(\d{3})([\s\S]*)$/.exec(line);
			if (status)
				return (
					wrap("tag", status[1]) +
					status[2] +
					wrap("number", status[3]) +
					escapeHtml(status[4])
				);

			const header = /^([\w-]+)(:\s*)([\s\S]*)$/.exec(line);
			if (header)
				return (
					wrap("attr", header[1]) + header[2] + escapeHtml(header[3])
				);

			return escapeHtml(line);
		})
		.join("\n");

export const highlight = (source, language = "") => {
	switch (language.toLowerCase()) {
		case "js":
		case "javascript":
		case "mjs":
		case "cjs":
		case "ts":
		case "typescript":
		case "mts":
		case "cts":
			return highlightCode(source);

		case "jsx":
		case "tsx":
		case "react":
			return highlightCode(source, true);

		case "json":
		case "jsonc":
			return highlightJson(source);

		case "bash":
		case "sh":
		case "shell":
		case "zsh":
		case "console":
			return highlightShell(source);

		case "html":
		case "xml":
		case "svg":
		case "vue":
		case "svelte":
			return highlightMarkup(source);

		case "astro":
			return highlightAstro(source);

		case "css":
		case "scss":
		case "sass":
		case "less":
			return highlightCss(source);

		case "md":
		case "markdown":
			return highlightMarkdown(source);

		case "yaml":
		case "yml":
			return highlightYaml(source);

		case "ini":
		case "toml":
		case "conf":
		case "env":
		case "properties":
		case "editorconfig":
		case "gitignore":
		case "npmrc":
			return highlightConfig(source);

		case "nginx":
		case "caddyfile":
			return highlightDirective(source);

		case "dockerfile":
			return highlightDockerfile(source);

		case "http":
			return highlightHttp(source);

		default:
			return escapeHtml(source);
	}
};
