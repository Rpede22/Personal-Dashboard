"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";
import { useSelectedCity } from "@/lib/weather-city";
import { seasonFor, scoreHourForRunning } from "@/components/weather/WeatherHub";

/** Dashboard tile for the WeatherHub. Shows current conditions + today's
 *  hi/lo + the best 2 h window for a run (season-aware). Anything more
 *  detailed lives in [/weather](app/weather/page.tsx). */

const WMO: Record<number, { icon: string; label: string }> = {
  0: { icon: "☀️", label: "Clear" },
  1: { icon: "🌤️", label: "Mostly clear" },
  2: { icon: "🌤️", label: "Partly cloudy" },
  3: { icon: "☁️", label: "Cloudy" },
  45: { icon: "🌫️", label: "Fog" },
  48: { icon: "🌫️", label: "Fog" },
  51: { icon: "🌦️", label: "Drizzle" },
  61: { icon: "🌧️", label: "Rain" },
  63: { icon: "🌧️", label: "Rain" },
  65: { icon: "🌧️", label: "Heavy rain" },
  71: { icon: "🌨️", label: "Snow" },
  73: { icon: "🌨️", label: "Snow" },
  75: { icon: "🌨️", label: "Heavy snow" },
  80: { icon: "🌦️", label: "Showers" },
  95: { icon: "⛈️", label: "Thunder" },
};

interface Block {
  label: string;         // "16–20"
  tempC: number;         // avg feels-like across the block
  rainChance: number;    // max rain % across the block (worst-case)
  weatherCode: number;   // most common code in the block
}

interface Snapshot {
  tempC: number;
  feelsLikeC: number;
  high: number;
  low: number;
  rainChance: number;
  weatherCode: number;
  bestStartHour: number | null;
  bestEndHour: number | null;
  /** Next 24 h split into six 4-hour buckets, first bucket rounded down to
   *  the nearest 4h step from now. Keeps the strip aligned to whole hours. */
  blocks: Block[];
}

/** Pick the most-frequent weather code from an array; ties broken by first
 *  occurrence. */
function modeCode(codes: number[]): number {
  const counts = new Map<number, number>();
  let bestCode = codes[0] ?? 0;
  let bestCount = 0;
  for (const c of codes) {
    const n = (counts.get(c) ?? 0) + 1;
    counts.set(c, n);
    if (n > bestCount) { bestCount = n; bestCode = c; }
  }
  return bestCode;
}

export default function WeatherWidget() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const city = useSelectedCity();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // 2 forecast days gives us a rolling 24 h window even when it's late
        // in the day and the remaining hours today aren't enough on their own.
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
          `&current=temperature_2m,apparent_temperature,weather_code` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
          `&hourly=apparent_temperature,precipitation_probability,wind_speed_10m,weather_code` +
          `&forecast_days=2&wind_speed_unit=ms&timezone=Europe%2FCopenhagen`;
        const res = await fetch(url);
        if (!res.ok) return;
        const j = await res.json();
        const times: string[] = j?.hourly?.time ?? [];
        const feels: number[] = j?.hourly?.apparent_temperature ?? [];
        const rains: number[] = j?.hourly?.precipitation_probability ?? [];
        const winds: number[] = j?.hourly?.wind_speed_10m ?? [];
        const codes: number[] = j?.hourly?.weather_code ?? [];

        // Pick today's best 2 h window using the same seasonal scoring as
        // WeatherHub — keeps the tile in sync with the hub's "best window" panel.
        const season = seasonFor(new Date());
        const todayKey = new Date().toISOString().slice(0, 10);
        let bestScore = -Infinity;
        let bestHour: number | null = null;
        for (let h = 6; h <= 20; h++) {
          const kA = `${todayKey}T${String(h).padStart(2, "0")}:00`;
          const kB = `${todayKey}T${String(h + 1).padStart(2, "0")}:00`;
          const iA = times.indexOf(kA);
          const iB = times.indexOf(kB);
          if (iA < 0 || iB < 0) continue;
          const sA = scoreHourForRunning({ feelsLikeC: feels[iA], rainChance: rains[iA] ?? 0, windMs: winds[iA] ?? 0, weatherCode: codes[iA] ?? 0 }, season);
          const sB = scoreHourForRunning({ feelsLikeC: feels[iB], rainChance: rains[iB] ?? 0, windMs: winds[iB] ?? 0, weatherCode: codes[iB] ?? 0 }, season);
          const s = (sA + sB) / 2;
          if (s > bestScore) { bestScore = s; bestHour = h; }
        }

        // Build six 4-hour blocks starting at the next whole 4h step from now.
        // Rounding avoids a partial first block that ends "in 47 min".
        const now = new Date();
        const start = new Date(now);
        start.setMinutes(0, 0, 0);
        const startHour = Math.ceil(now.getHours() / 4) * 4;
        start.setHours(startHour, 0, 0, 0);

        const blocks: Block[] = [];
        for (let b = 0; b < 6; b++) {
          const blockStart = new Date(start.getTime() + b * 4 * 3600 * 1000);
          const temps: number[] = [];
          const rns: number[] = [];
          const cds: number[] = [];
          for (let h = 0; h < 4; h++) {
            const t = new Date(blockStart.getTime() + h * 3600 * 1000);
            const y = t.getFullYear();
            const mo = String(t.getMonth() + 1).padStart(2, "0");
            const d = String(t.getDate()).padStart(2, "0");
            const hh = String(t.getHours()).padStart(2, "0");
            const key = `${y}-${mo}-${d}T${hh}:00`;
            const idx = times.indexOf(key);
            if (idx < 0) continue;
            temps.push(feels[idx]);
            rns.push(rains[idx] ?? 0);
            cds.push(codes[idx] ?? 0);
          }
          if (temps.length === 0) continue;
          const avgTemp = temps.reduce((s, x) => s + x, 0) / temps.length;
          const maxRain = rns.reduce((s, x) => Math.max(s, x), 0);
          const label = `${String(blockStart.getHours()).padStart(2, "0")}–${String((blockStart.getHours() + 4) % 24).padStart(2, "0")}`;
          blocks.push({
            label,
            tempC: Math.round(avgTemp),
            rainChance: Math.round(maxRain),
            weatherCode: modeCode(cds),
          });
        }

        if (!cancelled) setSnap({
          tempC: Math.round(j?.current?.temperature_2m ?? 0),
          feelsLikeC: Math.round(j?.current?.apparent_temperature ?? 0),
          high: Math.round(j?.daily?.temperature_2m_max?.[0] ?? 0),
          low: Math.round(j?.daily?.temperature_2m_min?.[0] ?? 0),
          rainChance: Math.round(j?.daily?.precipitation_probability_max?.[0] ?? 0),
          weatherCode: j?.current?.weather_code ?? 0,
          bestStartHour: bestHour,
          bestEndHour: bestHour !== null ? bestHour + 2 : null,
          blocks,
        });
      } catch { /* silent */ }
    }
    load();
    const iv = setInterval(load, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [city.lat, city.lon]);

  const w = snap ? (WMO[snap.weatherCode] ?? { icon: "🌡️", label: "Weather" }) : null;

  return (
    <Card accentColor="var(--accent-cyan)">
      <CardHeader icon="🌦️" title="Weather" subtitle={city.name} accentColor="var(--accent-cyan)" />
      {snap === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <span className="text-4xl">{w?.icon}</span>
            <div className="flex-1">
              <div className="text-3xl font-bold tabular-nums">{snap.tempC}°</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                Feels like {snap.feelsLikeC}° · {w?.label}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs tabular-nums">
                <span style={{ color: "var(--accent-red)" }}>{snap.high}°</span>
                <span style={{ color: "var(--text-muted)" }}> / </span>
                <span style={{ color: "var(--accent-blue)" }}>{snap.low}°</span>
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                🌧️ {snap.rainChance}%
              </div>
            </div>
          </div>
          {snap.blocks.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
                Next 24 h
              </div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${snap.blocks.length}, minmax(0, 1fr))` }}>
                {snap.blocks.map((b, i) => {
                  const bw = WMO[b.weatherCode] ?? { icon: "🌡️", label: "" };
                  return (
                    <div
                      key={i}
                      title={`${b.label} · ${bw.label} · ${b.tempC}° · rain ${b.rainChance}%`}
                      className="flex flex-col items-center rounded-md px-1 py-1.5"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <span className="text-[9px] tabular-nums" style={{ color: "var(--text-muted)" }}>{b.label}</span>
                      <span className="text-base leading-none my-0.5">{bw.icon}</span>
                      <span className="text-[11px] font-semibold tabular-nums">{b.tempC}°</span>
                      {b.rainChance >= 20 && (
                        <span className="text-[9px] tabular-nums" style={{ color: "var(--accent-blue)" }}>💧{b.rainChance}%</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {snap.bestStartHour !== null && snap.bestEndHour !== null && (
            <div
              className="rounded-lg px-3 py-2 text-xs flex items-baseline gap-2"
              style={{ background: "var(--accent-cyan)15", border: "1px solid var(--accent-cyan)33" }}
            >
              <span style={{ color: "var(--accent-cyan)" }}>🏃 Best run window</span>
              <span className="ml-auto tabular-nums font-semibold">
                {String(snap.bestStartHour).padStart(2, "0")}:00–{String(snap.bestEndHour).padStart(2, "0")}:00
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
