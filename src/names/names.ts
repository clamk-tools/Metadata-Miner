// Where the names come from: pasted text, one name or path per line. Only names are read: no file is opened, and
// nothing leaves the browser.

/** The file name of a pasted line: the line may be a full path, quoted or not ("Copy as path" on Windows quotes it). */
export function baseName(line: string): string {
  const path = line.trim().replace(/^["']+|["']+$/g, "").trim();
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}

/** The names Detect learns from: one per line of pasted text, sorted, each once. */
export function namesFromText(text: string): string[] {
  const names = text.split(/\r\n|\r|\n/).map(baseName).filter((name) => name !== "");
  return [...new Set(names)].sort();
}
