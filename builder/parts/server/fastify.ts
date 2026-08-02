import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

//#if bootstrap
import { bootstrap } from "@mercuryworkshop/proxy-bootstrap";
//#endif
//#if scramjetManual
import { createRequire } from "node:module";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
//#endif
//#if ultraviolet
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
//#if transportWisp
//#if hasLibcurl
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
//#endif
//#if hasEpoxy
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
//#endif
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
//#endif
//#if transportBare
import { bareModulePath } from "@mercuryworkshop/bare-as-module3";
import { createBareServer } from "@tomphttp/bare-server-node";
//#endif
//#endif

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "{{STATIC_ROOT}}");

//#if bootstrap
const { routeRequest, routeUpgrade } = await bootstrap({
	transport: "{{DEFAULT_TRANSPORT}}"
});
//#endif
//#if transportBare
const bareServer = createBareServer("/bare/");
//#endif

const app = Fastify({
	logger: false,
	serverFactory(handler) {
		const server = http.createServer((req, res) => {
			//#if transportBare
			if (bareServer.shouldRoute(req)) {
				bareServer.routeRequest(req, res);
				return;
			}
			//#endif
			//#if bootstrap
			if (routeRequest(req, res)) return;
			//#endif
			handler(req, res);
		});

		//#if hasWebsockets
		server.on("upgrade", (req, socket, head) => {
			//#if bootstrap
			if (routeUpgrade(req, socket, head)) return;
			socket.end();
			//#else
			//#if transportBare
			if (bareServer.shouldRoute(req)) {
				bareServer.routeUpgrade(req, socket, head);
				return;
			}
			//#endif
			//#if transportWisp
			if (
				new URL(req.url ?? "/", "https://myproxy.com").pathname ===
				"/wisp/"
			) {
				wisp.routeRequest(req, socket, head);
				return;
			}
			//#endif
			socket.end();
			//#endif
		});
		//#endif

		return server;
	}
});

//#if requiresIsolation
app.addHook("onSend", async (_request, reply) => {
	reply.header("Cross-Origin-Opener-Policy", "same-origin");
	reply.header("Cross-Origin-Embedder-Policy", "require-corp");
});
//#endif

//#if scramjetManual
const require = createRequire(import.meta.url);
const dirOf = (specifier: string) => path.dirname(require.resolve(specifier));
//#endif

await app.register(fastifyStatic, {
	root: staticRoot,
	setHeaders(reply, filePath) {
		if (path.basename(filePath).endsWith("sw.js")) {
			reply.header("Cache-Control", "no-cache");
		}
	}
});

//#if scramjetManual
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
//#if hasLibcurl
await app.register(fastifyStatic, {
	root: dirOf("@mercuryworkshop/libcurl-transport"),
	prefix: "/libcurl/",
	decorateReply: false
});
//#endif
//#if hasEpoxy
await app.register(fastifyStatic, {
	root: dirOf("@mercuryworkshop/epoxy-transport"),
	prefix: "/epoxy/",
	decorateReply: false
});
//#endif
//#endif

//#if ultraviolet
await app.register(fastifyStatic, {
	root: uvPath,
	prefix: "/uv/",
	decorateReply: false
});
await app.register(fastifyStatic, {
	root: baremuxPath,
	prefix: "/baremux/",
	decorateReply: false
});
//#if transportWisp
//#if hasLibcurl
await app.register(fastifyStatic, {
	root: libcurlPath,
	prefix: "/libcurl/",
	decorateReply: false
});
//#endif
//#if hasEpoxy
await app.register(fastifyStatic, {
	root: epoxyPath,
	prefix: "/epoxy/",
	decorateReply: false
});
//#endif
//#endif
//#if transportBare
await app.register(fastifyStatic, {
	root: bareModulePath,
	prefix: "/baremod/",
	decorateReply: false
});
//#endif
//#endif

const attempts = 20;
let port = Number(process.env.PORT) || Number("{{PORT}}");

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
console.log(`{{PROJECT_TITLE}} listening on http://localhost:${port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => void app.close().then(() => process.exit(0)));
}
