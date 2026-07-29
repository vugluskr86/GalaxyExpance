import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/GalaxyExpance/",
  build: {
    target: "es2020",
    outDir: "docs",
    rollupOptions: {
      input: {
        game: resolve(import.meta.dirname, "index.html"),
        "landing-sandbox": resolve(import.meta.dirname, "landing-sandbox.html")
      }
    }
  },
});
