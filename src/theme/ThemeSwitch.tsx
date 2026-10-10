import { useTheme } from "./theme";

// The family's switch, with a sun or a moon in its knob: on is dark.
export function ThemeSwitch() {
  const [theme, choose] = useTheme();
  const dark = theme === "dark";
  return (
    <button type="button" className="theme-switch" role="switch" aria-checked={dark} aria-label="Dark theme" title={dark ? "Switch to light" : "Switch to dark"} onClick={() => choose(dark ? "light" : "dark")}>
      <span className="theme-knob">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {dark ? (
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </>
          )}
        </svg>
      </span>
    </button>
  );
}
