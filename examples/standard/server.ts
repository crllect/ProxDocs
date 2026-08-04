import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { createRequire } from "node:module";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "dist");

const app = Fastify({
	logger: false,
	serverFactory(handler) {
		const server = http.createServer((req, res) => {
			handler(req, res);
		});

		server.on("upgrade", (req, socket, head) => {
			if (
				new URL(req.url ?? "/", "https://myproxy.com").pathname ===
				"/wisp/"
			) {
				wisp.routeRequest(req, socket, head);
				return;
			}
			socket.end();
		});

		return server;
	}
});

app.addHook("onSend", async (_request, reply) => {
	reply.header("Cross-Origin-Opener-Policy", "same-origin");
	reply.header("Cross-Origin-Embedder-Policy", "require-corp");
});

const require = createRequire(import.meta.url);
const dirOf = (specifier: string) => path.dirname(require.resolve(specifier));

await app.register(fastifyStatic, {
	root: staticRoot,
	setHeaders(reply, filePath) {
		if (path.basename(filePath).endsWith("sw.js")) {
			reply.header("Cache-Control", "no-cache");
		}
	}
});

await app.register(fastifyStatic, {
	root: scramjetPath,
	prefix: "/scram/",
	decorateReply: false
});
await app.register(fastifyStatic, {
	root: dirOf("@mercuryworkshop/scramjet-utils"),
	prefix: "/utils/",
	decorateReply: false
});
await app.register(fastifyStatic, {
	root: dirOf("@mercuryworkshop/scramjet-controller"),
	prefix: "/controller/",
	decorateReply: false
});
await app.register(fastifyStatic, {
	root: dirOf("@mercuryworkshop/libcurl-transport"),
	prefix: "/libcurl/",
	decorateReply: false
});
await app.register(fastifyStatic, {
	root: dirOf("@mercuryworkshop/epoxy-transport"),
	prefix: "/epoxy/",
	decorateReply: false
});

const attempts = 20;
let port = Number(process.env.PORT) || Number("8080");

for (let attempt = 0; ; attempt++) {
	try {
		await app.listen({ port, host: "0.0.0.0" });
		break;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== "EADDRINUSE" || attempt >= attempts) throw error;
		console.warn(`Port ${port} is in use, trying ${port + 1}...`);
		port += 1;
	}
}

process.send?.({ type: "listening", port });
console.log(
	process.env.BACKEND_ONLY
		? `Backend listening on http://localhost:${port}`
		: `Standard listening on http://localhost:${port}`
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => void app.close().then(() => process.exit(0)));
}
