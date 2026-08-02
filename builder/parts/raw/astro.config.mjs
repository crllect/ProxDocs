import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
//#if tailwind
import tailwindcss from "@tailwindcss/vite";
//#endif

export default defineConfig({
	output: "static",
	outDir: "./dist",
	publicDir: "./public",
	integrations: [preact()],
	vite: {
		//#if requiresIsolation
		server: {
			headers: {
				"Cross-Origin-Opener-Policy": "same-origin",
				"Cross-Origin-Embedder-Policy": "require-corp"
			},
			proxy: {
				//#insert VITE_PROXY_ROUTES
			}
		},
		//#else
		server: {
			proxy: {
				//#insert VITE_PROXY_ROUTES
			}
		},
		//#endif
		//#if tailwind
		plugins: [tailwindcss()]
		//#endif
	}
});
