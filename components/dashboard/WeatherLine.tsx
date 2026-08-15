"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSelectedCity } from "@/lib/weather-city";

/** Small weather line at the top of the Today briefing. Uses open-meteo
 *  (no API key). City is user-selectable via `/weather` — see
 *  `lib/weather-city.ts`. Refreshes hourly (or immediately when the
 *  selection changes). */

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
  feelsLike: number;      // current apparent temp (°C)
  windSpeedMs: number;    // current wind speed (m/s)
}

/** Rule-of-thumb outfit chip from feelsLike + wind + rain probability. Kept
 *  simple on purpose — no per-hour lookup, no fancy layering rules. */
function outfitChip(w: Weather): { icon: string; label: string } | null {
  let icon = "";
  let label = "";
  if (w.feelsLike < 0)       { icon = "🧥"; label = "Winter coat"; }
  else if (w.feelsLike < 8)  { icon = "🧥"; label = "Jacket weather"; }
  else if (w.feelsLike < 16) { icon = "👕"; label = "Light layer"; }
  else                       { icon = "👕"; label = "T-shirt weather"; }
  if (w.rainChance >= 40) label += " · ☔ umbrella";
  if (w.windSpeedMs >= 8) label += " · 💨 windproof";
  return { icon, label };
}

export default function WeatherLine() {
  const [w, setW] = useState<Weather | null>(null);
  const city = useSelectedCity();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
          `&current=weather_code,apparent_temperature,wind_speed_10m` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
          `&wind_speed_unit=ms` +
          `&timezone=Europe%2FCopenhagen`;
        const res = await fetch(url);
        if (!res.ok) return;
        const j = await res.json();
        const code = (j?.daily?.weather_code?.[0] ?? j?.current?.weather_code ?? 0) as number;
        const high = Math.round(j?.daily?.temperature_2m_max?.[0] ?? 0);
        const low = Math.round(j?.daily?.temperature_2m_min?.[0] ?? 0);
        const rain = Math.round(j?.daily?.precipitation_probability_max?.[0] ?? 0);
        const feels = Math.round(j?.current?.apparent_temperature ?? j?.daily?.temperature_2m_max?.[0] ?? 0);
        const wind = j?.current?.wind_speed_10m ?? 0;
        const dec = decode(code);
        if (!cancelled) setW({ icon: dec.icon, label: dec.label, high, low, rainChance: rain, feelsLike: feels, windSpeedMs: wind });
      } catch {
        /* silent */
      }
    }

    load();
    const iv = setInterval(load, 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [city.lat, city.lon]);

  // If the open-meteo fetch hasn't landed (or failed — happens in the
  // packaged Electron app if the network is flaky at launch), still render a
  // minimal "Weather →" link. Otherwise there'd be no way to reach the hub
  // and the whole feature would be invisible.
  if (!w) {
    return (
      <Link
        href="/weather"
        className="flex items-center gap-1 text-xs hover:opacity-80"
        style={{ color: "var(--text-muted)" }}
        title="Open Weather hub"
      >
        <span>🌦️ Weather</span>
        <span style={{ color: "var(--accent-cyan)" }}>→</span>
      </Link>
    );
  }
  const outfit = outfitChip(w);

  return (
    <Link
      href="/weather"
      className="flex flex-col gap-0.5 text-xs hover:opacity-80"
      style={{ color: "var(--text-muted)" }}
      title="Open Weather hub"
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{w.icon}</span>
        <span>{w.label} · {w.low}°/{w.high}° · rain {w.rainChance}%</span>
        <span style={{ color: "var(--accent-cyan)" }}>→</span>
      </div>
      {outfit && (
        <div className="flex items-center gap-1.5">
          <span>{outfit.icon}</span>
          <span>{outfit.label}</span>
        </div>
      )}
    </Link>
  );
}
