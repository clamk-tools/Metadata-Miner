// The pairs of doc/ARCHITECTURE.md section 10 that a test can hold: the same value written in two places, where a
// difference would not fail anything else, or only far from its cause. Each test reads the files as text.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** The first group of `pattern` in `text`; fails the test, naming the file, when it is not there. */
function find(text: string, pattern: RegExp, where: string): string {
  const match = pattern.exec(text);
  if (!match) throw new Error(`${where}: ${pattern} not found`);
  return match[1];
}

const all = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((m) => m[1]);

describe("the request to Python", () => {
  it("has the same keys in detect(), glue.run and DetectRequest", () => {
    const signature = find(read("py/engine.py"), /^def detect\(([\s\S]*?)\) -> dict:/m, "engine.py");
    const engine = all(signature, /^\s+(\w+):/gm).filter((name) => name !== "names");
    const glue = all(read("py/glue.py"), /request\.get\("(\w+)"/g);
    const request = find(read("src/python/contract.ts"), /interface DetectRequest \{([\s\S]*?)\n\}/, "contract.ts");
    const page = all(request, /^\s+(\w+)\?:/gm);

    expect(glue.sort()).toEqual([...engine].sort());
    expect(page.sort()).toEqual([...engine].sort());
  });
});

describe("the look", () => {
  const theme = read("src/styles/theme.css");
  const detect = read("src/styles/detect.css");

  it("has a colour class for each of the COLORS field colours", () => {
    const colors = Number(find(read("src/detect/DetectScreen.tsx"), /const COLORS = (\d+);/, "DetectScreen.tsx"));
    const classes = all(detect, /^\.g(\d+) \{/gm).map(Number);

    expect(classes).toEqual(Array.from({ length: colors }, (_, i) => i));
  });

  it("dims the controls after the same delay as SLOW_MS shows Working…", () => {
    const slow = find(read("src/detect/DetectScreen.tsx"), /const SLOW_MS = (\d+);/, "DetectScreen.tsx");

    expect(find(detect, /transition: opacity 0s linear (\d+)ms/, "detect.css")).toBe(slow);
  });

  it("writes the same dark colours for the system setting and for the switch", () => {
    const system = find(theme, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/, "theme.css");
    const chosen = find(theme, /^:root\[data-theme="dark"\] \{([^}]*)\}/m, "theme.css");
    const tokens = (block: string) => block.split(";").map((line) => line.trim()).filter(Boolean);

    expect(tokens(chosen)).toEqual(tokens(system));
  });

  it("has the background the theme tests look for", () => {
    const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
    const light = find(theme, /^:root \{[^}]*?--bg: (#[0-9a-f]{6});/m, "theme.css");
    const dark = find(theme, /^:root\[data-theme="dark"\] \{[^}]*?--bg: (#[0-9a-f]{6});/m, "theme.css");
    const e2e = read("e2e/detect.spec.ts");

    expect(find(e2e, /const LIGHT = "([^"]+)";/, "detect.spec.ts")).toBe(rgb(light));
    expect(find(e2e, /const DARK = "([^"]+)";/, "detect.spec.ts")).toBe(rgb(dark));
  });

  it("stores the theme under the same key before and after the page starts", () => {
    const key = find(read("src/theme/theme.ts"), /const KEY = "([^"]+)";/, "theme.ts");

    expect(read("public/boot.js")).toContain(`localStorage.getItem("${key}")`);
  });
});

describe("the tests", () => {
  it("hold the page and plain Python to the same patterns", () => {
    const python = read("py/tests/test_engine.py");
    const e2e = read("e2e/detect.spec.ts");

    const plate = find(python, /assert result\["pattern"\] == r"(\(\?P<Plate>[^"]+)"/, "test_engine.py");
    expect(find(e2e, /const PLATE_PATTERN = String\.raw`([^`]+)`;/, "detect.spec.ts")).toBe(plate);
    expect(find(e2e, /const WORDS = "([^"]+)";/, "detect.spec.ts")).toBe(find(python, /^WORDS = "([^"]+)"/m, "test_engine.py"));
  });

  it("take out of the policy the word the policy has", () => {
    expect(read("vite.config.ts")).toContain("'wasm-unsafe-eval'");
    expect(read("e2e/offline.spec.ts")).toContain("wasm-unsafe-eval");
  });
});

describe("the Python version", () => {
  it("is the one the pinned Pyodide ships, in CI and in the README", () => {
    const pyodide = find(read("package.json"), /"pyodide": "(\d+)\./, "package.json"); // 314.x is Python 3.14
    const python = `${pyodide[0]}.${pyodide.slice(1)}`;

    expect(find(read(".github/workflows/ci.yml"), /python-version: "([\d.]+)"/, "ci.yml")).toBe(python);
    expect(read("README.md")).toContain(`Python ${python}`);
  });
});
