import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

//#if bootstrap
import { bootstrap } from "@mercuryworkshop/proxy-bootstrap";
//#endif
//#if scramjetManual
import { createRequire } from "node:module";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
//#if transportWisp
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
//#endif
//#endif
//#if transportBare
import { createBareServer } from "@tomphttp/bare-server-node";
//#endif

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "{{STATIC_ROOT}}");

const app = express();

//#if bootstrap
const { routeRequest, routeUpgrade } = await bootstrap({
	transport: "{{DEFAULT_TRANSPORT}}"
});
//#endif

//#if requiresIsolation
app.use((_req, res, next) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	next();
});
//#endif

//#if bootstrap
app.use((req, res, next) => {
	if (routeRequest(req, res)) return;
	next();
});
//#endif

//#if scramjetManual
const require = createRequire(import.meta.url);
const dirOf = (specifier: string) => path.dirname(require.resolve(specifier));

app.use("/scram/", express.static(scramjetPath));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use(
	"/controller/",
	express.static(dirOf("@mercuryworkshop/scramjet-controller"))
);
//#if hasLibcurl
app.use(
	"/libcurl/",
	express.static(dirOf("@mercuryworkshop/libcurl-transport"))
);
//#endif
//#if hasEpoxy
app.use("/epoxy/", express.static(dirOf("@mercuryworkshop/epoxy-transport")));
//#endif
//#if transportBare
app.use("/baremod/", express.static(dirOf("@mercuryworkshop/bare-transport")));
//#endif
//#endif

app.use(
	express.static(staticRoot, {
		setHeaders(res, filePath) {
			if (path.basename(filePath).endsWith("sw.js")) {
				res.setHeader("Cache-Control", "no-cache");
			}
		}
	})
);

//#if transportBare
const bareServer = createBareServer("/bare/", {
	connectionLimiter: {
		maxConnectionsPerIP: 2000,
		windowDuration: 60,
		blockDuration: 10
	}
});
//#endif

const handleRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
	//#if transportBare
	if (bareServer.shouldRoute(req)) {
		bareServer.routeRequest(req, res);
		return;
	}
	//#endif
	app(req, res);
};

//#if vercel
export default handleRequest;
//#endif
const server = http.createServer(handleRequest);

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
		new URL(req.url ?? "/", `http://${req.headers.host}`).pathname ===
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

const listenWithFallback = (
	target: http.Server,
	startPort: number,
	attempts = 20
) => {
	let port = startPort;
	let left = attempts;

	const onError = (error: NodeJS.ErrnoException) => {
		if (error.code !== "EADDRINUSE" || left-- <= 0) {
			console.error(`Could not listen on port ${port}: ${error.message}`);
			process.exit(1);
		}
		console.warn(`Port ${port} is in use, trying ${port + 1}...`);
		port += 1;
		target.listen(port);
	};

	target.on("error", onError);
	target.listen(port, () => {
		target.off("error", onError);
		process.send?.({ type: "listening", port });
		console.log(
			process.env.BACKEND_ONLY
				? `Backend listening on http://localhost:${port}`
				: `{{PROJECT_TITLE}} listening on http://localhost:${port}`
		);
	});
};

//#if vercel
if (!process.env.VERCEL) {
	//#endif
	const port = Number(process.env.PORT) || Number("{{PORT}}");

	listenWithFallback(server, port);

	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => server.close(() => process.exit(0)));
	}
	//#if vercel
}
//#endif
