import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";

const backendPort = process.env.BACKEND_PORT || "8080";

export default defineConfig({
	output: "static",
	outDir: "./dist",
	publicDir: "./public",
	integrations: [preact()],
	vite: {
		server: {
			headers: {
				"Cross-Origin-Opener-Policy": "same-origin",
				"Cross-Origin-Embedder-Policy": "require-corp"
			},
			proxy: {
				"/scram": `http://127.0.0.1:${backendPort}`,
				"/utils": `http://127.0.0.1:${backendPort}`,
				"/controller": `http://127.0.0.1:${backendPort}`,
				"/libcurl": `http://127.0.0.1:${backendPort}`,
				"/wisp": { target: `ws://127.0.0.1:${backendPort}`, ws: true }
			}
		},
	}
});
