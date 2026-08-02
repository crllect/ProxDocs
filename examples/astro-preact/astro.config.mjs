import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";

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
				"/scram": "http://127.0.0.1:8080",
				"/utils": "http://127.0.0.1:8080",
				"/controller": "http://127.0.0.1:8080",
				"/libcurl": "http://127.0.0.1:8080",
				"/wisp": { target: "ws://127.0.0.1:8080", ws: true }
			}
		},
	}
});
