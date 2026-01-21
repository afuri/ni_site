import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import * as prerenderPlugin from "vite-plugin-prerender";

const isPrerender = process.env.PRERENDER === "true";
const prerender =
  (prerenderPlugin as { prerender?: (...args: unknown[]) => unknown }).prerender ??
  (prerenderPlugin as { default?: (...args: unknown[]) => unknown }).default;

export default defineConfig({
  plugins: [
    react(),
    ...(isPrerender
      ? [
          prerender({
            routes: ["/", "/olympiad"],
            renderer: "@prerenderer/renderer-puppeteer",
            renderAfterTime: 1000
          })
        ]
      : [])
  ],
  server: {
    proxy: {
      "/api/v1": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      "@ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@api": path.resolve(__dirname, "../../packages/api/src"),
      "@utils": path.resolve(__dirname, "../../packages/utils/src")
    }
  }
});
