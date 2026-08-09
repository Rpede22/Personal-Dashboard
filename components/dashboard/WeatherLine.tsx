"use client";

import { useEffect, useState } from "react";

/** Small weather line at the top of the Today briefing. Uses open-meteo
 *  (no API key). Coords are hardcoded to Esbjerg — swap them out if you
 *  move. Refreshes hourly. */

// Aarhus C, DK
const LAT = 56.1572;
const LON = 10.2107;

const WMO_ICON: Array<{ codes: number[]; icon: string; label: string }> = [
  { codes: [0], icon: "☀️", label: "Clear" },
  { codes: [1, 2], icon: "🌤️", label: "Partly cloudy" },
  { codes: [3], icon: "☁️", label: "Cloudy" },
  { codes: [45, 48], icon: "🌫️", label: "Fog" },
  { codes: [51, 53, 55, 56, 57], icon: "🌦️", label: "Drizzle" },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], icon: "🌧️", label: "Rain" },
  { codes: [71, 73, 75, 77, 85, 86], icon: "🌨️", label: "Snow" },
  { codes: [95, 96, 99], icon: "⛈️", label: "Thunder" },
];

function decode(code: number): { icon: string; label: string } {
  const hit = WMO_ICON.find((e) => e.codes.includes(code));
  return hit ?? { icon: "🌡️", label: "Weather" };
}

interface Weather {
  icon: string;
  label: string;
  high: number;
  low: number;
  rainChance: number;
}

export default function WeatherLine() {
  const [w, setW] = useState<Weather | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
          `&current=weather_code` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
          `&timezone=Europe%2FCopenhagen`;
        const res = await fetch(url);
        if (!res.ok) return;
        const j = await res.json();
        const code = (j?.daily?.weather_code?.[0] ?? j?.current?.weather_code ?? 0) as number;
        const high = Math.round(j?.daily?.temperature_2m_max?.[0] ?? 0);
        const low = Math.round(j?.daily?.temperature_2m_min?.[0] ?? 0);
        const rain = Math.round(j?.daily?.precipitation_probability_max?.[0] ?? 0);
        const dec = decode(code);
        if (!cancelled) setW({ icon: dec.icon, label: dec.label, high, low, rainChance: rain });
      } catch {
        /* silent */
      }
    }

    load();
    const iv = setInterval(load, 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  if (!w) return null;

  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
      <span className="text-base">{w.icon}</span>
      <span>{w.label} · {w.low}°/{w.high}° · rain {w.rainChance}%</span>
    </div>
  );
}
