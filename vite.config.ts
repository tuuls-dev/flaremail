import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig({
	root: "frontend",
	plugins: [
		svelte(),
		cloudflare({ configPath: "../wrangler.jsonc", viteEnvironment: { name: "worker" } }),
	],
	server: { port: 5173, strictPort: true },
	build: { outDir: "../dist", emptyOutDir: true },
});
