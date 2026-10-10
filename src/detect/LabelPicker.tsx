import { useState } from "react";

const PRESETS = ["Plate", "Well", "Row", "Column", "Site", "Field", "Channel", "Filter", "Laser", "Time", "Date", "Z"];

// The choices for the selected part, always on screen under the name so nothing moves when a part is selected:
// they wait, disabled, until one is. A label already on another part (`taken`) can be chosen too: it moves here.
export function LabelPicker({ text, taken, busy, onPick }: { text: string | null; taken: string[]; busy: boolean; onPick: (name: string) => void }) {
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
