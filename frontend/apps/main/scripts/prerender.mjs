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

const routes = ["/"];

const prerenderer = new Prerenderer({
  staticDir,
  routes,
  renderer: new PuppeteerRenderer({
    renderAfterTime: 1000
  })
});

const run = async () => {
  if (typeof prerenderer.initialize === "function") {
    await prerenderer.initialize();
  }

  if (prerenderer.renderRoutes.length > 0) {
    await prerenderer.renderRoutes(routes);
  } else {
    await prerenderer.renderRoutes();
  }

  if (typeof prerenderer.destroy === "function") {
    await prerenderer.destroy();
  }
};

run().catch((error) => {
  console.error("prerender_failed", error);
  return (typeof prerenderer.destroy === "function"
    ? prerenderer.destroy().catch(() => {})
    : Promise.resolve()
  ).finally(() => process.exit(1));
});
