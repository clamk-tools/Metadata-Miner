import { describe, expect, it } from "vitest";

import type { DetectToken } from "../python/contract";
import { cluster, clusters, snap } from "./selection";

// The tokens Python gives for a name (engine.tokens): parts split at _ - . space, each part cut into runs of
// letters, of digits, or of anything else.
function tokenize(name: string): DetectToken[] {
  const out: DetectToken[] = [];
  let seg = -1;
  for (const piece of name.match(/[^_\-.\s]+|[_\-.\s]+/g) ?? []) {
    const start = out.length ? out[out.length - 1].end : 0;
    if (/^[_\-.\s]/.test(piece)) {
      out.push({ start, end: start + piece.length, text: piece, sep: true, seg: null, k: null });
      continue;
    }
    seg += 1;
    let at = start;
    (piece.match(/[A-Za-z]+|\d+|[^A-Za-z\d]+/g) ?? []).forEach((run, k) => {
      out.push({ start: at, end: at + run.length, text: run, sep: false, seg, k });
      at += run.length;
    });
  }
  return out;
}

const PLATE = "plate1_B03_s2_w1_DAPI.tif";
const FITC = "A - 08(fld 4 wv Blue - FITC).tif";
const text = (name: string, range: { start: number; end: number } | null) => (range ? name.slice(range.start, range.end) : null);

describe("snap", () => {
  it("takes every group a drag touches, whichever way it was dragged", () => {
    const tokens = tokenize(PLATE);
    const from = PLATE.indexOf("03") + 1; // the "3" of B03
    const to = PLATE.indexOf("s2"); // the "s" of s2

    expect(text(PLATE, snap(tokens, from, to))).toBe("03_s");
    expect(text(PLATE, snap(tokens, to, from))).toBe("03_s");
  });

  it("selects the one group under a press", () => {
    const tokens = tokenize(PLATE);

    expect(text(PLATE, snap(tokens, 7, 7))).toBe("B");
  });

  it("gives nothing for a separator alone", () => {
    expect(snap(tokenize(PLATE), 6, 6)).toBeNull();
  });
});

describe("cluster", () => {
  it("selects the letters and digits around a click", () => {
    const tokens = tokenize(PLATE);

    expect(text(PLATE, cluster(tokens, PLATE.indexOf("03")))).toBe("B03");
    expect(text(PLATE, cluster(tokens, PLATE.indexOf("s2")))).toBe("s2");
    expect(text(PLATE, cluster(tokens, 0))).toBe("plate1");
  });

  it("stops at a bracket", () => {
    const tokens = tokenize(FITC);

    expect(text(FITC, cluster(tokens, FITC.indexOf("08")))).toBe("08");
    expect(text(FITC, cluster(tokens, FITC.indexOf("fld")))).toBe("fld");
    expect(text(FITC, cluster(tokens, FITC.indexOf("FITC")))).toBe("FITC");
    expect(text(FITC, cluster(tokens, FITC.indexOf("(")))).toBe("(");
  });

  it("gives nothing on a separator", () => {
    expect(cluster(tokenize(PLATE), 6)).toBeNull();
  });
});

describe("clusters", () => {
  it("lists every part that can be labeled, in order", () => {
    expect(clusters(tokenize(PLATE)).map((c) => c.text)).toEqual(["plate1", "B03", "s2", "w1", "DAPI", "tif"]);
  });

  it("leaves out brackets on their own", () => {
    expect(clusters(tokenize(FITC)).map((c) => c.text)).toEqual(["A", "08", "fld", "4", "wv", "Blue", "FITC", "tif"]);
  });
});
