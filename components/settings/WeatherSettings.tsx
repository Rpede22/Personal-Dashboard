"use client";

import { useEffect, useState } from "react";
import {
  City, loadCities, saveCities, saveSelectedCity, useSelectedCity,
} from "@/lib/weather-city";

const ACCENT = "var(--accent-cyan)";

/**
 * Weather cities panel for the unified Settings modal (+ onboarding). Mirrors
 * the WeatherHub picker but lives in Settings so cities can be managed without
 * opening the hub. Shares `lib/weather-city.ts`, so the header WeatherLine, the
 * hub, and this panel all stay in sync live via the `weather-city-change` event.
 */
export default function WeatherSettings() {
  const selected = useSelectedCity();
  const [cities, setCities] = useState<City[]>([]);
  const [addName, setAddName] = useState("");
  const [results, setResults] = useState<City[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => { setCities(loadCities()); }, []);

  async function search() {
    const q = addName.trim();
    if (!q) return;
    setSearching(true); setSearched(true); setResults([]);
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=${encodeURIComponent(q)}`);
      const j = await res.json();
      const hits: City[] = (j?.results ?? []).map((r: { name: string; latitude: number; longitude: number; country_code?: string; admin1?: string }) => ({
        name: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
        lat: r.latitude,
        lon: r.longitude,
      }));
      setResults(hits);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }

  function addAndSelect(city: City) {
    const next = cities.some((c) => c.name === city.name) ? cities : [...cities, city];
    setCities(next);
    saveCities(next);
    saveSelectedCity(city);
    setAddName(""); setResults([]); setSearched(false);
  }
  function select(city: City) { saveSelectedCity(city); }
  function remove(city: City) {
    if (cities.length <= 1) return;
    const next = cities.filter((c) => !(c.lat === city.lat && c.lon === city.lon));
    setCities(next);
    saveCities(next);
    if (selected.lat === city.lat && selected.lon === city.lon) saveSelectedCity(next[0]);
  }

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Cities for the Weather widget + hub and the header weather line. The selected one drives everything; add any city (geocoded via open-meteo — no key).
      </p>

      {/* City list */}
      <div className="space-y-1">
        {cities.map((c) => {
          const isSel = c.lat === selected.lat && c.lon === selected.lon;
          return (
            <div key={`${c.lat},${c.lon}`} className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: isSel ? `${ACCENT}22` : "var(--surface-2)", border: `1px solid ${isSel ? ACCENT : "var(--border)"}` }}>
              <button onClick={() => select(c)} className="flex-1 text-left text-sm" style={{ color: isSel ? ACCENT : "var(--text)" }}>
                {c.name}
              </button>
              {isSel && <span className="text-xs" style={{ color: ACCENT }}>✓ selected</span>}
              {cities.length > 1 && (
                <button onClick={() => remove(c)} className="text-xs" style={{ color: "var(--accent-red)" }} title="Remove">✕</button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add via geocode */}
      <div className="rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Add a city</div>
        <div className="flex gap-2">
          <input
            type="text" placeholder="City name — e.g. Berlin"
            value={addName} onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(); }}
            className="text-sm px-2 py-1.5 rounded-md flex-1" style={inputStyle}
          />
          <button onClick={search} disabled={searching || !addName.trim()} className="text-sm px-3 py-1.5 rounded-md disabled:opacity-40"
            style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>{searching ? "…" : "Search"}</button>
        </div>
        {searched && !searching && results.length === 0 && (
          <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>No matches — try a different spelling.</div>
        )}
        {results.length > 0 && (
          <div className="mt-2 space-y-1">
            {results.map((r) => (
              <button key={`${r.lat},${r.lon}`} onClick={() => addAndSelect(r)}
                className="w-full text-left text-sm px-2 py-1.5 rounded-md"
                style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}>
                + {r.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
