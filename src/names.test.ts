import { describe, expect, it } from "vitest";

import { baseName, extension, intake, namesFromText } from "./names";

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

  it("reads fifty thousand lines quickly", () => {
    const text = Array.from({ length: 50_000 }, (_, i) => `D:\\screen\\plate${i % 40}\\r${i}_s1_w1.tif`).join("\n"); // privacy-ok: invented path
    const began = performance.now();

    const result = intake(namesFromText(text));

    expect(result.names).toHaveLength(50_000);
    expect(performance.now() - began).toBeLessThan(1000);
  });
});

describe("extension", () => {
  it("is the last suffix, lower case, as HC-Flow reads it", () => {
    expect(extension("A01.TIF")).toBe(".tif");
    expect(extension("A01.ome.tiff")).toBe(".tiff");
    expect(extension("README")).toBe("");
    expect(extension(".tif")).toBe(""); // a hidden file, not an image called nothing
    expect(extension("name.")).toBe("");
  });
});

describe("intake", () => {
  it("keeps the images, sorted, and counts what it leaves out", () => {
    const result = intake(["B01.tif", "A01.TIF", "notes.txt", "Thumbs.db", "A02.png", "plate.nd2", "x.jpeg", "y.jpg", "z.tiff"]);

    expect(result.names).toEqual(["A01.TIF", "A02.png", "B01.tif", "x.jpeg", "y.jpg", "z.tiff"]);
    expect(result.given).toBe(9);
    expect(result.ignored).toBe(3);
    expect(result.ignoredExamples).toEqual(["notes.txt", "Thumbs.db", "plate.nd2"]);
    expect(result.sameStem).toBeNull();
  });

  it("keeps a repeated name once", () => {
    const result = intake(["A01.tif", "A02.tif", "A01.tif", "A01.tif"]);

    expect(result.names).toEqual(["A01.tif", "A02.tif"]);
    expect(result.given).toBe(4);
  });

  it("shows only a few of the ignored names", () => {
    const result = intake(Array.from({ length: 40 }, (_, i) => `f${i}.czi`));

    expect(result.ignored).toBe(40);
    expect(result.ignoredExamples).toHaveLength(5);
    expect(result.names).toEqual([]);
  });

  it("warns about two images that differ only by their extension or by case", () => {
    const result = intake(["a.tif", "a.png", "B.tif", "b.tif", "c.tif"]);

    expect(result.names).toHaveLength(5); // a warning, not a refusal: the pattern is still valid
    expect(result.sameStem).toEqual({ first: "a.png", second: "a.tif", count: 2 });
  });
});
