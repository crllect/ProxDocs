importScripts("/controller/controller.sw.js");

(() => {
	const warn = console.warn.bind(console);
	const error = console.error.bind(console);
	const noop = () => {};

	self.console = {
		...console,
		log: noop,
		info: noop,
		debug: noop,
		trace: noop,
		dir: noop,
		table: noop,
		group: noop,
		groupEnd: noop,
		groupCollapsed: noop,
		time: noop,
		timeEnd: noop,
		warn,
		error
	};
})();

const shellCachePrefix = "everything-shell-";
const shellCache = shellCachePrefix + "v1";
const runtimeRoots = [
	"/scram/",
	"/controller/",
	"/utils/",
	"/libcurl/",
	"/epoxy/",
	"/baremod/",
	"/bare/",
	"/wisp/"
];

const isUnderRoot = (pathname, root) =>
	pathname === root.slice(0, -1) || pathname.startsWith(root);

const isShellRequest = request => {
	if (request.method !== "GET") return false;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return false;
	if (url.search) return false;
	if (location.hostname === "localhost" || location.hostname === "127.0.0.1")
		return false;
	if (url.pathname === "/sw.js") return false;
	if (runtimeRoots.some(root => isUnderRoot(url.pathname, root)))
		return false;

	return true;
};

const shellResponse = async request => {
	const cache = await caches.open(shellCache);
	const cached = await cache.match(request);

	const network = fetch(request)
		.then(response => {
			if (response.ok) cache.put(request, response.clone());
			return response;
		})
		.catch(() => cached ?? Response.error());

	return cached ?? network;
};

self.addEventListener("fetch", event => {
	if ($scramjetController.shouldRoute(event)) {
		event.respondWith($scramjetController.route(event));
		return;
	}

	if (isShellRequest(event.request)) {
		event.respondWith(shellResponse(event.request));
	}
});

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event =>
	event.waitUntil(
		caches
			.keys()
			.then(keys =>
				Promise.all(
					keys
						.filter(
							key =>
								key.startsWith(shellCachePrefix) &&
								key !== shellCache
						)
						.map(key => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	)
);
