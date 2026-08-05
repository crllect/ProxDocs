import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createRequire } from "node:module";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { createBareServer } from "@tomphttp/bare-server-node";
import ipaddr from "ipaddr.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "public");
const app = express();
app.use((_req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});
const require = createRequire(import.meta.url);
const dirOf = (specifier) => path.dirname(require.resolve(specifier));
app.use("/scram/", express.static(scramjetPath));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use("/controller/", express.static(dirOf("@mercuryworkshop/scramjet-controller")));
app.use("/baremod/", express.static(dirOf("@mercuryworkshop/bare-transport")));
app.use(express.static(staticRoot, {
    setHeaders(res, filePath) {
        if (path.basename(filePath).endsWith("sw.js")) {
            res.setHeader("Cache-Control", "no-cache");
        }
    }
}));
const bareServer = createBareServer("/bare/", {
    filterRemote(url) {
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        if (ipaddr.isValid(hostname) &&
            ipaddr.parse(hostname).range() !== "unicast") {
            throw new RangeError("Forbidden IP");
        }
    },
    connectionLimiter: {
        maxConnectionsPerIP: 2000,
        windowDuration: 60,
        blockDuration: 10
    }
});
const handleRequest = (req, res) => {
    if (bareServer.shouldRoute(req)) {
        bareServer.routeRequest(req, res);
        return;
    }
    app(req, res);
};
export default handleRequest;
const server = http.createServer(handleRequest);
const listenWithFallback = (target, startPort, attempts = 20) => {
    let port = startPort;
    let left = attempts;
    const onError = (error) => {
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
        console.log(process.env.BACKEND_ONLY
            ? `Backend listening on http://localhost:${port}`
            : `Serverless listening on http://localhost:${port}`);
    });
};
if (!process.env.VERCEL) {
    const port = Number(process.env.PORT) || Number("3000");
    listenWithFallback(server, port);
    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, () => server.close(() => process.exit(0)));
    }
}
