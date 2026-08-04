importScripts("/controller/controller.sw.js");

const shellCache = "serverless-shell-v1";

const isShellRequest = request => {
	if (request.method !== "GET") return false;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return false;
	if (url.search) return false;
	if (location.hostname === "localhost" || location.hostname === "127.0.0.1")
		return false;
	if (url.pathname === "/sw.js") return false;
	if (url.pathname.startsWith("/wisp")) return false;

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
		.catch(() => cached);

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
						.filter(key => key !== shellCache)
						.map(key => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	)
);
