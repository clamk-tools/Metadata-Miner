import { describe, expect, it } from "vitest";

import { baseName, namesFromText } from "./names";

describe("pasted text", () => {
  it("gives one name per line, whatever the line ending, without the blank lines", () => {
    expect(namesFromText("A01_s1.tif\r\nA02_s1.tif\n\n  B01_s1.tif  \rB02_s1.tif\n")).toEqual([
      "A01_s1.tif",
      "A02_s1.tif",
      "B01_s1.tif",
      "B02_s1.tif",
    ]);
  });

  it("keeps the file name of a path, Windows or not, quoted or not", () => {
    expect(baseName("C:\\data\\Plate 1\\A01_s1.tif")).toBe("A01_s1.tif"); // privacy-ok: invented path
    expect(baseName("/mnt/screens/plate1/A01_s1.tif")).toBe("A01_s1.tif");
    expect(baseName('"C:\\data\\Plate 1\\A - 08(fld 4 wv Blue - FITC).tif"')).toBe("A - 08(fld 4 wv Blue - FITC).tif"); // privacy-ok: invented path
    expect(baseName("A - 08(fld 4 wv Blue - FITC).tif")).toBe("A - 08(fld 4 wv Blue - FITC).tif");
  });

  it("drops a line that is only a folder", () => {
    expect(namesFromText("C:\\data\\plate1\\\nA01.tif")).toEqual(["A01.tif"]); // privacy-ok: invented path
  });

  it("keeps every name, whatever its extension, sorted and each once", () => {
    expect(namesFromText("B01.tif\nA01.nd2\nnotes.txt\nA01.nd2\nREADME")).toEqual(["A01.nd2", "B01.tif", "README", "notes.txt"]);
  });

  it("reads fifty thousand lines quickly", () => {
    const text = Array.from({ length: 50_000 }, (_, i) => `D:\\screen\\plate${i % 40}\\r${i}_s1_w1.tif`).join("\n"); // privacy-ok: invented path
    const began = performance.now();

    const names = namesFromText(text);

    expect(names).toHaveLength(50_000);
    expect(performance.now() - began).toBeLessThan(1000);
  });
});
