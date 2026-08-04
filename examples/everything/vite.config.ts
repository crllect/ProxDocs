import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const backendPort = process.env.BACKEND_PORT || "8080";

export default defineConfig({
	plugins: [
		tailwindcss()
	],

	server: {
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp"
		},

		proxy: {
			"/scram": `http://127.0.0.1:${backendPort}`,
			"/utils": `http://127.0.0.1:${backendPort}`,
			"/controller": `http://127.0.0.1:${backendPort}`,
			"/baremod": `http://127.0.0.1:${backendPort}`,
			"/bare": `http://127.0.0.1:${backendPort}`,
			"/libcurl": `http://127.0.0.1:${backendPort}`,
			"/epoxy": `http://127.0.0.1:${backendPort}`,
			"/wisp": { target: `ws://127.0.0.1:${backendPort}`, ws: true }
		}
	},

	build: {
		outDir: "dist",
		emptyOutDir: true,
		sourcemap: true
	},

	publicDir: "public"
});
