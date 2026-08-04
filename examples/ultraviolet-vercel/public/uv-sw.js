importScripts("/uv/uv.bundle.js");
importScripts("/uv-config.js");
importScripts(__uv$config.sw || "/uv/uv.sw.js");

const uv = new UVServiceWorker();

const shellCache = "ultraviolet-vercel-shell-v1";

const isShellRequest = request => {
	if (request.method !== "GET") return false;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return false;
	if (url.search) return false;
	if (location.hostname === "localhost" || location.hostname === "127.0.0.1")
		return false;
	if (url.pathname === "/uv-sw.js") return false;
	if (url.pathname.startsWith(__uv$config.prefix)) return false;
	if (url.pathname.startsWith("/wisp")) return false;
	if (url.pathname.startsWith("/bare")) return false;

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
	event.respondWith(
		(async () => {
			if (uv.route(event)) {
				return await uv.fetch(event);
			}
			if (isShellRequest(event.request)) {
				return await shellResponse(event.request);
			}
			return await fetch(event.request);
		})()
	);
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
