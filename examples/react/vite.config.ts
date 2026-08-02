import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [
		react(),
	],

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

	build: {
		outDir: "dist",
		emptyOutDir: true,
		sourcemap: true
	},

	publicDir: "public"
});
