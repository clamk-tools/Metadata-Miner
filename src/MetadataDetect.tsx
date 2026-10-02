import { useEffect, useRef, useState } from "react";

import { copyText } from "./clipboard";
import { DetectError } from "./detectClient";
import type { DetectClient } from "./detectClient";
import type { DetectField, DetectRequest, MetadataDetect as Answer } from "./detect-types";
import { cluster, clusters, snap } from "./selection";
import type { Range } from "./selection";

interface Props {
  client: DetectClient; // holds the names already; a request only carries the fields and the edit
  starting: boolean; // Python is still loading: the first answer waits for it
  onClose: () => void; // back to the names
}

const PRESETS = ["Plate", "Well", "Row", "Column", "Site", "Field", "Channel", "Filter", "Laser", "Time", "Date", "Z"];
const STYLES: [string, string][] = [
  ["shape", "Same shape"],
  ["flex", "Flexible"],
  ["word", "Any word"],
  ["words", "Several words"],
  ["list", "Seen values"],
];
const STYLE_LABEL = Object.fromEntries(STYLES);
const SLOW_MS = 400; // an answer that takes longer says it is being worked on

function reason(e: unknown): string {
  if (e instanceof DetectError && e.unexpected) {
    return `Something went wrong while working out the pattern (${e.message}). Changing the labels or the names may get around it; please report it.`;
  }
  return e instanceof Error ? e.message : String(e);
}

// The icons: lines on a 24-unit grid, in the colour of the text around them. `bold` keeps the smallest ones readable.
function Icon({ size = 16, bold, children }: { size?: number; bold?: boolean; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={bold ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// A small cross: the same glyph on a labeled part of the name, on the selection and on a field card.
function Cross({ size = 10 }: { size?: number }) {
  return (
    <Icon size={size} bold={size < 12}>
      <path d="M5 5l14 14M19 5L5 19" />
    </Icon>
  );
}

// An "i" bubble: its explanation pops out while the pointer or the keyboard focus is on it.
function Info({ id, label, wide, children }: { id: string; label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <span className="dt-info">
      <button type="button" className="quiet" aria-label={label} aria-describedby={id}>
        <Icon>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5.5M12 7.5v.01" />
        </Icon>
      </button>
      <span className={`field-pop${wide ? " wide" : ""}`} role="tooltip" id={id}>
        {children}
      </span>
    </span>
  );
}

// Everything the tool writes into a pattern, in the order of how often it shows up. Python's `re` syntax.
const GUIDE: [string, string][] = [
  ["(?P<Well>…)", "Named group. What is inside is read into a field called Well."],
  ["[A-Z]", "One capital letter. [a-z] is lowercase, [A-Za-z] any letter, [A-Za-z0-9] a letter or a digit."],
  [String.raw`\d`, "One digit."],
  ["{2}", String.raw`Exactly 2 of what comes just before: \d{2} reads 03 or 12.`],
  ["+", String.raw`One or more: \d+ reads 3, 12 or 305.`],
  ["*", "Zero or more: (?: [A-Za-z0-9]+)* reads nothing, or more words after a space (Far Red)."],
  ["(?:…)", "A group that is not read. Used to repeat something, or to choose."],
  ["a|b", "a or b: (?:Red|Blue)."],
  [String.raw`[^_\-.\s]+`, "Anything except _ - . and spaces: one part of the name."],
  [String.raw`\( \. \[`, "A backslash turns a symbol into plain text."],
  ["plate_s", "Plain text matches exactly itself."],
];

// The "i" next to Pattern: a short reference for every piece of syntax the tool can write.
function RegexGuide() {
  return (
    <Info id="dt-help-regex" label="Reading the pattern: what each symbol means" wide>
      <span className="dt-ref-title">Reading the pattern</span>
      <span className="dt-ref">
        {GUIDE.map(([code, meaning]) => (
          <span className="dt-ref-row" key={code}>
            <code>{code}</code>
            <span>{meaning}</span>
          </span>
        ))}
      </span>
      <span className="dt-ref-foot">
        A pattern matches wherever it fits in the name; it need not cover all of it. This is Python syntax: <code>(?P&lt;Name&gt;…)</code>, not{" "}
        <code>(?&lt;Name&gt;…)</code>.
      </span>
    </Info>
  );
}

// The worked example in an "i" bubble: the name used, with the part that is labeled marked, then what each setting gives.
function Example({ label, before, hit, after, note, children }: { label: string; before: string; hit: string; after: string; note?: string; children: React.ReactNode }) {
  return (
    <span className="dt-eg">
      <span className="dt-eg-title">Example</span>
      <span className="dt-eg-name">
        {before}
        <mark>{hit}</mark>
        {after}
      </span>
      <span className="dt-eg-note">
        <b>{hit}</b> is labeled <b>{label}</b>. {note}
      </span>
      {children}
    </span>
  );
}

// One setting of the example: ticked or not, the pattern it writes, and what that pattern does.
function ExampleCase({ on, pattern, result }: { on?: boolean; pattern: string; result: string }) {
  const ticked = on !== false;
  return (
    <span className="dt-eg-case">
      <span className={`dt-eg-state${ticked ? " on" : ""}`}>{ticked ? "Ticked" : "Unticked"}</span>
      <span className="dt-eg-rest">
        <code>{pattern}</code>
        <span>{result}</span>
      </span>
    </span>
  );
}

// Detect, HC-Flow's dialog as a page section (its cross goes back to the names; there is no screen to hand the pattern
// to here, so it is copied). Two zones side by side: on the left the work (the sample name is shown
// large, with the label choices right under it, then the pattern those labels give), on the right the list of what was
// produced (one card per labeled field). What the pattern reads from the rest of the names follows underneath. Detect
// starts with its own proposal, so most of the time it is correcting rather than starting. The pattern is written by
// Python (py/app/imaging/metadata_detect.py, in the worker), one request per edit; this component holds the fields and
// sends them back.
export function MetadataDetect({ client, starting, onClose }: Props) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [options, setOptions] = useState({ generalize: true, anchor: true });
  const [busy, setBusy] = useState(true);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Range | null>(null); // the selection a label is being chosen for
  const [copied, setCopied] = useState<{ pattern: string; ok: boolean } | null>(null);
  const attempt = useRef(0); // bumped by each request: an older answer still in flight is ignored
  const latest = useRef<Answer | null>(null);
  const drag = useRef<{ a: number; b: number; moved: boolean } | null>(null);
  const section = useRef<HTMLElement>(null);
  const regex = useRef<HTMLDivElement>(null);

  const call = async (patch: Partial<DetectRequest>, using = options) => {
    const mine = ++attempt.current;
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

  const setOption = (name: "generalize" | "anchor", value: boolean) => {
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
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const i = charAt(e.target);
    if (i === null || busy) return;
    drag.current = { a: i, b: i, moved: false };
    setPending(snap(tokens, i, i));
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is optional
    }
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const i = charAt(document.elementFromPoint(e.clientX, e.clientY));
    if (i !== null && i !== d.b) {
      d.b = i;
      d.moved = true;
      setPending(snap(tokens, d.a, d.b));
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) setPending(cluster(tokens, d.a));
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
  const colorOf = (name: string | null) => Math.max(0, fields.findIndex((f) => f.name === name)) % 6;

  return (
    <section className="dt" aria-labelledby="dt-title" tabIndex={-1} ref={section}>
      <div className="dt-head">
        <div className="dt-title">
          <h2 id="dt-title">Detect the pattern</h2>
          {/* The how-to is not on the page: it pops out from the "i" while the pointer or the keyboard focus is on it. */}
          <Info id="dt-help" label="How Detect works">
            Label the parts of one file name that hold the metadata. Detect has already proposed labels; drag across the name (or click a part) to change
            them. The pattern and its matches below follow every change.
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
                <div className="dt-opts">
                  <div className="dt-opt-row">
                    <label className="dt-opt">
                      <input type="checkbox" checked={options.anchor} disabled={busy} onChange={(e) => setOption("anchor", e.target.checked)} />
                      Anchor with the neighbouring part on each side
                    </label>
                    <Info id="dt-help-anchor" label="What anchoring does">
                      Adds the text just before and just after your labels to the pattern, so it can only match in the right place in the name.
                      <Example label="Channel" before="plate1_B03_s2_w1_" hit="DAPI" after=".tif">
                        <ExampleCase on pattern={String.raw`w\d+_(?P<Channel>[A-Za-z0-9]+)`} result="reads DAPI, GFP, Cy5: correct" />
                        <ExampleCase on={false} pattern={String.raw`(?P<Channel>[A-Za-z0-9]+)`} result="reads plate1: wrong place" />
                      </Example>
                    </Info>
                  </div>
                  <div className="dt-opt-row">
                    <label className="dt-opt">
                      <input type="checkbox" checked={options.generalize} disabled={busy} onChange={(e) => setOption("generalize", e.target.checked)} />
                      Allow fixed text vary in its numbers
                    </label>
                    <Info id="dt-help-numbers" label="What letting the numbers vary does">
                      Writes the numbers you did not label as “any number”, so w1 also matches w2 and w3. Untick it to keep them exactly as in the sample name.
                      <Example label="Well" before="plate1_" hit="B03" after="_s2_w1_DAPI.tif" note="432 names: 2 plates, 3 sites.">
                        <ExampleCase on pattern={String.raw`plate\d+_(?P<Well>[A-Z]\d{2})_s\d+`} result="matches all 432 names" />
                        <ExampleCase on={false} pattern={String.raw`plate1_(?P<Well>[A-Z]\d{2})_s2`} result="matches 72 names: plate 1, site 2 only" />
                      </Example>
                    </Info>
                  </div>
                </div>
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
                <FieldRow
                  key={f.name}
                  field={f}
                  color={i % 6}
                  busy={busy}
                  onRename={(to) => void call({ rename: { from: f.name, to } })}
                  onMode={(mode) => void call({ edit: { name: f.name, mode } })}
                  onPrefix={(prefix) => void call({ edit: { name: f.name, prefix } })}
                  onRemove={() => void call({ remove: f.name })}
                />
              ))}
              <p className="dt-slot">
                {fields.length === 0
                  ? "Nothing is labeled. Drag across a part of the name, or click one, then choose what it is."
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

// The sample name, one selectable character at a time, with each labeled field painted and named under its text.
// A labeled part and the selection each carry a small cross at their top-right corner (remove the label / drop the selection).
function SampleName({
  answer,
  pending,
  busy,
  onDown,
  onMove,
  onUp,
  onCancel,
  onRemove,
}: {
  answer: Answer;
  pending: Range | null;
  busy: boolean;
  onDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onUp: () => void;
  onCancel: () => void;
  onRemove: (name: string) => void;
}) {
  const text = answer.sample;
  const owner = new Array<number>(text.length).fill(-1);
  answer.fields.forEach((f, i) => {
    for (let j = f.start; j < f.end; j++) owner[j] = i;
  });

  const groups: React.ReactNode[] = [];
  let at = 0;
  while (at < text.length) {
    let end = at;
    while (end < text.length && owner[end] === owner[at]) end += 1;
    const chars = [];
    for (let j = at; j < end; j++) {
      const selected = pending && j >= pending.start && j < pending.end;
      const char = (
        <span data-i={j} className={selected ? "sel" : undefined}>
          {text[j]}
        </span>
      );
      chars.push(
        pending && j === pending.end - 1 ? (
          <span key={j} className="dt-selend">
            {char}
            <button type="button" className="dt-x" aria-label="Drop this selection" title="Drop this selection" onClick={onCancel}>
              <Cross />
            </button>
          </span>
        ) : (
          <span key={j} className="dt-ch">
            {char}
          </span>
        ),
      );
    }
    const name = owner[at] >= 0 ? answer.fields[owner[at]].name : null;
    groups.push(
      name !== null ? (
        <span key={at} className={`dt-chip g${owner[at] % 6}`}>
          <span>{chars}</span>
          <small>{name}</small>
          <button type="button" className="dt-x" disabled={busy} aria-label={`Remove the ${name} label`} title={`Remove the ${name} label`} onClick={() => onRemove(name)}>
            <Cross />
          </button>
        </span>
      ) : (
        <span key={at} className="dt-plain">
          {chars}
        </span>
      ),
    );
    at = end;
  }

  return (
    <div
      className={`dt-name${busy ? " busy" : ""}`}
      role="group"
      aria-label={`Sample file name ${text}: drag to select part of it`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
    >
      {groups}
    </div>
  );
}

// The choices for the selected part, always on screen under the name so nothing moves when a part is selected:
// they wait, disabled, until one is. A label already on another part (`taken`) can be chosen too: it moves here.
function LabelPicker({ text, taken, busy, onPick }: { text: string | null; taken: string[]; busy: boolean; onPick: (name: string) => void }) {
  const [custom, setCustom] = useState("");
  const off = busy || text === null;
  const pick = (name: string) => {
    onPick(name);
    setCustom("");
  };
  return (
    <div className="dt-picker" role="group" aria-label="Choose a label">
      <div className="dt-picker-head">
        {text === null ? (
          <span>Select a part of the name to label it</span>
        ) : (
          <span>
            Label <b>{text}</b> as
          </span>
        )}
      </div>
      <div className="dt-presets">
        {PRESETS.map((p) => {
          const used = taken.includes(p);
          return (
            <button key={p} type="button" className={used ? "used" : undefined} disabled={off} title={used && !off ? `Move the ${p} label here` : undefined} onClick={() => pick(p)}>
              {p}
            </button>
          );
        })}
      </div>
      <div className="dt-other">
        <input
          type="text"
          value={custom}
          maxLength={24}
          placeholder="Other name"
          aria-label="Other field name"
          disabled={off}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pick(custom)}
        />
        <button type="button" disabled={off || !custom.trim()} onClick={() => pick(custom)}>
          Add
        </button>
      </div>
    </div>
  );
}

// One labeled field, a card: its name (editable) with what it selects, the pattern style in use with how many names each
// style fits, and what it reads from the matched names. The cross beside its name removes it. The card is keyed by the
// field's name, so a rename that went through shows the new name and one that was refused keeps what was typed.
function FieldRow({
  field,
  color,
  busy,
  onRename,
  onMode,
  onPrefix,
  onRemove,
}: {
  field: DetectField;
  color: number;
  busy: boolean;
  onRename: (to: string) => void;
  onMode: (mode: string) => void;
  onPrefix: (prefix: boolean) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(field.name);
  const commit = () => {
    const to = name.trim();
    if (to && to !== field.name) onRename(to);
    else setName(field.name);
  };
  const fitted = field.covers[field.mode_used];
  const summary = field.distinct
    ? `${field.distinct} distinct · ${field.values.join(", ")}${field.distinct > field.values.length ? " …" : ""}${field.type ? ` · ${field.type}` : ""}`
    : "no values read yet";

  return (
    <div className={`dt-field g${color}`}>
      <div className="dt-field-top">
        <input
          type="text"
          className="dt-name-input"
          value={name}
          maxLength={24}
          aria-label={`Name of the field labeled ${field.text}`}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(field.name);
          }}
        />
        <span className="dt-text">{field.text}</span>
        <button type="button" className="quiet icon compact dt-remove" disabled={busy} title={`Remove ${field.name}`} aria-label={`Remove ${field.name}`} onClick={onRemove}>
          <Cross size={12} />
        </button>
      </div>
      <select value={field.auto ? "auto" : field.mode} disabled={busy} aria-label={`Pattern style of ${field.name}`} onChange={(e) => onMode(e.target.value)}>
        <option value="auto">
          Auto ({STYLE_LABEL[field.fit].toLowerCase()}) · {field.covers[field.fit]}/{field.total}
        </option>
        {STYLES.map(([style, styleLabel]) => (
          <option key={style} value={style}>
            {styleLabel} · {field.covers[style]}/{field.total}
          </option>
        ))}
      </select>
      {field.eligible && (
        <label className="dt-check">
          <input type="checkbox" checked={field.prefix} disabled={busy} onChange={(e) => onPrefix(e.target.checked)} />
          Value only, skip “{field.prefix_text}”
        </label>
      )}
      <div className="dt-field-sum">
        <code>{field.pattern}</code>
        <span>{summary}</span>
        {fitted < field.total && (
          <span className="dt-warn">
            this style fits {fitted} of {field.total} names
          </span>
        )}
        {field.hint && <span className="dt-warn">{field.hint}</span>}
      </div>
    </div>
  );
}

// How many names the pattern reads, and the ones it does not (click one to use it as the sample and widen the
// pattern to fit it).
function MatchSummary({ answer, busy, onPick }: { answer: Answer; busy: boolean; onPick: (index: number) => void }) {
  return (
    <div className="dt-matches">
      <div className="is-legend">
        <span className="ok" role="status" data-testid="matched">
          Matched {answer.matched} of {answer.total} names
        </span>
        {answer.unmatched_count > 0 && <span>{answer.unmatched_count} get blank values. Click one to use it as the sample and widen the pattern to fit it:</span>}
      </div>
      {answer.unmatched.length > 0 && (
        <div className="dt-unmatched">
          {answer.unmatched.map((u) => (
            <button key={u.index} type="button" className="compact danger" disabled={busy} onClick={() => onPick(u.index)}>
              {u.name}
            </button>
          ))}
          {answer.unmatched_count > answer.unmatched.length && <span>+{answer.unmatched_count - answer.unmatched.length} more</span>}
        </div>
      )}
    </div>
  );
}

// The first few names with what the pattern reads from each.
function MatchRows({ answer, colorOf }: { answer: Answer; colorOf: (name: string | null) => number }) {
  const names = answer.fields.map((f) => f.name);
  return (
    <div className="dt-matches">
      <div className="is-table-wrap">
        <table className="is-table">
          <thead>
            <tr>
              <th>Name</th>
              {names.map((n) => (
                <th key={n} className={`g${colorOf(n)}`}>
                  <span className="dot" />
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {answer.rows.map((row) => (
              <tr key={row.index}>
                <td className="is-fn">{row.name}</td>
                {names.map((n) => (
                  <td key={n}>{row.values[n] ?? "–"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
