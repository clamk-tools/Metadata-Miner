import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

import { DetectError } from "../python/client";
import type { DetectClient } from "../python/client";
import type { DetectAnswer, DetectRequest } from "../python/contract";
import { copyText } from "./clipboard";
import { FieldCard } from "./FieldCard";
import { Info, RegexGuide } from "./help";
import { Cross, Icon } from "./icons";
import { LabelPicker } from "./LabelPicker";
import { MatchRows, MatchSummary } from "./Matches";
import { PatternOptions } from "./PatternOptions";
import type { Options } from "./PatternOptions";
import { SampleName } from "./SampleName";
import { clusters, exact } from "./selection";
import type { Range } from "./selection";

interface Props {
  client: DetectClient; // holds the names already; a request only carries the fields and the edit
  starting: boolean; // Python is still loading: the first answer waits for it
  onClose: () => void; // back to the names
}

const SLOW_MS = 400; // an answer that takes longer says it is being worked on, and dims the controls (detect.css)
const COLORS = 6; // the field colours, .g0 to .g5 in detect.css
const CONTROLS = "button, input, select, textarea";

function reason(e: unknown): string {
  if (e instanceof DetectError && e.unexpected) {
    return `Something went wrong while working out the pattern (${e.message}). Changing the labels or the names may get around it; please report it.`;
  }
  return e instanceof Error ? e.message : String(e);
}

// The Detect screen (its cross goes back to the names). Two zones side by side: on the left the work (the sample name
// shown large, with the label choices right under it, then the pattern those labels give), on the right the list of
// what was produced (one card per labeled field). What the pattern reads from the rest of the names follows
// underneath. Detect starts with its own proposal, so most of the time it is correcting rather than starting. The
// pattern is written by Python (py/engine.py, in the worker), one request per edit; this component holds the fields
// and sends them back.
export function DetectScreen({ client, starting, onClose }: Props) {
  const [answer, setAnswer] = useState<DetectAnswer | null>(null);
  const [options, setOptions] = useState<Options>({ generalize: true, anchor: true });
  const [busy, setBusy] = useState(true);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Range | null>(null); // the selection a label is being chosen for
  const [copied, setCopied] = useState<{ pattern: string; ok: boolean } | null>(null);
  const attempt = useRef(0); // bumped by each request: an older answer still in flight is ignored
  const latest = useRef<DetectAnswer | null>(null);
  const drag = useRef<{ a: number; b: number } | null>(null);
  const section = useRef<HTMLElement>(null);
  const regex = useRef<HTMLDivElement>(null);
  // The control that sent the request, and where it sits among the screen's controls: every control is disabled while
  // Python works (two quick edits would overwrite each other), and a disabled control loses the keyboard focus.
  const focused = useRef<{ el: Element; index: number } | null>(null);

  const call = async (patch: Partial<DetectRequest>, using = options) => {
    const mine = ++attempt.current;
    const el = document.activeElement;
    if (el && el !== section.current && section.current?.contains(el)) {
      focused.current = { el, index: Array.from(section.current.querySelectorAll(CONTROLS)).indexOf(el) };
    }
    setBusy(true);
    setError(null);
    const timer = window.setTimeout(() => mine === attempt.current && setSlow(true), SLOW_MS);
    try {
      const result = await client.detect({
        sample_index: latest.current?.sample_index ?? 0,
        fields: latest.current?.fields ?? [],
        ...using,
        ...patch,
      });
      if (mine !== attempt.current) return;
      latest.current = result;
      setAnswer(result);
      setPending(null);
    } catch (e) {
      if (mine === attempt.current) setError(reason(e));
    } finally {
      window.clearTimeout(timer);
      if (mine === attempt.current) {
        setBusy(false);
        setSlow(false);
      }
    }
  };

  // Escape drops a selection that is waiting for a label.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPending(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    section.current?.focus({ preventScroll: true });
    // The first question to Python, asked once when the screen opens: an effect is the place for it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void call({ suggest: true });
    return () => {
      attempt.current += 1; // nothing that is still in flight may land after the screen is gone
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the answer is in, the focus goes back where it was: to the same control, or to the one now in its place (a
  // removed label's), or else to the screen. Not when the user has put it somewhere else in the meantime.
  useEffect(() => {
    const was = focused.current;
    const screen = section.current;
    if (busy || !was || !screen) return;
    focused.current = null;
    const now = document.activeElement;
    if (now && now !== document.body && now !== was.el) return;
    const usable = (el: Element | undefined): el is HTMLElement => el instanceof HTMLElement && el.isConnected && !el.matches(":disabled");
    const target = usable(was.el) ? was.el : screen.querySelectorAll(CONTROLS)[was.index];
    if (target !== now) (usable(target) ? target : screen).focus({ preventScroll: true });
  }, [busy]);

  const setOption = (name: keyof Options, value: boolean) => {
    const next = { ...options, [name]: value };
    setOptions(next);
    void call({}, next);
  };
  const goTo = (index: number) => {
    if (!answer) return;
    void call({ sample_index: (index + answer.total) % answer.total, from_index: answer.sample_index });
  };

  // ---- selecting on the sample name ----
  const tokens = answer?.tokens ?? [];
  const charAt = (target: EventTarget | null): number | null => {
    const el = (target as Element | null)?.closest?.("[data-i]") as HTMLElement | null;
    return el ? Number(el.dataset.i) : null;
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = charAt(e.target);
    if (i === null || busy) return;
    drag.current = { a: i, b: i };
    setPending(exact(tokens, i, i));
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is optional
    }
    e.preventDefault();
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const i = charAt(document.elementFromPoint(e.clientX, e.clientY));
    if (i !== null && i !== d.b) {
      d.b = i;
      setPending(exact(tokens, d.a, d.b));
    }
  };
  const onUp = () => {
    drag.current = null;
  };
  const label = (name: string) => {
    const clean = name.trim().replace(/\s+/g, "_");
    if (!pending || !clean) return;
    void call({ add: { name: clean, start: pending.start, end: pending.end } });
  };

  // ---- copying the pattern ----
  const copy = async () => {
    if (!answer?.pattern) return;
    const pattern = answer.pattern;
    const ok = await copyText(pattern);
    if (!ok && regex.current) window.getSelection()?.selectAllChildren(regex.current); // ready for Ctrl+C
    setCopied({ pattern, ok });
  };
  const copyState = copied && copied.pattern === answer?.pattern ? copied : null; // a changed pattern is not the copied one

  const fields = answer?.fields ?? [];
  const colorOf = (name: string | null) => Math.max(0, fields.findIndex((f) => f.name === name)) % COLORS;

  return (
    <section className="dt" aria-labelledby="dt-title" tabIndex={-1} ref={section}>
      <div className="dt-head">
        <div className="dt-title">
          <h2 id="dt-title">Detect the pattern</h2>
          {/* The how-to is not on the page: it pops out from the "i" while the pointer or the keyboard focus is on it. */}
          <Info id="dt-help" label="How Detect works">
            Label the parts of one file name that hold the metadata. Detect has already proposed labels; to change them, click a character of the name or
            drag across several (the buttons under it take a whole part). The pattern and its matches below follow every change.
          </Info>
        </div>
        <span className="dt-working" role="status">
          {answer && slow ? "Working…" : ""}
        </span>
        <button type="button" className="quiet icon" aria-label="Close" title="Close: back to the names" onClick={onClose}>
          <Cross size={16} />
        </button>
      </div>

      {error && (
        <p className="notice bad" role="alert">
          {error}
        </p>
      )}

      {answer && (
        <>
          <div className="dt-body">
            <section className="dt-work" aria-label="Work area">
              <div className="dt-group">
                <div className="section-label">
                  <span className="cap">1 · Sample name</span>
                  <span className="rule" />
                  <div className="dt-tools">
                    <div className="dt-nav" role="group" aria-label="Sample name">
                      <button type="button" className="quiet" disabled={busy || answer.total < 2} onClick={() => goTo(answer.sample_index - 1)} aria-label="Previous name">
                        <Icon>
                          <path d="M15 6l-6 6 6 6" />
                        </Icon>
                      </button>
                      <span>{`${answer.sample_index + 1} of ${answer.total}`}</span>
                      <button type="button" className="quiet" disabled={busy || answer.total < 2} onClick={() => goTo(answer.sample_index + 1)} aria-label="Next name">
                        <Icon>
                          <path d="M9 6l6 6-6 6" />
                        </Icon>
                      </button>
                    </div>
                    <button type="button" className="compact" disabled={busy} onClick={() => void call({ suggest: true })} title="Propose labels again from the names">
                      Suggest again
                    </button>
                  </div>
                </div>

                <div className="dt-stage">
                  <SampleName
                    answer={answer}
                    colorOf={colorOf}
                    pending={pending}
                    busy={busy}
                    onDown={onDown}
                    onMove={onMove}
                    onUp={onUp}
                    onCancel={() => {
                      drag.current = null;
                      setPending(null);
                    }}
                    onRemove={(name) => void call({ remove: name })}
                  />

                  <div className="dt-parts" aria-label="Pick a part">
                    <span>Or pick a part:</span>
                    {clusters(tokens).map((c) => (
                      <button key={c.range.start} type="button" className="compact" disabled={busy} onClick={() => setPending(c.range)}>
                        {c.text}
                      </button>
                    ))}
                  </div>

                  <LabelPicker
                    text={pending ? answer.sample.slice(pending.start, pending.end) : null}
                    taken={fields.filter((f) => !pending || f.end <= pending.start || f.start >= pending.end).map((f) => f.name)}
                    busy={busy}
                    onPick={label}
                  />
                </div>

                {answer.notes.length > 0 && (
                  <p className="notice info" role="status">
                    {answer.notes.join(" ")}
                  </p>
                )}
              </div>

              <div className="dt-group">
                <div className="section-label">
                  <span className="cap">2 · Pattern</span>
                  <RegexGuide />
                  <span className="rule" />
                  <span className="dt-tools">
                    <span className={`dt-sub${copyState && !copyState.ok ? " dt-warn" : ""}`} role="status">
                      {copyState ? (copyState.ok ? "Copied to the clipboard" : "The clipboard is not available: the pattern is selected, press Ctrl+C") : ""}
                    </span>
                    <button type="button" className="primary with-icon" disabled={busy || !answer.pattern} onClick={() => void copy()}>
                      <Icon>
                        <rect x="9" y="9" width="12" height="12" rx="2" />
                        <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
                      </Icon>
                      Copy this pattern
                    </button>
                  </span>
                </div>
                <div className="dt-regex" ref={regex} data-testid="pattern">
                  {answer.pieces.length === 0 ? (
                    <span className="dt-empty">No pattern yet.</span>
                  ) : (
                    answer.pieces.map((p, i) => (
                      <span key={i} className={p.field ? `grp g${colorOf(p.field)}` : undefined}>
                        {p.text}
                      </span>
                    ))
                  )}
                </div>
                <PatternOptions options={options} busy={busy} onChange={setOption} />
              </div>
            </section>

            <aside className="dt-labels" aria-label="Labeled fields">
              <div className="section-label">
                <span className="cap">{`Labels · ${fields.length}`}</span>
                <span className="rule" />
                <button type="button" className="compact danger with-icon" disabled={busy || fields.length === 0} onClick={() => void call({ fields: [] })}>
                  <Icon size={12}>
                    <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" />
                  </Icon>
                  Clear all
                </button>
              </div>
              {fields.map((f, i) => (
                <FieldCard
                  key={f.name}
                  field={f}
                  styles={answer.styles}
                  color={i % COLORS}
                  busy={busy}
                  onRename={(to) => void call({ rename: { from: f.name, to } })}
                  onMode={(mode) => void call({ edit: { name: f.name, mode } })}
                  onPrefix={(prefix) => void call({ edit: { name: f.name, prefix } })}
                  onRemove={() => void call({ remove: f.name })}
                />
              ))}
              <p className="dt-slot">
                {fields.length === 0
                  ? "Nothing is labeled. Click a character of the name or drag across several, then choose what it is."
                  : "Select a part of the name to add a label"}
              </p>
            </aside>
          </div>

          {answer.pattern && (
            <div className="dt-group">
              <div className="section-label">
                <span className="cap">3 · What the pattern reads</span>
                <span className="rule" />
              </div>
              <MatchSummary answer={answer} busy={busy} onPick={goTo} />
              <MatchRows answer={answer} colorOf={colorOf} />
            </div>
          )}
        </>
      )}

      {!answer && busy && !error && (
        <p className="dt-loading" role="status">
          {starting ? "Starting Python: a few seconds on a first visit, then it is kept by the browser…" : "Reading the file names…"}
        </p>
      )}
    </section>
  );
}
