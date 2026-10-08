// Where the names come from: pasted text, one name or path per line. Only names are read: no file is opened, and
// nothing leaves the browser. The rules follow HC-Flow's folder listing: the same image
// extensions, sorted, and a check for two images that differ only by their extension.

export const IMAGE_EXTENSIONS = [".tif", ".tiff", ".png", ".jpg", ".jpeg"];

const EXAMPLES = 5; // how many of the ignored names are kept to show

export interface Intake {
  names: string[]; // what Detect learns from: sorted, each name once
  given: number; // how many names came in
  ignored: number; // left out because they are not images
  ignoredExamples: string[]; // the first few of them
  sameStem: { first: string; second: string; count: number } | null; // a.tif and a.png: HC-Flow refuses that folder
}

/** The extension as HC-Flow reads it (Python's Path.suffix, lower case): "" for a name with no dot or only a leading one. */
export function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot).toLowerCase() : "";
}

function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** The file name of a pasted line: the line may be a full path, quoted or not ("Copy as path" on Windows quotes it). */
export function baseName(line: string): string {
  const path = line.trim().replace(/^["']+|["']+$/g, "").trim();
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}

/** Pasted text, one name or path per line. */
export function namesFromText(text: string): string[] {
  return text.split(/\r\n|\r|\n/).map(baseName).filter((name) => name !== "");
}

/** The names Detect will learn from (a name found twice is kept once), and what was left out. */
export function intake(candidates: string[]): Intake {
  const kept = new Set<string>();
  const ignoredExamples: string[] = [];
  let ignored = 0;
  for (const name of candidates) {
    if (IMAGE_EXTENSIONS.includes(extension(name))) kept.add(name);
    else {
      ignored += 1;
      if (ignoredExamples.length < EXAMPLES && !ignoredExamples.includes(name)) ignoredExamples.push(name);
    }
  }
  const names = [...kept].sort();

  const stems = new Map<string, string>();
  const clashes: [string, string][] = [];
  for (const name of names) {
    const key = stem(name).toLowerCase();
    const first = stems.get(key);
    if (first === undefined) stems.set(key, name);
    else clashes.push([first, name]);
  }
  const sameStem = clashes.length ? { first: clashes[0][0], second: clashes[0][1], count: clashes.length } : null;
  return { names, given: candidates.length, ignored, ignoredExamples, sameStem };
}
