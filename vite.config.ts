import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import react from "@vitejs/plugin-react";
import { version as pyodideVersion } from "pyodide";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// The Python runtime is served with the page, not from a CDN: the four files loadPyodide fetches, taken from the
// `pyodide` package and put in pyodide/<version>/ beside assets/. The worker (src/detect.worker.ts) loads them from
// there. The version is in the address so that a browser never pairs a new worker with the runtime files it kept from
// the release before.
const PYODIDE_FILES: Record<string, string> = {
  "pyodide.asm.mjs": "text/javascript",
  "pyodide.asm.wasm": "application/wasm",
  "python_stdlib.zip": "application/zip",
  "pyodide-lock.json": "application/json",
};

function pyodideRuntime(): Plugin {
  const from = dirname(createRequire(import.meta.url).resolve("pyodide/package.json")); // wherever the package is installed
  const folder = `/${pyodideVersion}/`;
  return {
    name: "pyodide-runtime",
    configureServer(server) {
      server.middlewares.use("/pyodide", (req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        const file = path.slice(folder.length);
        // not `in`: that also says yes to "constructor"
        if (!path.startsWith(folder) || !Object.hasOwn(PYODIDE_FILES, file)) return next();
        res.setHeader("Content-Type", PYODIDE_FILES[file]);
        res.end(readFileSync(join(from, file)));
      });
    },
    generateBundle() {
      for (const file of Object.keys(PYODIDE_FILES)) {
        this.emitFile({ type: "asset", fileName: `pyodide${folder}${file}`, source: readFileSync(join(from, file)) });
      }
    },
  };
}

// What the built page may load, and from where: its own files only. GitHub Pages sets no header, so the policy is a
// <meta> tag, written at build time. No inline script is allowed: the first script is a file (public/boot.js). The
// dev server is left without the policy: its hot reload needs an inline script and a WebSocket.
const POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'", // wasm-unsafe-eval: Pyodide is WebAssembly
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  // The worker starts from a blob, which is what puts it under this policy (src/detectClient.ts). 'self' is for the
  // real worker script, which the blob imports: a browser fetches what a worker imports as a worker script. It also
  // lets a worker start from a file of the site, which would escape the policy: e2e/network.spec.ts fails on one.
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: POLICY }, injectTo: "head-prepend" }],
  };
}

export default defineConfig({
  base: "./", // relative asset paths: the site works under any repository name on GitHub Pages
  appType: "mpa", // one static page, no routes: a path that is not a file is a 404, as on GitHub Pages
  plugins: [react(), pyodideRuntime(), contentSecurityPolicy()],
  // Its own port, and no silent fallback: 5173 is where HC-Flow's dev server runs on the same machine.
  server: { port: 5183, strictPort: true },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["pyodide"] },
  test: { include: ["src/**/*.test.ts"] },
});
