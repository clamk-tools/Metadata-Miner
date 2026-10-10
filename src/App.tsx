import { useEffect, useState, useSyncExternalStore } from "react";

import { DetectScreen } from "./detect/DetectScreen";
import { namesFromText } from "./names/names";
import { NamesInput } from "./names/NamesInput";
import { DetectClient } from "./python/client";
import { EngineFailed, PythonStatus } from "./python/PythonStatus";
import { ThemeSwitch } from "./theme/ThemeSwitch";

// Created with the page, so Python is loading while the user is still giving the names.
const client = new DetectClient();

// The page opens on the names step (NamesInput); once names are given it shows Detect on them (DetectScreen), and the
// cross of Detect goes back to the names. Around both: the frame every Clamk tool has (rail, header with the name and
// the theme switch, footer).
export function App() {
  const engine = useSyncExternalStore(client.subscribe, client.status);
  const [names, setNames] = useState<string[] | null>(null); // null: none given yet; []: none found in the text
  const [run, setRun] = useState(0); // a new Detect screen for each set of names
  const [text, setText] = useState(""); // the paste box: kept when Detect is closed

  // The names go to Python here, in the handler, so they are there before the Detect screen asks its first question.
  const load = (next: string[]) => {
    setNames(next);
    if (next.length) {
      client.setNames(next).catch(() => undefined); // a failure shows as the engine's state or on the first request
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
  const close = () => setNames(null);
  const detecting = names !== null && names.length > 0;

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

        {names !== null && !detecting && (
          <p className="notice bad" role="alert">
            No file names were found in what you gave.
          </p>
        )}

        {!detecting && <PythonStatus engine={engine} onRetry={retry} />}

        {detecting && (
          <>
            {names.length === 1 && (
              <p className="notice info">
                One name only: Detect has nothing to compare it with, so it proposes no labels and keeps a word such as DAPI as it is. Give it several names from
                the same folder for a pattern that fits them all.
              </p>
            )}

            {engine.state === "failed" ? (
              <EngineFailed error={engine.error} refused={engine.refused} outdated={engine.outdated} onRetry={retry} onClose={close} />
            ) : (
              <DetectScreen key={run} client={client} starting={engine.state === "loading"} onClose={close} />
            )}
          </>
        )}
      </main>

      <footer className="wrap foot">
        <p>
          <a className="quiet" href="https://github.com/clamk-tools/ez.Regex">
            Source
          </a>
        </p>
      </footer>
    </div>
  );
}
