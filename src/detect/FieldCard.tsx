import { useState } from "react";

import type { DetectField } from "../python/contract";
import { Cross } from "./icons";

// The pattern styles, tightest first: the keys of MODES in py/engine.py. A style missing here crashes the card.
const STYLES: [string, string][] = [
  ["shape", "Same shape"],
  ["flex", "Flexible"],
  ["word", "Any word"],
  ["words", "Several words"],
  ["list", "Seen values"],
];
const STYLE_LABEL = Object.fromEntries(STYLES);

// One labeled field, a card: its name (editable) with what it selects, the pattern style in use with how many names each
// style fits, and what it reads from the matched names. The cross beside its name removes it. The card is keyed by the
// field's name, so a rename that went through shows the new name and one that was refused keeps what was typed.
export function FieldCard({
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
    if (busy) return; // the box losing the focus as it is disabled, after Enter sent the rename already
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
          disabled={busy}
          aria-label={`Name of the field labeled ${field.text}`}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
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
