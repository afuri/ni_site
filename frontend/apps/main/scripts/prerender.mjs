import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

if (process.env.PRERENDER !== "true") {
  process.exit(0);
}

const require = createRequire(import.meta.url);
const PrerendererModule = require("@prerenderer/prerenderer");
const RendererModule = require("@prerenderer/renderer-puppeteer");
const Prerenderer = PrerendererModule.default ?? PrerendererModule;
const PuppeteerRenderer = RendererModule.default ?? RendererModule;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(__dirname, "..", "dist");

const prerenderer = new Prerenderer({
  staticDir,
  routes: ["/", "/olympiad"],
  renderer: new PuppeteerRenderer({
    renderAfterTime: 1000
  })
});

prerenderer
  .renderRoutes()
  .then(() => prerenderer.destroy())
  .catch((error) => {
    console.error("prerender_failed", error);
    return prerenderer
      .destroy()
      .catch(() => {})
      .finally(() => process.exit(1));
  });
