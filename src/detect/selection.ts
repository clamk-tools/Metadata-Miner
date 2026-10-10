import type { DetectToken } from "../python/contract";

// Turning a click or a drag on the sample name into the stretch to label. A click or a drag is taken exactly, to the
// character; only a "pick a part" button takes a whole group. The tokens are the name cut into groups
// of letters, groups of digits, other characters and separators, as Python answered them.

export interface Range {
  start: number;
  end: number;
}

const ALNUM = /[A-Za-z0-9]/;

/** The characters from a to b, both included, whichever way it was dragged: separators at the ends are left out, as
 * Python leaves them out. Null for separators alone. */
export function exact(tokens: DetectToken[], a: number, b: number): Range | null {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b) + 1;
  const touched = tokens.filter((t) => !t.sep && t.end > lo && t.start < hi);
  if (!touched.length) return null;
  return { start: Math.max(lo, touched[0].start), end: Math.min(hi, touched[touched.length - 1].end) };
}

/** The letters and digits around character i, up to a bracket or separator (B03, s2, FITC): one "pick a part" button. */
export function cluster(tokens: DetectToken[], i: number): Range | null {
  const at = tokens.findIndex((t) => !t.sep && t.start <= i && i < t.end);
  if (at < 0) return null;
  const word = (t: DetectToken | undefined) => !!t && !t.sep && t.seg === tokens[at].seg && ALNUM.test(t.text[0]);
  if (!word(tokens[at])) return { start: tokens[at].start, end: tokens[at].end };
  let first = at;
  let last = at;
  while (word(tokens[first - 1])) first -= 1;
  while (word(tokens[last + 1])) last += 1;
  return { start: tokens[first].start, end: tokens[last].end };
}

/** Every group of letters and digits, for picking a part with a button instead of the mouse. */
export function clusters(tokens: DetectToken[]): { range: Range; text: string }[] {
  const out: { range: Range; text: string }[] = [];
  let at = 0;
  while (at < tokens.length) {
    const range = tokens[at].sep ? null : cluster(tokens, tokens[at].start);
    if (range) {
      const text = tokens
        .filter((t) => t.start >= range.start && t.end <= range.end)
        .map((t) => t.text)
        .join("");
      if (ALNUM.test(text)) out.push({ range, text }); // a lone bracket is not something to label
      while (at < tokens.length && tokens[at].start < range.end) at += 1;
    } else {
      at += 1;
    }
  }
  return out;
}
