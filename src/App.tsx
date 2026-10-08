import { useState, useSyncExternalStore } from "react";

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
  const retry = () => {
    client.restart();
    setRun((n) => n + 1);
  };
  const close = () => setResult(null);
  const detecting = result !== null && result.names.length > 0;

  return (
    <div className="frame">
      <div className="rail" />
      <header className="wrap top">
        <h1 className="brand">
          {/* the brand goes to the start view: the names */}
          <a
            href="./"
            onClick={(e) => {
              e.preventDefault();
              close();
            }}
          >
            MetadataMiner
          </a>
        </h1>
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
            {engine.state === "failed" && !engine.refused && (
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
              <EngineFailed error={engine.error} refused={engine.refused} onRetry={retry} onClose={close} />
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
// will not run it (`refused`): trying again cannot help, so that is not offered. The names are kept.
function EngineFailed({ error, refused, onRetry, onClose }: { error: string; refused: boolean; onRetry: () => void; onClose: () => void }) {
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
