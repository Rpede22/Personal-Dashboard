"use client";

import { useEffect, useState } from "react";

/**
 * Theme + density toggles for the dashboard. Both prefs are stamped onto
 * <html> as `data-theme` / `data-density` and the CSS variables in
 * globals.css react to them. Persisted to localStorage.
 */
type Theme = "dark" | "light";
type Density = "comfortable" | "compact";

const THEME_KEY = "dashboard.theme";
const DENSITY_KEY = "dashboard.density";

function loadTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}
function loadDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

export default function DashboardPrefs() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    setTheme(loadTheme());
    setDensity(loadDensity());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    try { localStorage.setItem(DENSITY_KEY, density); } catch { /* ignore */ }
  }, [density]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setDensity((d) => (d === "compact" ? "comfortable" : "compact"))}
        title={density === "compact" ? "Switch to comfortable" : "Switch to compact"}
        className="text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1 hover:brightness-110"
        style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
      >
        {density === "compact" ? "▤" : "▥"}
        <span>{density === "compact" ? "Compact" : "Comfortable"}</span>
      </button>
      <button
        type="button"
        onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        className="text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1 hover:brightness-110"
        style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
      >
        <span>{theme === "dark" ? "🌙" : "☀️"}</span>
        <span>{theme === "dark" ? "Dark" : "Light"}</span>
      </button>
    </div>
  );
}
