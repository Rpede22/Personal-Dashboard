/**
 * Historic weather lookup for a run, via open-meteo's Archive API.
 * Free, no key. Given an ISO timestamp + optional lat/lng, returns a compact
 * snapshot: temp, feels-like, wind, precip, WMO code + a human label.
 *
 * The archive endpoint's hourly data is aligned to whole hours in local time
 * (we request Europe/Copenhagen). We snap the run's start to the nearest
 * hour and grab that row.
 *
 * Returns null on any failure so callers can save the run without weather.
 */

// Aarhus C fallback for manual runs / activities without start_latlng.
const FALLBACK_LAT = 56.1572;
const FALLBACK_LON = 10.2107;

export interface RunWeather {
  tempC: number;
  feelsLikeC: number;
  windMs: number;
  rainMm: number;
  weatherCode: number;
  label: string;
  source: "archive" | "manual";
  lat: number;
  lon: number;
}

const WMO_LABEL: Array<{ codes: number[]; label: string }> = [
  { codes: [0], label: "Clear" },
  { codes: [1, 2], label: "Partly cloudy" },
  { codes: [3], label: "Cloudy" },
  { codes: [45, 48], label: "Fog" },
  { codes: [51, 53, 55, 56, 57], label: "Drizzle" },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], label: "Rain" },
  { codes: [71, 73, 75, 77, 85, 86], label: "Snow" },
  { codes: [95, 96, 99], label: "Thunder" },
];
function labelForCode(code: number): string {
  return WMO_LABEL.find((e) => e.codes.includes(code))?.label ?? "Weather";
}

/**
 * Fetch weather for a run start. `lat`/`lon` optional — falls back to Aarhus.
 * `startedAt` is any ISO string (Strava's activity `start_date`).
 * Returns null on network / parse failure; caller stores null.
 */
export async function fetchRunWeather(
  startedAt: string,
  lat?: number | null,
  lon?: number | null,
): Promise<RunWeather | null> {
  const start = new Date(startedAt);
  if (!isFinite(start.getTime())) return null;

  const useLat = typeof lat === "number" && !isNaN(lat) ? lat : FALLBACK_LAT;
  const useLon = typeof lon === "number" && !isNaN(lon) ? lon : FALLBACK_LON;
  const source: RunWeather["source"] = (typeof lat === "number" && typeof lon === "number") ? "archive" : "manual";

  // open-meteo archive needs a whole-day range; we request just the run's
  // local date and grab the hour matching the run start.
  const dateStr = start.toLocaleDateString("en-CA", { timeZone: "Europe/Copenhagen" }); // YYYY-MM-DD

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${useLat}&longitude=${useLon}` +
    `&start_date=${dateStr}&end_date=${dateStr}` +
    `&hourly=temperature_2m,apparent_temperature,wind_speed_10m,precipitation,weather_code` +
    `&wind_speed_unit=ms&timezone=Europe%2FCopenhagen`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const j = await res.json();
    const times: string[] = j?.hourly?.time ?? [];
    if (times.length === 0) return null;

    // Snap to the nearest hour in local time. open-meteo returns local iso
    // strings when timezone is set.
    const localHourIso = new Date(start).toLocaleString("sv-SE", { timeZone: "Europe/Copenhagen" })
      .slice(0, 13).replace(" ", "T") + ":00";
    const idx = times.findIndex((t) => t === localHourIso);
    const useIdx = idx >= 0 ? idx : 0;

    const code = Number(j.hourly.weather_code?.[useIdx] ?? 0);
    return {
      tempC: Math.round(Number(j.hourly.temperature_2m?.[useIdx] ?? 0)),
      feelsLikeC: Math.round(Number(j.hourly.apparent_temperature?.[useIdx] ?? 0)),
      windMs: Math.round(Number(j.hourly.wind_speed_10m?.[useIdx] ?? 0) * 10) / 10,
      rainMm: Math.round(Number(j.hourly.precipitation?.[useIdx] ?? 0) * 10) / 10,
      weatherCode: code,
      label: labelForCode(code),
      source,
      lat: useLat,
      lon: useLon,
    };
  } catch {
    return null;
  }
}

export function parseRunWeather(json: string | null | undefined): RunWeather | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    if (typeof obj?.tempC !== "number") return null;
    return obj as RunWeather;
  } catch { return null; }
}
