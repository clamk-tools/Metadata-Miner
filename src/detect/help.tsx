import type { ReactNode } from "react";

import { Icon } from "./icons";

// An "i" bubble: its explanation pops out while the pointer or the keyboard focus is on it.
export function Info({ id, label, wide, children }: { id: string; label: string; wide?: boolean; children: ReactNode }) {
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
  ["^ $", "The start and the end of the name. Added only when the pattern would otherwise read the sample in the wrong place."],
  ["a|b", "a or b: (?:Red|Blue)."],
  [String.raw`[^_\-.\s]+`, "Anything except _ - . and spaces: one part of the name."],
  [String.raw`\( \. \[`, "A backslash turns a symbol into plain text."],
  ["plate_s", "Plain text matches exactly itself."],
];

// The "i" next to Pattern: a short reference for every piece of syntax the tool can write.
export function RegexGuide() {
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
export function Example({ label, before, hit, after, note, children }: { label: string; before: string; hit: string; after: string; note?: string; children: ReactNode }) {
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
export function ExampleCase({ on, pattern, result }: { on?: boolean; pattern: string; result: string }) {
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
