let typescript;

const loadTypeScript = () => {
	typescript ??= (async () => {
		globalThis.__filename ??= "/typescript.js";
		globalThis.__dirname ??= "/";

		const module = await import("typescript");
		return module.default ?? module;
	})();
	return typescript;
};

export const toJavaScript = async (source, filename = "part.ts") => {
	const ts = await loadTypeScript();

	const result = ts.transpileModule(source, {
		fileName: filename,
		reportDiagnostics: true,
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ESNext,
			verbatimModuleSyntax: true,
			erasableSyntaxOnly: true
		}
	});

	const error = result.diagnostics?.find(
		diagnostic => diagnostic.category === ts.DiagnosticCategory.Error
	);
	if (error) {
		throw new Error(
			`${filename}: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`
		);
	}

	return result.outputText.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
};

export const rewriteImportExtensions = (code, extension) => {
	return code.replace(
		/(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.\.?\/[^"']+?)\.ts\2/g,
		(whole, prefix, quote, path) =>
			`${prefix}${quote}${path}.${extension}${quote}`
	);
};
