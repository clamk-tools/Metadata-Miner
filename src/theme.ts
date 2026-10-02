import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

// The key the hub and every Clamk tool share (one origin), so a choice made on one holds on the others.
const KEY = "clamk-tools:theme";

const root = () => document.documentElement;
const system = () => window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

// The system's setting until a theme is chosen; index.html has already put a stored choice on <html>.
function current(): Theme {
  const chosen = root().dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return system().matches ? "dark" : "light";
}

// A choice made in another tab (the hub, another tool) is taken up here too.
function onStorage(e: StorageEvent) {
  if (e.key !== KEY) return;
  if (e.newValue === "light" || e.newValue === "dark") root().dataset.theme = e.newValue;
  else delete root().dataset.theme;
  tell();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = system();
  media.addEventListener("change", listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("storage", onStorage);
  };
}

function choose(theme: Theme) {
  root().dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // storage is blocked: the choice holds for this visit
  }
  tell();
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  return [useSyncExternalStore(subscribe, current), choose];
}
