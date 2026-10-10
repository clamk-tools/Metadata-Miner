// The Python side of the page: Pyodide in a Web Worker, running the engine (py/engine.py) behind py/glue.py. The page
// talks to it through client.ts.
import { loadPyodide, version } from "pyodide";

import engineSource from "../../py/engine.py?raw";
import glueSource from "../../py/glue.py?raw";
import type { FromWorker, ToWorker } from "./contract";

// The Python runtime itself is served with the page (vite.config.ts puts the `pyodide` package's files in
// pyodide/<version>/), beside the folder this script is in: assets/ once built, src/ on the dev server. The script's
// own address is used, not the worker's: the worker is started from a blob (client.ts).
const INDEX_URL = new URL(/* @vite-ignore */ `../pyodide/${version}/`, import.meta.url).href;
const ROOT = "/ezregex";

interface Glue {
  set_names(namesJson: string): number;
  run(requestJson: string): string;
}

const post = (message: FromWorker) => self.postMessage(message);
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Python is WebAssembly, and a browser may refuse to run any here: one too old for the word that allows it in the
// page's policy (vite.config.ts), or one with WebAssembly turned off. Compiling the smallest module there is (its
// header) tells, before 6 MB are downloaded for nothing. Trying again cannot help, so the page is told which it is.
class Refused extends Error {}
function checkWebAssembly() {
  try {
    new WebAssembly.Module(new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
  } catch (e) {
    throw new Refused(reason(e));
  }
}

async function start(): Promise<Glue> {
  checkWebAssembly();
  const pyodide = await loadPyodide({ indexURL: INDEX_URL });
  pyodide.FS.mkdirTree(ROOT);
  pyodide.FS.writeFile(`${ROOT}/engine.py`, engineSource);
  pyodide.FS.writeFile(`${ROOT}/glue.py`, glueSource);
  pyodide.runPython(`import sys\nsys.path.insert(0, "${ROOT}")`);
  return pyodide.pyimport("glue") as unknown as Glue;
}

const glue = start();
glue.then(
  () => post({ type: "ready" }),
  (e) => post({ type: "failed", error: reason(e), refused: e instanceof Refused }),
);

async function handle(message: ToWorker) {
  const { id } = message;
  try {
    const python = await glue;
    if (message.type === "setNames") {
      post({ type: "reply", id, ok: true, result: python.set_names(JSON.stringify(message.names)) });
      return;
    }
    const reply = JSON.parse(python.run(JSON.stringify(message.request)));
    if (reply.ok) post({ type: "reply", id, ok: true, result: reply.answer });
    else post({ type: "reply", id, ok: false, error: reply.error, unexpected: !!reply.unexpected });
  } catch (e) {
    post({ type: "reply", id, ok: false, error: reason(e), unexpected: true });
  }
}

// One at a time, in the order they were sent: a request never runs before the names it is about have arrived.
let queue: Promise<void> = Promise.resolve();
self.addEventListener("message", (event: MessageEvent<ToWorker>) => {
  queue = queue.then(() => handle(event.data));
});
