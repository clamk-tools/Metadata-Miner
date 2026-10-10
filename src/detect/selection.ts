import type { DetectToken } from "../python/contract";

// Turning a click or a drag on the sample name into the stretch to label. The tokens are the name cut into groups of
// letters, groups of digits, other characters and separators, as Python answered them.

export interface Range {
  start: number;
  end: number;
}

const ALNUM = /[A-Za-z0-9]/;

/** Every letter/digit group a drag from character a to b touches, so its ends snap to whole groups. */
export function snap(tokens: DetectToken[], a: number, b: number): Range | null {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const touched = tokens.filter((t) => !t.sep && t.end > lo && t.start <= hi);
  return touched.length ? { start: touched[0].start, end: touched[touched.length - 1].end } : null;
}

/** What a click on character i selects: the letters and digits around it up to a bracket or separator (B03, s2, FITC). */
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
