"use client";

import { useEffect, useMemo, useState } from "react";
import HubShell from "@/components/HubShell";
import {
  DEFAULT_CITIES,
  type City,
  loadCities,
  saveCities,
  saveSelectedCity,
  useSelectedCity,
} from "@/lib/weather-city";

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
  return WMO_ICON.find((e) => e.codes.includes(code)) ?? { icon: "🌡️", label: "Weather" };
}

interface Forecast {
  current: { tempC: number; feelsLikeC: number; windMs: number; weatherCode: number; uv: number };
  daily: Array<{
    date: string;      // YYYY-MM-DD
    high: number;
    low: number;
    rainChance: number;
    weatherCode: number;
    sunrise: string;   // HH:MM
    sunset: string;    // HH:MM
    daylightMinutes: number;
    uvMax: number;
  }>;
  hourly: Array<{
    isoTime: string;   // local iso
    tempC: number;
    feelsLikeC: number;
    rainChance: number;
    windMs: number;
    weatherCode: number;
  }>;
}

function toHourKey(iso: string): string { return iso.slice(0, 13); }
function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(d); t.setHours(0, 0, 0, 0);
  const days = Math.round((t.getTime() - today.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function fmtDaylight(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}

/** Season for a given Date (Northern hemisphere, meteorological seasons). */
export type Season = "winter" | "spring" | "summer" | "fall";
export function seasonFor(d: Date): Season {
  const m = d.getMonth(); // 0..11
  if (m === 11 || m <= 1) return "winter";  // Dec–Feb
  if (m <= 4)             return "spring";  // Mar–May
  if (m <= 7)             return "summer";  // Jun–Aug
  return "fall";                            // Sep–Nov
}

/** Score one hour for running given the season. Higher = better. Rules from
 *  the user: summer avoids the hottest sun; fall avoids rain and prefers
 *  warmth; winter prefers warmest + least snow; spring just wants warmth. */
export function scoreHourForRunning(
  h: { feelsLikeC: number; rainChance: number; windMs: number; weatherCode: number },
  season: Season,
): number {
  const rainPenalty = h.rainChance * 1.2;               // 0..120
  const windPenalty = Math.max(0, h.windMs - 4) * 4;    // gentle
  // WMO 71–86 = snow-family codes
  const snowPenalty = (h.weatherCode >= 71 && h.weatherCode <= 86) ? 40 : 0;

  let tempScore: number;
  switch (season) {
    case "summer":
      // Warm sun but not the peak. Ideal ~18 °C. Above 20 the sun beats you up.
      tempScore = -Math.abs(h.feelsLikeC - 18) * 4;
      return 100 + tempScore - rainPenalty - windPenalty;
    case "fall":
      // Warmer is better up to ~15 °C; prioritise dry.
      tempScore = -Math.max(0, 15 - h.feelsLikeC) * 3;
      return 100 + tempScore - rainPenalty * 1.5 - windPenalty;
    case "winter":
      // Warmth-and-no-snow rules the day. Anything below 2 °C punishes hard.
      tempScore = -Math.max(0, 5 - h.feelsLikeC) * 4;
      return 100 + tempScore - snowPenalty - rainPenalty - windPenalty;
    case "spring":
      // Just get warm.
      tempScore = -Math.max(0, 14 - h.feelsLikeC) * 3;
      return 100 + tempScore - rainPenalty - windPenalty;
  }
}

/** Score every hour 06–22 today by run-friendliness; pick the best 2h window.
 *  Scoring adapts to the current season — see `scoreHourForRunning`. */
function bestRunWindow(hourly: Forecast["hourly"], todayKey: string): { startIso: string; endIso: string; score: number } | null {
  const todayHours = hourly.filter((h) => h.isoTime.startsWith(todayKey));
  if (todayHours.length === 0) return null;
  const window = todayHours.filter((h) => {
    const hr = new Date(h.isoTime).getHours();
    return hr >= 6 && hr <= 21;
  });
  if (window.length < 2) return null;

  const season = seasonFor(new Date());
  let bestStart = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < window.length - 1; i++) {
    const s = scoreHourForRunning(window[i], season) + scoreHourForRunning(window[i + 1], season);
    if (s > bestScore) { bestScore = s; bestStart = i; }
  }
  return { startIso: window[bestStart].isoTime, endIso: window[bestStart + 1].isoTime, score: bestScore / 2 };
}

export default function WeatherHub() {
  const [data, setData] = useState<Forecast | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const selected = useSelectedCity();
  const [cities, setCities] = useState<City[]>(DEFAULT_CITIES);
  const [addName, setAddName] = useState("");
  const [geocodeResults, setGeocodeResults] = useState<City[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  useEffect(() => { setCities(loadCities()); }, []);

  async function searchCity() {
    const q = addName.trim();
    if (!q) return;
    setGeocoding(true);
    setGeocodeResults([]);
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=${encodeURIComponent(q)}`);
      const j = await res.json();
      const hits: City[] = (j?.results ?? []).map((r: { name: string; latitude: number; longitude: number; country_code?: string; admin1?: string }) => ({
        name: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
        lat: r.latitude,
        lon: r.longitude,
      }));
      setGeocodeResults(hits);
    } catch { setGeocodeResults([]); }
    finally { setGeocoding(false); }
  }

  function addAndSelect(city: City) {
    const next = cities.some((c) => c.name === city.name) ? cities : [...cities, city];
    setCities(next);
    saveCities(next);
    saveSelectedCity(city);
    setAddName("");
    setGeocodeResults([]);
  }
  function removeCity(city: City) {
    // Don't let the picker end up empty — keep at least one row.
    if (cities.length <= 1) return;
    const next = cities.filter((c) => !(c.lat === city.lat && c.lon === city.lon));
    setCities(next);
    saveCities(next);
    // If we removed the currently selected one, jump to the first remaining.
    if (selected.lat === city.lat && selected.lon === city.lon) saveSelectedCity(next[0]);
  }

  async function load() {
    setRefreshing(true);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${selected.lat}&longitude=${selected.lon}` +
        `&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code,uv_index` +
        `&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset,daylight_duration,uv_index_max` +
        `&wind_speed_unit=ms` +
        `&timezone=Europe%2FCopenhagen`;
      const res = await fetch(url);
      if (!res.ok) return;
      const j = await res.json();

      const daily: Forecast["daily"] = (j.daily?.time ?? []).map((_: string, i: number) => {
        const sunrise = new Date(j.daily.sunrise[i]);
        const sunset = new Date(j.daily.sunset[i]);
        return {
          date: j.daily.time[i],
          high: Math.round(j.daily.temperature_2m_max[i]),
          low: Math.round(j.daily.temperature_2m_min[i]),
          rainChance: Math.round(j.daily.precipitation_probability_max[i] ?? 0),
          weatherCode: j.daily.weather_code[i],
          sunrise: sunrise.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          sunset: sunset.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          daylightMinutes: Math.round((j.daily.daylight_duration[i] ?? 0) / 60),
          uvMax: Math.round((j.daily.uv_index_max[i] ?? 0) * 10) / 10,
        };
      });

      const hourly: Forecast["hourly"] = (j.hourly?.time ?? []).map((iso: string, i: number) => ({
        isoTime: iso,
        tempC: Math.round(j.hourly.temperature_2m[i]),
        feelsLikeC: Math.round(j.hourly.apparent_temperature[i] ?? j.hourly.temperature_2m[i]),
        rainChance: Math.round(j.hourly.precipitation_probability[i] ?? 0),
        windMs: j.hourly.wind_speed_10m[i] ?? 0,
        weatherCode: j.hourly.weather_code[i] ?? 0,
      }));

      setData({
        current: {
          tempC: Math.round(j.current?.temperature_2m ?? 0),
          feelsLikeC: Math.round(j.current?.apparent_temperature ?? 0),
          windMs: j.current?.wind_speed_10m ?? 0,
          weatherCode: j.current?.weather_code ?? 0,
          uv: Math.round((j.current?.uv_index ?? 0) * 10) / 10,
        },
        daily,
        hourly,
      });
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 60 * 60 * 1000);
    return () => clearInterval(iv);
  }, [selected.lat, selected.lon]);

  const todayKey = useMemo(() => new Date().toLocaleDateString("en-CA"), []); // YYYY-MM-DD local
  const tomorrowKey = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("en-CA");
  }, []);

  const todayHours = useMemo(() => data?.hourly.filter((h) => h.isoTime.startsWith(todayKey)) ?? [], [data, todayKey]);
  const tomorrowHours = useMemo(() => data?.hourly.filter((h) => h.isoTime.startsWith(tomorrowKey)) ?? [], [data, tomorrowKey]);

  const bestWindow = useMemo(() => (data ? bestRunWindow(data.hourly, todayKey) : null), [data, todayKey]);
  const todayDaily = data?.daily.find((d) => d.date === todayKey);
  // open-meteo's forecast starts at today, so we don't have a yesterday row in
  // the response. Approximate "delta vs yesterday" as `today − tomorrow` and
  // flip the sign (if tomorrow is longer, yesterday was ~one day shorter than
  // today too — matches solstice-progression direction in DK).
  // open-meteo's forecast starts at today, so we don't get yesterday's number
  // directly. The day-to-day daylight change is nearly linear in the temperate
  // zone, so `tomorrow − today` is a good stand-in for `today − yesterday`.
  const tomorrowDaylight = data?.daily[1]?.daylightMinutes;
  const daylightDelta = todayDaily && tomorrowDaylight != null
    ? tomorrowDaylight - todayDaily.daylightMinutes
    : null;

  const currentDecode = data ? decode(data.current.weatherCode) : null;

  return (
    <HubShell
      title="Weather"
      emoji="🌤️"
      color="var(--accent-cyan)"
      tabs={
        <div className="flex flex-wrap gap-2 items-center">
          {/* City chips — one per stored city, highlighted when selected. */}
          {cities.map((c) => {
            const active = c.lat === selected.lat && c.lon === selected.lon;
            return (
              <button
                key={`${c.lat},${c.lon}`}
                onClick={() => saveSelectedCity(c)}
                className="text-xs px-2 py-1 rounded-md group inline-flex items-center gap-1"
                style={{
                  background: active ? "var(--accent-cyan)22" : "var(--surface)",
                  color: active ? "var(--accent-cyan)" : "var(--text-muted)",
                  border: `1px solid ${active ? "var(--accent-cyan)" : "var(--border)"}`,
                }}
              >
                {c.name}
                {cities.length > 1 && (
                  <span
                    onClick={(e) => { e.stopPropagation(); removeCity(c); }}
                    className="opacity-0 group-hover:opacity-60 hover:opacity-100 text-[10px]"
                    style={{ color: "var(--accent-red)" }}
                    title="Remove this city"
                  >✕</span>
                )}
              </button>
            );
          })}
          {/* Add form — geocodes via open-meteo, no key. */}
          <input
            type="text"
            placeholder="Add city…"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") searchCity(); }}
            className="text-xs px-2 py-1 rounded-md w-32"
            style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
          />
          <button
            onClick={searchCity}
            disabled={!addName.trim() || geocoding}
            className="text-xs px-2 py-1 rounded-md"
            style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >{geocoding ? "…" : "Search"}</button>
          {geocodeResults.length > 0 && (
            <div className="w-full flex flex-wrap gap-1 mt-1">
              {geocodeResults.map((r) => (
                <button
                  key={`${r.lat},${r.lon}`}
                  onClick={() => addAndSelect(r)}
                  className="text-xs px-2 py-1 rounded-md"
                  style={{ background: "var(--accent-cyan)22", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }}
                >+ {r.name}</button>
              ))}
            </div>
          )}
          <button
            onClick={load}
            disabled={refreshing}
            className="ml-auto text-xs px-2 py-1 rounded-md"
            style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >{refreshing ? "↻…" : "↻ Refresh"}</button>
        </div>
      }
    >
      {!data ? (
        <p style={{ color: "var(--text-muted)" }}>Loading {selected.name} weather…</p>
      ) : (
        <div className="space-y-6 max-w-5xl mx-auto">

          {/* ── Now + best run window ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Now · {selected.name}</div>
              <div className="flex items-center gap-4">
                <div className="text-5xl">{currentDecode?.icon}</div>
                <div>
                  <div className="text-5xl font-bold" style={{ color: "var(--accent-cyan)" }}>{data.current.tempC}°</div>
                  <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {currentDecode?.label} · feels {data.current.feelsLikeC}°
                  </div>
                </div>
              </div>
              <div className="flex gap-4 text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                <span>💨 {data.current.windMs.toFixed(1)} m/s</span>
                <span>☀ UV {data.current.uv}</span>
                {todayDaily && <span>🌡 {todayDaily.low}° / {todayDaily.high}°</span>}
              </div>
            </div>

            <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: `1px solid var(--accent-green)44` }}>
              <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--accent-green)" }}>Best run window today</div>
              {bestWindow ? (
                <>
                  <div className="text-3xl font-bold">
                    {hourLabel(bestWindow.startIso)} → {hourLabel(bestWindow.endIso)}
                  </div>
                  <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                    Score {Math.round(bestWindow.score)}/100 · picked from 06–22 based on rain, temp, and wind.
                  </div>
                </>
              ) : (
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing left to score today — check tomorrow&apos;s hourly below.</div>
              )}
            </div>
          </div>

          {/* ── Hourly today ── */}
          {todayHours.length > 0 && (
            <HourlyStrip title="Today — hourly" hours={todayHours} />
          )}
          {tomorrowHours.length > 0 && (
            <HourlyStrip title="Tomorrow — hourly" hours={tomorrowHours} />
          )}

          {/* ── 7-day forecast ── */}
          <div>
            <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Next 7 days</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {data.daily.slice(0, 7).map((d) => {
                const dec = decode(d.weatherCode);
                const isToday = d.date === todayKey;
                return (
                  <div
                    key={d.date}
                    className="rounded-xl p-3 text-center"
                    style={{
                      background: "var(--surface)",
                      border: `1px solid ${isToday ? "var(--accent-cyan)" : "var(--border)"}`,
                    }}
                  >
                    <div className="text-xs font-semibold" style={{ color: isToday ? "var(--accent-cyan)" : "var(--text-muted)" }}>
                      {dayLabel(d.date)}
                    </div>
                    <div className="text-3xl my-1">{dec.icon}</div>
                    <div className="text-sm">
                      <span className="font-bold">{d.high}°</span>
                      <span style={{ color: "var(--text-muted)" }}> / {d.low}°</span>
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                      💧 {d.rainChance}% · UV {d.uvMax}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Sunrise / sunset / daylight ── */}
          {todayDaily && (
            <div className="rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Sunrise</div>
                <div className="text-2xl font-bold">🌅 {todayDaily.sunrise}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Sunset</div>
                <div className="text-2xl font-bold">🌇 {todayDaily.sunset}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Daylight</div>
                <div className="text-2xl font-bold">{fmtDaylight(todayDaily.daylightMinutes)}</div>
                {daylightDelta !== null && Math.abs(daylightDelta) >= 1 && (
                  <div className="text-[11px]" style={{ color: daylightDelta > 0 ? "var(--accent-green)" : "var(--accent-orange)" }}>
                    {daylightDelta > 0 ? "+" : ""}{daylightDelta} min vs yesterday
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
            Data: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="underline">open-meteo</a> (no API key). Coords: {selected.name} ({selected.lat.toFixed(3)}, {selected.lon.toFixed(3)}) · Refreshes every hour. Cities picker + geocoding via open-meteo.
          </p>
        </div>
      )}
    </HubShell>
  );
}

/** 24-hour scrollable strip; each cell shows time · icon · temp · rain%. */
function HourlyStrip({ title, hours }: { title: string; hours: Forecast["hourly"] }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>{title}</h3>
      <div className="rounded-2xl overflow-x-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex gap-1 p-2 min-w-max">
          {hours.map((h) => {
            const dec = decode(h.weatherCode);
            const key = toHourKey(h.isoTime);
            return (
              <div
                key={key}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md text-center min-w-[52px]"
                style={{ background: "var(--surface-2)" }}
                title={`Feels ${h.feelsLikeC}° · wind ${h.windMs.toFixed(1)} m/s`}
              >
                <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{hourLabel(h.isoTime)}</div>
                <div className="text-lg">{dec.icon}</div>
                <div className="text-sm font-semibold">{h.tempC}°</div>
                <div className="text-[10px]" style={{ color: h.rainChance >= 40 ? "var(--accent-blue)" : "var(--text-muted)" }}>
                  {h.rainChance}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
