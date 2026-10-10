import type { EngineStatus } from "./client";

// Python's state on the names step, while it is not ready: loading, or why it failed and what helps.
export function PythonStatus({ engine, onRetry }: { engine: EngineStatus; onRetry: () => void }) {
  if (engine.state === "ready") return null;
  return (
    <p className={`engine ${engine.state}`} role="status" data-testid="engine">
      {engine.state === "loading" && "Python is loading (about 6 MB on a first visit, then kept by the browser). You can give the names meanwhile."}
      {engine.state === "failed" && engine.refused && `This browser cannot run Python (${engine.error}). A current browser will.`}
      {engine.state === "failed" && engine.outdated && (
        <>
          A newer version of ez.Regex was published.{" "}
          <button type="button" className="link" onClick={() => window.location.reload()}>
            Reload the page
          </button>{" "}
          to use it.
        </>
      )}
      {engine.state === "failed" && !engine.refused && !engine.outdated && (
        <>
          Python could not be loaded ({engine.error}).{" "}
          <button type="button" className="link" onClick={onRetry}>
            Try again
          </button>
        </>
      )}
    </p>
  );
}

// Python is not there. Either it did not arrive: say why it usually happens and offer to try again. Or the browser
// will not run it (`refused`): trying again cannot help, so that is not offered. Or a newer release replaced this
// page's files (`outdated`): only a reload helps, and it empties the paste box (nothing is stored), so it says so.
// Until then the names are kept.
export function EngineFailed({
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
