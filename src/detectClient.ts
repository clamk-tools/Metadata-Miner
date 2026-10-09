import type { DetectRequest, FromWorker, MetadataDetect, ToWorker } from "./detect-types";
import workerUrl from "./detect.worker.ts?worker&url";

// The worker is started from a one-line script in a blob, which imports the real one. A worker made from a blob is
// held to the page's Content-Security-Policy (vite.config.ts); one made from a file is held only to the headers that
// file came with, and GitHub Pages sets none. So Python, too, can only reach this site. The blob is made when the
// first worker starts, not when this module is read: the module then needs no page to be imported.
let workerBlob: string | undefined;
const workerHref = () => new URL(workerUrl, document.baseURI).href;
function blob(): string {
  workerBlob ??= URL.createObjectURL(new Blob([`import ${JSON.stringify(workerHref())};`], { type: "text/javascript" }));
  return workerBlob;
}

// A release replaces every file of the site, and the worker script's name changes with its content. A page opened
// before a release (a tab the browser restored) still asks for the old script: it is gone, and only a reload brings
// the page and its scripts back in step. A dropped connection, by contrast, answers nothing at all.
async function outdated(): Promise<boolean> {
  try {
    return (await fetch(workerHref(), { method: "HEAD", cache: "no-store" })).status === 404;
  } catch {
    return false;
  }
}

// Python takes a few seconds to arrive on a first visit, and may not arrive at all. `refused`: the browser will not
// run it, so trying again cannot help. `outdated`: a newer release replaced this page's files, so only a reload
// helps. Otherwise it did not arrive (the connection dropped), and trying again may.
export type EngineStatus =
  | { state: "loading" }
  | { state: "ready" }
  | { state: "failed"; error: string; refused: boolean; outdated: boolean };

// A request Python refused. `unexpected` tells a bug (or Python not running) from a problem the user can fix.
export class DetectError extends Error {
  unexpected: boolean;

  constructor(message: string, unexpected: boolean) {
    super(message);
    this.name = "DetectError";
    this.unexpected = unexpected;
  }
}

interface Waiting {
  resolve: (value: number | MetadataDetect) => void;
  reject: (error: DetectError) => void;
}

// The page's side of the Python worker (detect.worker.ts): hand over the names once, then ask for one step of
// Detect at a time. The worker starts loading Python as soon as this is created, so it is usually ready by the time
// the names are.
export class DetectClient {
  private worker: Worker | null = null; // null: the browser refused to start one
  private waiting = new Map<number, Waiting>();
  private nextId = 1;
  private names: string[] | null = null;
  private listeners = new Set<() => void>();
  private current: EngineStatus = { state: "loading" };

  constructor() {
    this.start();
  }

  status = (): EngineStatus => this.current;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The names Detect learns from. They stay in the worker; a request does not carry them. */
  setNames(names: string[]): Promise<number> {
    this.names = names;
    return this.send({ id: this.nextId++, type: "setNames", names }) as Promise<number>;
  }

  detect(request: DetectRequest): Promise<MetadataDetect> {
    return this.send({ id: this.nextId++, type: "detect", request }) as Promise<MetadataDetect>;
  }

  /** Starts Python again after a failure, with the names it had. */
  restart() {
    this.worker?.terminate();
    this.failAll("Python was restarted");
    this.start();
    if (this.names) void this.setNames(this.names).catch(() => undefined);
  }

  private start() {
    this.set({ state: "loading" });
    this.worker = null;
    let worker: Worker;
    try {
      worker = new Worker(blob(), { type: "module" });
    } catch (e) {
      // some browsers throw when their policy refuses the worker; the others send an error event (below)
      this.set({ state: "failed", error: e instanceof Error ? e.message : String(e), refused: true, outdated: false });
      return;
    }
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      if (worker !== this.worker) return; // an answer from a worker that was replaced
      const message = event.data;
      if (message.type === "ready") this.set({ state: "ready" });
      else if (message.type === "failed") void this.fail(worker, message.error, message.refused);
      else this.settle(message);
    };
    worker.onerror = (event) => {
      if (worker !== this.worker) return;
      event.preventDefault();
      this.failAll("Python could not be started");
      void this.fail(worker, event.message || "the worker script could not be loaded", false);
    };
  }

  // The status stays `loading` while the site is asked whether this page is out of date: a moment, once.
  private async fail(worker: Worker, error: string, refused: boolean) {
    const stale = !refused && (await outdated());
    if (worker === this.worker) this.set({ state: "failed", error, refused, outdated: stale });
  }

  private send(message: ToWorker): Promise<number | MetadataDetect> {
    return new Promise((resolve, reject) => {
      if (!this.worker) return reject(new DetectError("Python could not be started", true));
      this.waiting.set(message.id, { resolve, reject });
      this.worker.postMessage(message);
    });
  }

  private settle(message: Extract<FromWorker, { type: "reply" }>) {
    const waiting = this.waiting.get(message.id);
    if (!waiting) return;
    this.waiting.delete(message.id);
    if (message.ok) waiting.resolve(message.result);
    else waiting.reject(new DetectError(message.error, message.unexpected));
  }

  private failAll(why: string) {
    for (const waiting of this.waiting.values()) waiting.reject(new DetectError(why, true));
    this.waiting.clear();
  }

  private set(status: EngineStatus) {
    this.current = status;
    for (const listener of this.listeners) listener();
  }
}
