import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Inline ExtendScript sources as strings (not React/TSX). */
const hostScriptPlugin = {
  name: "host-script",
  setup(build) {
    build.onResolve({ filter: /^host-script:/ }, (args) => ({
      path: args.path,
      namespace: "host-script",
    }));
    build.onLoad({ filter: /.*/, namespace: "host-script" }, async (args) => {
      const key = args.path.replace("host-script:", "");
      const file =
        key === "premiere"
          ? path.join(__dirname, "src", "scripts", "premiere.jsx")
          : path.join(__dirname, "src", "scripts", "aftereffects.jsx");
      const contents = await fs.readFile(file, "utf8");
      return { contents, loader: "text" };
    });
  },
};

const copyStaticPlugin = {
  name: "copy-static",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) copyStatics();
    });
  },
};

function copyStatics() {
  const dist = path.join(__dirname, "dist");
  mkdirSync(dist, { recursive: true });
  copyFileSync(path.join(__dirname, "manifest.json"), path.join(dist, "manifest.json"));
  copyFileSync(path.join(__dirname, "index.html"), path.join(dist, "index.html"));
}

const buildOptions = {
  entryPoints: [path.join(__dirname, "src", "index.tsx")],
  bundle: true,
  outfile: path.join(__dirname, "dist", "index.js"),
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  logLevel: "info",
  plugins: [hostScriptPlugin, copyStaticPlugin],
  external: ["uxp", "premierepro", "aftereffects"],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
};

const watch = process.argv.includes("--watch");

async function run() {
  mkdirSync(path.join(__dirname, "dist"), { recursive: true });
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.info("[aria-adobe-plugin] esbuild watch — edit src/ to rebuild; load dist/ in UDT.");
  } else {
    await esbuild.build(buildOptions);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
