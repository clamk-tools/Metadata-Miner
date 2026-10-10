import { useEffect, useState, useSyncExternalStore } from "react";

import { DetectClient } from "./detectClient";
import { MetadataDetect } from "./MetadataDetect";
import { IMAGE_EXTENSIONS, intake, namesFromText } from "./names";
import type { Intake } from "./names";
import { NamesInput } from "./NamesInput";
import { ThemeSwitch } from "./ThemeSwitch";

const EXTENSIONS = IMAGE_EXTENSIONS.join(" ");

// Created with the page, so Python is loading while the user is still giving the names.
const client = new DetectClient();

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

// The page opens on the names step (NamesInput); once names are given it shows Detect on them (MetadataDetect), and the
// cross of Detect goes back to the names. Around both: the frame every Clamk tool has (rail, header with the name and the theme switch, footer).
export function App() {
  const engine = useSyncExternalStore(client.subscribe, client.status);
  const [result, setResult] = useState<Intake | null>(null);
  const [run, setRun] = useState(0); // a new Detect screen for each set of names
  const [text, setText] = useState(""); // the paste box: kept when Detect is closed

  // The names go to Python here, in the handler, so they are there before the Detect screen asks its first question.
  const load = (names: string[]) => {
    const next = intake(names);
    setResult(next);
    if (next.names.length) {
      client.setNames(next.names).catch(() => undefined); // a failure shows as the engine's state or on the first request
      setRun((n) => n + 1);
    }
  };
  // A file dropped on the page is ignored. Without this, the browser would open it in place of the tool. Dragged text
  // (into the paste box) is not a file, so it still works.
  useEffect(() => {
    const ignore = (e: DragEvent) => {
      if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", ignore);
    window.addEventListener("drop", ignore);
    return () => {
      window.removeEventListener("dragover", ignore);
      window.removeEventListener("drop", ignore);
    };
  }, []);

  const retry = () => {
    client.restart();
    setRun((n) => n + 1);
  };
  const close = () => setResult(null);
  const reload = () => window.location.reload();
  const detecting = result !== null && result.names.length > 0;

  return (
    <div className="frame">
      <div className="rail" />
      <header className="wrap top">
        <div className="brand-line">
          <h1 className="brand">
            {/* the brand goes to the start view: the names */}
            <a
              href="./"
              onClick={(e) => {
                e.preventDefault();
                close();
              }}
            >
              ez.Regex
            </a>
          </h1>
          <p className="tagline">File name in, regex out</p>
        </div>
        <div className="top-actions">
          <a className="quiet" href="https://clamk-tools.github.io/">
            ← All tools
          </a>
          <ThemeSwitch />
        </div>
      </header>

      <main className="wrap page">
        {!detecting && (
          <NamesInput text={text} onText={setText} onPaste={() => load(namesFromText(text))} />
        )}

        {result && !detecting && (
          <p className="notice bad" role="alert">
            {result.given === 0
              ? "No file names were found in what you gave."
              : `None of the ${count(result.given, "name")} is an image (${EXTENSIONS}): ${result.ignoredExamples.join(", ")}${result.ignored > result.ignoredExamples.length ? " …" : ""}`}
          </p>
        )}

        {!detecting && engine.state !== "ready" && (
          <p className={`engine ${engine.state}`} role="status" data-testid="engine">
            {engine.state === "loading" && "Python is loading (about 6 MB on a first visit, then kept by the browser). You can give the names meanwhile."}
            {engine.state === "failed" && engine.refused && `This browser cannot run Python (${engine.error}). A current browser will.`}
            {engine.state === "failed" && engine.outdated && (
              <>
                A newer version of ez.Regex was published.{" "}
                <button type="button" className="link" onClick={reload}>
                  Reload the page
                </button>{" "}
                to use it.
              </>
            )}
            {engine.state === "failed" && !engine.refused && !engine.outdated && (
              <>
                Python could not be loaded ({engine.error}).{" "}
                <button type="button" className="link" onClick={retry}>
                  Try again
                </button>
              </>
            )}
          </p>
        )}

        {detecting && result && (
          <>
            {result.ignored > 0 && (
              <p className="notice" data-testid="ignored">
                {count(result.ignored, "other name")} ignored (not {EXTENSIONS}).
              </p>
            )}
            {result.names.length === 1 && (
              <p className="notice info">
                One name only: Detect has nothing to compare it with, so it proposes no labels and keeps a word such as DAPI as it is. Give it several names from
                the same folder for a pattern that fits them all.
              </p>
            )}
            {result.sameStem && (
              <p className="notice warn">
                {result.sameStem.first} and {result.sameStem.second} have the same name apart from the extension or the case
                {result.sameStem.count > 1 ? ` (and ${count(result.sameStem.count - 1, "other pair")})` : ""}. The pattern is not affected, but HC-Flow refuses a
                folder that holds both.
              </p>
            )}

            {engine.state === "failed" ? (
              <EngineFailed error={engine.error} refused={engine.refused} outdated={engine.outdated} onRetry={retry} onClose={close} />
            ) : (
              <MetadataDetect key={run} client={client} starting={engine.state === "loading"} onClose={close} />
            )}
          </>
        )}
      </main>

      <footer className="wrap foot">
        <p>
          <a className="quiet" href="https://github.com/clamk-tools/Metadata-Miner">
            Source
          </a>
        </p>
      </footer>
    </div>
  );
}

// Python is not there. Either it did not arrive: say why it usually happens and offer to try again. Or the browser
// will not run it (`refused`): trying again cannot help, so that is not offered. Or a newer release replaced this
// page's files (`outdated`): only a reload helps, and it empties the paste box (nothing is stored), so it says so.
// Until then the names are kept.
function EngineFailed({
  error,
  refused,
  outdated,
  onRetry,
  onClose,
}: {
  error: string;
  refused: boolean;
  outdated: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  if (outdated) {
    return (
      <div className="engine-failed" role="alert">
        <h2>A newer version of ez.Regex was published</h2>
        <p>
          This page was opened before it, and the files it needs have been replaced. Reload the page to use the new version. The paste box starts empty
          again: paste the names once more.
        </p>
        <p className="engine-failed-detail">{error}</p>
        <div className="engine-failed-actions">
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          <button type="button" onClick={onClose}>
            Back to the names
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="engine-failed" role="alert">
      <h2>{refused ? "This browser cannot run Python" : "Python could not be loaded"}</h2>
      {refused ? (
        <p>
          The pattern is worked out by Python running in this page, as WebAssembly, and this browser refuses to run it here. That happens with an old version
          (Safari before 16, Chrome before 97, Firefox before 102) and when WebAssembly is turned off (Lockdown Mode on an iPhone or a Mac). Trying again will
          not help: a current browser will.
        </p>
      ) : (
        <p>
          The pattern is worked out by Python running in this page, and Python is downloaded with the page, from the same site. The download failed, which
          usually means the connection dropped. If it fails every time, the browser may be too old to run it.
        </p>
      )}
      <p className="engine-failed-detail">{error}</p>
      <div className="engine-failed-actions">
        {!refused && (
          <button type="button" className="primary" onClick={onRetry}>
            Try again
          </button>
        )}
        <button type="button" onClick={onClose}>
          Back to the names
        </button>
      </div>
    </div>
  );
}
