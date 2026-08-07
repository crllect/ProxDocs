import { highlight } from "./highlight.js";

const stored = localStorage.getItem("pt:theme");
if (stored) document.documentElement.dataset.theme = stored;

document.getElementById("theme-toggle")?.addEventListener("click", () => {
	const current = document.documentElement.dataset.theme ?? "dark";
	const next = current === "dark" ? "light" : "dark";
	document.documentElement.dataset.theme = next;
	localStorage.setItem("pt:theme", next);
});

const toggle = document.getElementById("menu-toggle");
toggle?.addEventListener("click", () => {
	const sidebar = document.getElementById("sidebar");
	const open = sidebar.classList.toggle("sidebar--open");
	toggle.setAttribute("aria-expanded", String(open));
});

const searchForm = document.getElementById("docs-search-form");
const searchInput = document.getElementById("docs-search");
const searchResults = document.getElementById("docs-search-results");
let searchDebounce;
let searchIndex;

const hideSearch = () => {
	searchResults.hidden = true;
	searchResults.replaceChildren();
};

const renderSearchResults = results => {
	if (!results.length) {
		const empty = document.createElement("p");
		empty.textContent = "No matching documentation.";
		searchResults.replaceChildren(empty);
		searchResults.hidden = false;
		return;
	}

	searchResults.replaceChildren(
		...results.map(result => {
			const link = document.createElement("a");
			link.href = `/${result.slug}`;
			const title = document.createElement("strong");
			title.textContent = result.title;
			const snippet = document.createElement("span");
			snippet.textContent = result.snippet;
			link.append(title, snippet);
			return link;
		})
	);
	searchResults.hidden = false;
};

const loadSearchIndex = () => {
	searchIndex ??= fetch("/static/search-index.json")
		.then(response => (response.ok ? response.json() : []))
		.catch(() => []);
	return searchIndex;
};

const matchDocuments = (documents, normalized) =>
	documents
		.map(document => {
			const titleIndex = document.title.toLowerCase().indexOf(normalized);
			const textIndex = document.text.toLowerCase().indexOf(normalized);
			const matchIndex = textIndex >= 0 ? textIndex : 0;
			const start = Math.max(0, matchIndex - 70);
			const end = Math.min(
				document.text.length,
				matchIndex + normalized.length + 110
			);
			return {
				...document,
				titleIndex,
				textIndex,
				snippet: `${start ? "..." : ""}${document.text.slice(start, end)}${end < document.text.length ? "..." : ""}`
			};
		})
		.filter(result => result.titleIndex >= 0 || result.textIndex >= 0)
		.sort((a, b) => {
			const aScore =
				a.titleIndex >= 0 ? a.titleIndex : a.textIndex + 1000;
			const bScore =
				b.titleIndex >= 0 ? b.titleIndex : b.textIndex + 1000;
			return aScore - bScore;
		})
		.slice(0, 8)
		.map(({ title, slug, snippet }) => ({ title, slug, snippet }));

const search = async () => {
	const query = searchInput.value.trim();
	if (query.length < 2) {
		hideSearch();
		return;
	}

	const documents = await loadSearchIndex();
	if (searchInput.value.trim() !== query) return;
	renderSearchResults(matchDocuments(documents, query.toLowerCase()));
};

searchInput?.addEventListener("input", () => {
	clearTimeout(searchDebounce);
	searchDebounce = setTimeout(search, 150);
});
searchInput?.addEventListener("keydown", event => {
	if (event.key === "Escape") {
		hideSearch();
		searchInput.blur();
	}
});
searchForm?.addEventListener("submit", event => {
	event.preventDefault();
	const first = searchResults.querySelector("a");
	if (first) location.href = first.href;
});
document.addEventListener("click", event => {
	if (!event.target.closest(".docs-search")) hideSearch();
});

for (const block of document.querySelectorAll("pre > code")) {
	const pre = block.parentElement;
	const button = document.createElement("button");
	button.className = "copy";
	button.type = "button";
	button.textContent = "Copy";
	button.addEventListener("click", async () => {
		await navigator.clipboard.writeText(block.textContent);
		button.textContent = "Copied";
		setTimeout(() => (button.textContent = "Copy"), 1200);
	});

	if (pre.classList.contains("filepreview")) {
		pre.parentElement.append(button);
		continue;
	}

	const wrapper = document.createElement("div");
	wrapper.className = "codeblock";
	pre.replaceWith(wrapper);
	wrapper.append(pre, button);
}

const tocLinks = [...document.querySelectorAll(".toc a")];
if (tocLinks.length) {
	const targets = tocLinks
		.map(a => document.getElementById(a.getAttribute("href").slice(1)))
		.filter(Boolean);

	const observer = new IntersectionObserver(
		entries => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				for (const link of tocLinks) link.classList.remove("active");
				const match = tocLinks.find(
					a => a.getAttribute("href") === `#${entry.target.id}`
				);
				match?.classList.add("active");
			}
		},
		{ rootMargin: "0px 0px -75% 0px" }
	);

	for (const target of targets) observer.observe(target);
}

const form = document.getElementById("builder");

if (form) {
	const notesEl = document.getElementById("notes");
	const summaryEl = document.getElementById("summary");
	const fileListEl = document.getElementById("filelist");
	const previewEl = document.querySelector("#filepreview code");

	let currentFiles = {};
	let selectedFile = null;
	let debounce;
	let lastOptions = null;

	const readForm = () => {
		const data = new FormData(form);
		return {
			name: data.get("name") || "my-proxy",
			language: data.get("language"),
			packageManager: data.get("packageManager"),
			runtime: data.get("runtime"),
			frontend: data.get("frontend"),
			server: data.get("server"),
			bundler: data.get("bundler"),
			styling: data.get("styling"),
			transports: data.getAll("transport"),
			features: data.getAll("features")
		};
	};

	const applyPreset = options => {
		for (const [key, value] of Object.entries(options)) {
			if (key === "features") continue;
			const input = form.querySelector(
				`[name="${key}"][value="${value}"]`
			);
			if (input) input.checked = true;
		}
		for (const box of form.querySelectorAll('[name="features"]')) {
			box.checked = options.features?.includes(box.value) ?? false;
		}
		for (const box of form.querySelectorAll('[name="transport"]')) {
			box.checked = options.transports?.includes(box.value) ?? false;
		}
		refresh();
	};

	const refresh = async () => {
		const response = await fetch("/api/preview", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(readForm())
		});

		if (!response.ok) return;
		const { files, options, notes, blocked, consequence } =
			await response.json();

		currentFiles = files;
		lastOptions = options;

		for (const [field, reasons] of Object.entries(blocked ?? {})) {
			for (const input of form.querySelectorAll(`[name="${field}"]`)) {
				const reason = reasons[input.value];
				const note = consequence?.[field]?.[input.value];
				const unavailable = Boolean(reason) && !input.checked;

				input.dataset.blockedReason = reason ?? "";
				const label = input.closest(".choice");
				if (!label) continue;

				label.classList.toggle("choice--blocked", unavailable);
				label.classList.toggle(
					"choice--adjusts",
					!unavailable && Boolean(note)
				);

				const title = reason ?? note;
				if (title) label.title = title;
				else label.removeAttribute("title");
			}
		}

		for (const [key, value] of Object.entries(options)) {
			if (key === "features") continue;
			const input = form.querySelector(
				`[name="${key}"][value="${value}"]`
			);
			if (input) input.checked = true;
		}
		for (const box of form.querySelectorAll('[name="features"]')) {
			box.checked = options.features.includes(box.value);
		}
		for (const box of form.querySelectorAll('[name="transport"]')) {
			box.checked = options.transports.includes(box.value);
		}

		notesEl.hidden = notes.length === 0;
		notesEl.innerHTML = notes.length
			? `<h3>Adjustments</h3><ul>${notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
			: "";

		const names = Object.keys(files).sort();
		summaryEl.textContent =
			`${names.length} files · ${options.language.toUpperCase()} · ${options.runtime} · ` +
			`${options.server} · ${options.bundler} · ${options.styling} · ` +
			`${options.frontend} · ${options.engine} (${options.transports.join(" + ")}) · ` +
			`${options.features.length ? options.features.join(", ") : "no extra features"}`;

		fileListEl.replaceChildren(
			...names.map(name => {
				const li = document.createElement("li");
				const button = document.createElement("button");
				button.type = "button";
				button.textContent = name;
				button.className = name === selectedFile ? "active" : "";
				button.addEventListener("click", () => {
					selectedFile = name;
					showFile(name);
					for (const other of fileListEl.querySelectorAll("button")) {
						other.classList.toggle(
							"active",
							other.textContent === name
						);
					}
				});
				li.append(button);
				return li;
			})
		);

		if (!selectedFile || !files[selectedFile]) {
			selectedFile =
				names.find(n => /engine\.(ts|js)$/.test(n)) ?? names[0];
			fileListEl
				.querySelector(`button`)
				?.classList.toggle(
					"active",
					fileListEl.querySelector("button")?.textContent ===
						selectedFile
				);
		}
		showFile(selectedFile);
	};

	const showFile = name => {
		const base = name.split("/").pop() ?? name;
		const language = base.includes(".")
			? base.split(".").pop()
			: base.toLowerCase();

		previewEl.innerHTML = highlight(currentFiles[name] ?? "", language);
	};

	form.addEventListener("input", event => {
		const input = event.target;

		if (input.name === "transport" && !input.checked) {
			const left = form.querySelectorAll(
				'[name="transport"]:checked'
			).length;
			if (left === 0) {
				input.checked = true;
				alert(
					"A proxy needs at least one transport. Pick another one before removing this."
				);
				return;
			}
		}

		const reason = input.dataset?.blockedReason;
		if (reason && input.checked) {
			if (input.type === "radio") {
				const previous = lastOptions?.[input.name];
				const restore = form.querySelector(
					`[name="${input.name}"][value="${previous}"]`
				);
				if (restore) restore.checked = true;
				else input.checked = false;
			} else {
				input.checked = false;
			}
			alert(reason);
			return;
		}

		clearTimeout(debounce);
		debounce = setTimeout(refresh, 150);
	});

	const setAllFeatures = checked => {
		for (const box of form.querySelectorAll('[name="features"]')) {
			if (!box.dataset.blockedReason) box.checked = checked;
		}
		refresh();
	};

	document
		.querySelector("#features-all")
		?.addEventListener("click", () => setAllFeatures(true));
	document
		.querySelector("#features-none")
		?.addEventListener("click", () => setAllFeatures(false));

	for (const button of document.querySelectorAll("[data-preset]")) {
		button.addEventListener("click", async () => {
			const response = await fetch("/static/options.json");
			const { presets } = await response.json();
			const preset = presets[button.dataset.preset];
			if (!preset) return;
			form.querySelector('[name="name"]').value =
				button.dataset.preset === "barebones"
					? "my-proxy"
					: `my-${button.dataset.preset}-proxy`;
			applyPreset(preset.options);
			for (const other of document.querySelectorAll("[data-preset]")) {
				other.classList.toggle("preset--active", other === button);
			}
		});
	}

	document.getElementById("download").addEventListener("click", async () => {
		const response = await fetch("/api/download", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(readForm())
		});
		if (!response.ok) return;

		const blob = await response.blob();
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${readForm().name}.zip`;
		link.click();
		URL.revokeObjectURL(url);
	});

	refresh();
}

const escapeHtml = value => {
	return String(value).replace(
		/[&<>"']/g,
		c =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;"
			})[c]
	);
};
