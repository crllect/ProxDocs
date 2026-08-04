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
				: `Astro Preact listening on http://localhost:${port}`
		);
	});
};

	const port = Number(process.env.PORT) || Number("8080");

	listenWithFallback(server, port);

	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => server.close(() => process.exit(0)));
	}
