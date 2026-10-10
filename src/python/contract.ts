// What the engine (py/engine.py, through py/glue.py) takes and answers. A field is a labeled stretch of the sample file
// name; the screen sends the fields back exactly as the last answer returned them, with at most one edit.
export interface DetectField {
  name: string;
  s_seg: number; // the stretch runs from run k0 of part s_seg to run k1 of part e_seg; s0 / e1: follow the part's ends
  k0: number;
  e_seg: number;
  k1: number;
  s0: boolean;
  e1: boolean;
  prefix: boolean; // skip the letters before the number ("s" of s2): they are fixed text, not part of the value
  auto: boolean; // the pattern style is picked by the tool; otherwise `mode` is the user's choice
  mode: string;
  c0: number; // characters of run k0 left out at its start, and of run k1 at its end (B of BO3: c1 = 1)
  c1: number;
  start: number; // where it sits in the sample (characters)
  end: number;
  text: string;
  mode_used: string; // shape | flex | word | words | list
  fit: string; // what auto would pick
  eligible: boolean; // the text is letters then digits, so `prefix` can apply
  prefix_text: string;
  covers: Record<string, number>; // how many of `total` names each style's pattern fits
  total: number;
  pattern: string; // the value's own pattern
  fits: boolean;
  distinct: number; // what it reads from the matched names
  values: string[];
  type: string; // int | well | text
  hint: string | null;
}

export interface DetectToken {
  start: number;
  end: number;
  text: string;
  sep: boolean; // a separator (_ - . space): can't be labeled
  seg: number | null;
  k: number | null;
}

export interface DetectAnswer {
  sample: string;
  sample_index: number;
  total: number;
  tokens: DetectToken[]; // the sample cut into letter/digit groups and separators: what a selection snaps to
  fields: DetectField[];
  styles: Record<string, string>; // every pattern style, tightest first, with its name (lower case): what a field card offers
  pattern: string; // "" until something is labeled
  pieces: { text: string; field: string | null }[]; // the pattern in order, each group tagged with its field
  matched: number;
  unmatched_count: number;
  unmatched: { index: number; name: string }[]; // the first few
  rows: { index: number; name: string; values: Record<string, string | null> }[]; // the first few matches
  notes: string[];
}

// The names are not part of a request: the page hands them to the worker once (DetectClient.setNames).
export interface DetectRequest {
  sample_index?: number;
  from_index?: number; // the name the fields were made on, when the sample changes
  fields?: DetectField[];
  suggest?: boolean;
  add?: { name: string; start: number; end: number };
  remove?: string;
  rename?: { from: string; to: string };
  edit?: { name: string; mode?: string; prefix?: boolean };
  generalize?: boolean;
  anchor?: boolean;
}

// The messages between the page (client.ts) and the Python worker (worker.ts).
export type ToWorker = { id: number; type: "setNames"; names: string[] } | { id: number; type: "detect"; request: DetectRequest };

export type FromWorker =
  | { type: "ready" }
  // Python could not be started: every request will fail. `refused`: the browser will not run it, so trying again
  // cannot help; otherwise it did not arrive (the connection dropped).
  | { type: "failed"; error: string; refused: boolean }
  | { type: "reply"; id: number; ok: true; result: number | DetectAnswer }
  | { type: "reply"; id: number; ok: false; error: string; unexpected: boolean };
