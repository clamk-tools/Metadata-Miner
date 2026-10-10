import type { PointerEvent, ReactNode } from "react";

import type { DetectAnswer } from "../python/contract";
import { Cross } from "./icons";
import type { Range } from "./selection";

// The sample name, one selectable character at a time, with each labeled field painted and named under its text.
// A labeled part and the selection each carry a small cross at their top-right corner (remove the label / drop the selection).
export function SampleName({
  answer,
  colorOf,
  pending,
  busy,
  onDown,
  onMove,
  onUp,
  onCancel,
  onRemove,
}: {
  answer: DetectAnswer;
  colorOf: (name: string | null) => number;
  pending: Range | null;
  busy: boolean;
  onDown: (e: PointerEvent<HTMLDivElement>) => void;
  onMove: (e: PointerEvent<HTMLDivElement>) => void;
  onUp: () => void;
  onCancel: () => void;
  onRemove: (name: string) => void;
}) {
  const text = answer.sample;
  const owner = new Array<number>(text.length).fill(-1);
  answer.fields.forEach((f, i) => {
    for (let j = f.start; j < f.end; j++) owner[j] = i;
  });

  const groups: ReactNode[] = [];
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
        <span key={at} className={`dt-chip g${colorOf(name)}`}>
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
