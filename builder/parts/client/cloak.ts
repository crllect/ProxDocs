import * as settings from "./settings.ts";

const originalTitle = document.title;
const originalIcon =
	document.querySelector<HTMLLinkElement>("link[rel~='icon']")?.href ?? "";

const resolve = () => {
	const preset = settings.cloakPresets.find(
		p => p.id === settings.get("cloakPreset")
	);

	return !preset || preset.id === "custom"
		? {
				title: settings.get("cloakTitle"),
				favicon: settings.get("cloakFavicon")
			}
		: { title: preset.title, favicon: preset.favicon };
};

const applyTo = (target: Document, title: string, favicon: string) => {
	target.title = title || originalTitle;
	const existing = target.querySelector<HTMLLinkElement>("link[rel~='icon']");
	if (!favicon && !originalIcon) {
		existing?.remove();
		return;
	}

	const link = existing ?? target.createElement("link");
	link.rel = "icon";
	link.href = favicon || originalIcon;
	if (!existing) target.head.append(link);
};

export const applyCloak = () => {
	const { title, favicon } = resolve();
	applyTo(document, title, favicon);

	try {
		if (parent !== window) applyTo(parent.document, title, favicon);
	} catch {}
};
