import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import { createRequire } from "node:module";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "dist");

const app = express();

app.use((_req, res, next) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	next();
});

const require = createRequire(import.meta.url);
const dirOf = (specifier: string) => path.dirname(require.resolve(specifier));

app.use("/scram/", express.static(scramjetPath));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use(
	"/controller/",
	express.static(dirOf("@mercuryworkshop/scramjet-controller"))
);
app.use(
	"/libcurl/",
	express.static(dirOf("@mercuryworkshop/libcurl-transport"))
);

app.use(
	express.static(staticRoot, {
		setHeaders(res, filePath) {
			if (path.basename(filePath).endsWith("sw.js")) {
				res.setHeader("Cache-Control", "no-cache");
			}
		}
	})
);

const handleRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
	app(req, res);
};

const server = http.createServer(handleRequest);

server.on("upgrade", (req, socket, head) => {
	if (new URL(req.url ?? "/", "https://myproxy.com").pathname === "/wisp/") {
		wisp.routeRequest(req, socket, head);
		return;
	}
	socket.end();
});

	const port = Number(process.env.PORT) || Number("8080");

	server.listen(port, () => {
		console.log(`Astro Preact listening on port ${port}`);
	});

	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => server.close(() => process.exit(0)));
	}
