import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { bareModulePath } from "@mercuryworkshop/bare-as-module3";
import { createBareServer } from "@tomphttp/bare-server-node";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "public");
const app = express();
app.use("/uv/", express.static(uvPath));
app.use("/baremux/", express.static(baremuxPath));
app.use("/baremod/", express.static(bareModulePath));
app.use(express.static(staticRoot, {
    setHeaders(res, filePath) {
        if (path.basename(filePath).endsWith("sw.js")) {
            res.setHeader("Cache-Control", "no-cache");
        }
    }
}));
const bareServer = createBareServer("/bare/");
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
        console.log(`Ultraviolet Vercel listening on http://localhost:${port}`);
    });
};
if (!process.env.VERCEL) {
    const port = Number(process.env.PORT) || Number("3000");
    listenWithFallback(server, port);
    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, () => server.close(() => process.exit(0)));
    }
}
