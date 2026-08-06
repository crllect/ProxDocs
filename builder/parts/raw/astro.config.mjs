import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
//#if tailwind
import tailwindcss from "@tailwindcss/vite";
//#endif

const backendPort = process.env.BACKEND_PORT || "{{PORT}}";

export default defineConfig({
	output: "static",
	outDir: "./dist",
	publicDir: "./public",
	integrations: [preact()],
	vite: {
		//#if tailwind
		plugins: [tailwindcss()],
		//#endif
		server: {
			//#if requiresIsolation
			headers: {
				"Cross-Origin-Opener-Policy": "same-origin",
				"Cross-Origin-Embedder-Policy": "require-corp"
			},
			//#endif
			proxy: {
				//#insert VITE_PROXY_ROUTES
			}
		}
	}
});
