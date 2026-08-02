import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { bootstrap } from "@mercuryworkshop/proxy-bootstrap";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "public");
const app = express();
const { routeRequest, routeUpgrade } = await bootstrap({
    transport: "libcurl"
});
app.use((_req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});
app.use((req, res, next) => {
    if (routeRequest(req, res))
        return;
    next();
});
app.use(express.static(staticRoot, {
    setHeaders(res, filePath) {
        if (path.basename(filePath).endsWith("sw.js")) {
            res.setHeader("Cache-Control", "no-cache");
        }
    }
}));
const handleRequest = (req, res) => {
    app(req, res);
};
const server = http.createServer(handleRequest);
server.on("upgrade", (req, socket, head) => {
    if (routeUpgrade(req, socket, head))
        return;
    socket.end();
});
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
        console.log(`Barebones listening on http://localhost:${port}`);
    });
};
const port = Number(process.env.PORT) || Number("8080");
listenWithFallback(server, port);
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
