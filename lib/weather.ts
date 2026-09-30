/**
 * Weather source blending (server-only). The dashboard's weather comes from
 * open-meteo (keyless, global, 7-day + UV + sunrise + WMO codes). For Danish
 * locations we overlay **DMI** — the Danish Met Institute's HARMONIE model
 * (`opendataapi.dmi.dk`, keyless since 2026) — onto the near-term hours, since
 * it's the more trusted local short-range forecast. DMI only covers ~2.5 days
 * and doesn't publish UV / rain-probability / sunrise / WMO codes, so it's an
 * overlay (temperature · wind · derived condition icon), not a replacement:
 * open-meteo still supplies the 7-day tail and the fields DMI lacks.
 *
 * The `/api/weather` route forwards the caller's open-meteo query verbatim, then
 * runs `overlayDmi` on the result — so every existing weather consumer keeps the
 * exact open-meteo response shape it already parses, just with DMI-accurate
 * near-term values for DK and a `source` field for the UI badge.
 */

const DMI_BASE = "https://opendataapi.dmi.dk/v1/forecastedr/collections/harmonie_dini_sf/position";

/** Rough Denmark bounding box (mainland + Bornholm). */
export function inDenmark(lat: number, lon: number): boolean {
  return lat >= 54.4 && lat <= 58.0 && lon >= 7.7 && lon <= 15.6;
}

const K = 273.15;
const hourIndex = (ms: number) => Math.floor(ms / 3_600_000);

interface DmiHour { tempC: number; windMs: number; cloudPct: number; precipMm: number; humidity: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dmiValues(cov: any, param: string): number[] {
  const r = cov?.ranges?.[param];
  return Array.isArray(r?.values) ? (r.values as number[]) : [];
}

// DMI (keyless) rate-limits bursts hard — several weather widgets loading the
// same city at once will 429. Cache the parsed hourly map per rounded coord for
// 30 min and de-dupe concurrent fetches so we hit DMI at most once per city.
type DmiMap = Map<number, DmiHour>;
const DMI_TTL = 30 * 60 * 1000;
const dmiCache = new Map<string, { data: DmiMap | null; ts: number }>();
const dmiInflight = new Map<string, Promise<DmiMap | null>>();

async function fetchDmi(lat: number, lon: number): Promise<DmiMap | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = dmiCache.get(key);
  if (cached && Date.now() - cached.ts < DMI_TTL) return cached.data;
  const existing = dmiInflight.get(key);
  if (existing) return existing;
  const p = fetchDmiUncached(lat, lon)
    .then((data) => {
      // Only cache a success; a null (429/parse fail) is retried next call.
      if (data) dmiCache.set(key, { data, ts: Date.now() });
      return data;
    })
    .finally(() => { dmiInflight.delete(key); });
  dmiInflight.set(key, p);
  return p;
}

/** Fetch DMI HARMONIE hourly for a point → map keyed by UTC hour-index. */
async function fetchDmiUncached(lat: number, lon: number): Promise<DmiMap | null> {
  const params = "temperature-2m,wind-speed-10m,fraction-of-cloud-cover,total-precipitation,relative-humidity-2m";
  const url = `${DMI_BASE}?coords=POINT(${lon}%20${lat})&crs=crs84&parameter-name=${params}`;
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const cov = await res.json();
    const times: string[] = cov?.domain?.axes?.t?.values ?? [];
    if (times.length === 0) return null;
    const temp = dmiValues(cov, "temperature-2m");
    const wind = dmiValues(cov, "wind-speed-10m");
    const cloud = dmiValues(cov, "fraction-of-cloud-cover");
    const precipTotal = dmiValues(cov, "total-precipitation");
    const hum = dmiValues(cov, "relative-humidity-2m");

    const map = new Map<number, DmiHour>();
    for (let i = 0; i < times.length; i++) {
      const ms = Date.parse(times[i]);
      if (!isFinite(ms)) continue;
      // total-precipitation may be accumulated from run start; per-hour = diff,
      // and if that goes negative the field is already per-step → use it raw.
      let precip = 0;
      if (i > 0 && precipTotal[i] != null && precipTotal[i - 1] != null) {
        precip = precipTotal[i] - precipTotal[i - 1];
        if (precip < 0) precip = precipTotal[i];
      } else if (precipTotal[i] != null) {
        precip = precipTotal[i];
      }
      map.set(hourIndex(ms), {
        tempC: temp[i] != null ? temp[i] - K : NaN,
        windMs: wind[i] ?? NaN,
        cloudPct: cloud[i] ?? NaN,
        precipMm: Math.max(0, precip),
        humidity: hum[i] ?? NaN,
      });
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
}

/** Derive a WMO-style weather code from DMI cloud cover + precipitation + temp. */
function deriveCode(h: DmiHour): number {
  const rain = h.precipMm;
  const snowy = !isNaN(h.tempC) && h.tempC <= 0.5;
  if (rain >= 0.3) {
    if (snowy) return rain >= 1 ? 73 : 71;       // snow
    if (rain >= 2.5) return 65;                    // heavy rain
    if (rain >= 0.8) return 63;                    // moderate rain
    return 61;                                      // light rain
  }
  const c = h.cloudPct;
  if (isNaN(c)) return 3;
  if (c < 13) return 0;    // clear
  if (c < 50) return 1;    // mainly clear
  if (c < 88) return 2;    // partly cloudy
  return 3;                // overcast
}

/** Apparent temperature: wind chill below 10 °C, a light humidity bump above
 *  20 °C, else the air temp. A pragmatic stand-in for open-meteo's value. */
function feelsLike(tempC: number, windMs: number, humidity: number): number {
  if (isNaN(tempC)) return tempC;
  if (tempC <= 10 && windMs > 1.3) {
    const kmh = windMs * 3.6;
    const wc = 13.12 + 0.6215 * tempC - 11.37 * Math.pow(kmh, 0.16) + 0.3965 * tempC * Math.pow(kmh, 0.16);
    return Math.round(wc * 10) / 10;
  }
  if (tempC >= 20 && humidity > 60) {
    return Math.round((tempC + (humidity - 60) / 40) * 10) / 10; // mild mugginess bump
  }
  return tempC;
}

const round1 = (n: number) => (isNaN(n) ? n : Math.round(n * 10) / 10);

/**
 * Overlay DMI near-term values onto an open-meteo response IN PLACE. Aligns the
 * two by UTC hour (open-meteo times are local; `utc_offset_seconds` converts
 * them). Returns true when any overlay happened.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function overlayDmi(om: any, lat: number, lon: number): Promise<boolean> {
  if (!inDenmark(lat, lon)) return false;
  const dmi = await fetchDmi(lat, lon);
  if (!dmi) return false;

  const offset = typeof om.utc_offset_seconds === "number" ? om.utc_offset_seconds : 0;
  const toUtcHour = (localIso: string) => hourIndex(Date.parse(`${localIso.length === 16 ? localIso : localIso.slice(0, 16)}:00Z`) - offset * 1000);

  // ── Hourly overlay ────────────────────────────────────────────────────────
  const H = om.hourly;
  if (H && Array.isArray(H.time)) {
    for (let i = 0; i < H.time.length; i++) {
      const d = dmi.get(toUtcHour(H.time[i]));
      if (!d || isNaN(d.tempC)) continue;
      if (Array.isArray(H.temperature_2m)) H.temperature_2m[i] = round1(d.tempC);
      if (Array.isArray(H.wind_speed_10m) && !isNaN(d.windMs)) H.wind_speed_10m[i] = round1(d.windMs);
      if (Array.isArray(H.weather_code)) H.weather_code[i] = deriveCode(d);
      if (Array.isArray(H.apparent_temperature)) H.apparent_temperature[i] = round1(feelsLike(d.tempC, d.windMs, d.humidity));
      // DMI's actual precipitation (mm) — so the UI can show mm like dmi.dk.
      if (Array.isArray(H.precipitation) && !isNaN(d.precipMm)) H.precipitation[i] = round1(d.precipMm);
    }
  }

  // ── Current overlay (nearest DMI hour) ────────────────────────────────────
  const C = om.current;
  if (C && typeof C.time === "string") {
    const d = dmi.get(toUtcHour(C.time));
    if (d && !isNaN(d.tempC)) {
      if ("temperature_2m" in C) C.temperature_2m = round1(d.tempC);
      if ("wind_speed_10m" in C && !isNaN(d.windMs)) C.wind_speed_10m = round1(d.windMs);
      if ("weather_code" in C) C.weather_code = deriveCode(d);
      if ("apparent_temperature" in C) C.apparent_temperature = round1(feelsLike(d.tempC, d.windMs, d.humidity));
    }
  }

  // ── Daily hi/lo + code recompute from the overlaid hourly, for DMI-covered days ─
  const D = om.daily;
  if (D && Array.isArray(D.time) && H && Array.isArray(H.time)) {
    for (let di = 0; di < D.time.length; di++) {
      const date = D.time[di]; // local YYYY-MM-DD
      const temps: number[] = [];
      let covered = 0, middayCode: number | null = null;
      for (let i = 0; i < H.time.length; i++) {
        if (!H.time[i].startsWith(date)) continue;
        if (dmi.has(toUtcHour(H.time[i]))) {
          covered++;
          if (Array.isArray(H.temperature_2m) && H.temperature_2m[i] != null) temps.push(H.temperature_2m[i]);
          if (H.time[i].slice(11, 13) === "13" && Array.isArray(H.weather_code)) middayCode = H.weather_code[i];
        }
      }
      // Only override when DMI covers most of the day, else keep open-meteo.
      if (covered >= 18 && temps.length > 0) {
        if (Array.isArray(D.temperature_2m_max)) D.temperature_2m_max[di] = round1(Math.max(...temps));
        if (Array.isArray(D.temperature_2m_min)) D.temperature_2m_min[di] = round1(Math.min(...temps));
        if (Array.isArray(D.weather_code) && middayCode != null) D.weather_code[di] = middayCode;
      }
    }
  }

  return true;
}
