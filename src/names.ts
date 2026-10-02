// Where the names come from: dropped files, a dropped folder, or pasted text. Only names are read: no file is opened,
// and nothing leaves the browser. The rules follow HC-Flow's folder listing: the same image
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

export function namesFromFiles(files: Iterable<File>): string[] {
  return Array.from(files, (file) => file.name);
}

/** The names in what was dropped: files, folders (walked through their subfolders), or text. Call it from the drop
 *  handler itself: the browser only hands over the dropped entries while the event is being handled. */
export async function namesFromDrop(data: DataTransfer): Promise<string[]> {
  const entries: FileSystemEntry[] = [];
  const loose: string[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) loose.push(file.name);
    }
  }
  if (!entries.length && !loose.length) return data.files?.length ? namesFromFiles(data.files) : namesFromText(data.getData("text/plain"));
  return [...loose, ...(await walk(entries))];
}

/** Every file name under `entries`. A folder is read in batches: the browser gives about 100 entries per call, and an
 *  empty batch is the only sign that it is done. */
export async function walk(entries: FileSystemEntry[]): Promise<string[]> {
  const names: string[] = [];
  const queue = [...entries];
  while (queue.length) {
    const entry = queue.pop()!;
    if (entry.isFile) names.push(entry.name);
    if (!entry.isDirectory) continue;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      queue.push(...batch);
    }
  }
  return names;
}

/** The names Detect will learn from (a name found twice, as in two subfolders, is kept once), and what was left out. */
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
