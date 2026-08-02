import { defineConfig } from "vite";
//#if react
import react from "@vitejs/plugin-react";
//#endif
//#if tailwind
import tailwindcss from "@tailwindcss/vite";
//#endif

export default defineConfig({
	//#if vitePlugins
	plugins: [
		//#if react
		react(),
		//#endif
		//#if tailwind
		tailwindcss()
		//#endif
	],
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
	},

	build: {
		outDir: "dist",
		emptyOutDir: true,
		sourcemap: true
	},

	publicDir: "public"
});
