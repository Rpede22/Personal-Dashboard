/**
 * Rejseplanen (Danish public transit) — client-safe types + keyed client.
 *
 * Uses **Rejseplanen API 2.0** (HAFAS ReST) — the old API 1.0 was shut down.
 * Needs a (free, bundled) key in `REJSEPLANEN_API_KEY`, requested via
 * https://labs.rejseplanen.dk/. The fetch helpers read that env var, so they run
 * **server-side only** and the key never reaches the client bundle. Types +
 * pure display helpers below are client-safe (no `fs`, no key).
 *
 * Base: https://www.rejseplanen.dk/api  ·  ?accessId=KEY&format=json
 *   location.name?input=<q>     → stop search
 *   departureBoard?id=<stopId>  → live departures (with realtime rt* fields)
 */

export interface TransitStop {
  id: string;    // HAFAS location id (opaque; used as departureBoard `id`)
  name: string;
  lat?: number;
  lon?: number;
}

export interface TransitDeparture {
  line: string;         // e.g. "Bus 5C", "Re 4712", "M3"
  kind: TransitKind;    // coarse category for the icon
  direction: string;    // headsign / final destination
  plannedISO: string;   // scheduled departure, ISO
  realISO?: string;      // realtime departure, ISO (when known)
  delayMin: number;     // realtime − planned, minutes (0 when on time / unknown)
  track?: string;       // platform / stand
  cancelled?: boolean;
}

export type TransitKind = "bus" | "stog" | "metro" | "train" | "other";

export interface TransitBoard {
  stopId: string;
  stopName: string;
  departures: TransitDeparture[];
  needsKey?: boolean;
  needsStop?: boolean;
  error?: string;
}

/** Icon for a transit kind. */
export const TRANSIT_ICON: Record<TransitKind, string> = {
  bus: "🚌", stog: "🚆", metro: "Ⓜ️", train: "🚂", other: "🚊",
};

/* ───────────────────────────── keyed client ───────────────────────────── */

const BASE = "https://www.rejseplanen.dk/api";

export function hasTransitKey(): boolean {
  return !!process.env.REJSEPLANEN_API_KEY;
}

function accessId(): string {
  return process.env.REJSEPLANEN_API_KEY ?? "";
}

async function apiFetch<T>(path: string, params: Record<string, string>, revalidate: number): Promise<T | null> {
  const qs = new URLSearchParams({ accessId: accessId(), format: "json", ...params });
  try {
    const res = await fetch(`${BASE}/${path}?${qs.toString()}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface RawStopLocation { id: string; extId?: string; name: string; lat?: number; lon?: number }
interface RawLocationWrap { StopLocation?: RawStopLocation }

/** Search stops by name. Needs a key. Returns [] on failure. */
export async function searchStops(query: string): Promise<TransitStop[]> {
  if (!hasTransitKey() || !query.trim()) return [];
  const data = await apiFetch<{ stopLocationOrCoordLocation?: RawLocationWrap[] }>(
    "location.name", { input: query.trim() }, 3600,
  );
  const list = data?.stopLocationOrCoordLocation ?? [];
  const stops: TransitStop[] = [];
  for (const wrap of list) {
    const s = wrap.StopLocation;
    if (!s) continue;
    stops.push({ id: s.id, name: s.name, lat: s.lat, lon: s.lon });
  }
  return stops;
}

interface RawDeparture {
  name?: string;
  type?: string;
  stop?: string;
  date?: string;    // "yyyy-mm-dd"
  time?: string;    // "HH:MM:SS"
  rtDate?: string;
  rtTime?: string;
  direction?: string;
  track?: string;
  rtTrack?: string;
  cancelled?: boolean;
  ProductAtStop?: { catOut?: string; catCode?: string };
}

/** Map a HAFAS type/name to a coarse kind for the icon. */
function classify(type?: string, name?: string): TransitKind {
  const t = (type ?? "").toUpperCase();
  const n = (name ?? "").toUpperCase();
  if (t === "S" || n.startsWith("S ") || /\bS-?TOG\b/.test(n)) return "stog";
  if (t === "M" || t === "METRO" || /^M\d/.test(n) || n.startsWith("METRO")) return "metro";
  if (t === "BUS" || n.startsWith("BUS") || n.includes("BUS")) return "bus";
  if (["IC", "ICL", "LYN", "RE", "REG", "TOG", "IR", "EC", "ICE"].includes(t) || n.startsWith("RE ") || n.startsWith("IC")) return "train";
  return "other";
}

/** Combine Rejseplanen date ("yyyy-mm-dd") + time ("HH:MM:SS") into an ISO string. */
function toISO(date?: string, time?: string): string | undefined {
  if (!date || !time) return undefined;
  // Rejseplanen returns local (Europe/Copenhagen) wall-clock; keep it naive-local.
  const t = time.length === 5 ? `${time}:00` : time;
  const d = new Date(`${date}T${t}`);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Live departures from a stop. Needs a key. Returns [] on failure. */
export async function fetchDepartures(stopId: string, max = 12): Promise<TransitDeparture[]> {
  if (!hasTransitKey()) return [];
  const data = await apiFetch<{ Departure?: RawDeparture[] }>(
    "departureBoard", { id: stopId, maxJourneys: String(max), duration: "120" }, 30,
  );
  const raw = data?.Departure ?? [];
  const out: TransitDeparture[] = [];
  for (const d of raw) {
    const plannedISO = toISO(d.date, d.time);
    if (!plannedISO) continue;
    const realISO = toISO(d.rtDate ?? d.date, d.rtTime);
    let delayMin = 0;
    if (realISO) delayMin = Math.round((new Date(realISO).getTime() - new Date(plannedISO).getTime()) / 60000);
    out.push({
      line: d.name?.trim() || d.type || "?",
      kind: classify(d.type, d.name),
      direction: d.direction?.trim() || "",
      plannedISO,
      realISO,
      delayMin,
      track: d.rtTrack ?? d.track,
      cancelled: !!d.cancelled,
    });
  }
  // Soonest first by effective (realtime else planned) departure.
  out.sort((a, b) => new Date(a.realISO ?? a.plannedISO).getTime() - new Date(b.realISO ?? b.plannedISO).getTime());
  return out.slice(0, max);
}

/* ─────────────────────────── client-safe display ──────────────────────── */

/** Minutes from now until an ISO departure (negative = already gone). */
export function minutesUntil(iso: string, now = Date.now()): number {
  return Math.round((new Date(iso).getTime() - now) / 60000);
}

/** "now" / "3 min" / "14:52" (absolute once beyond ~59 min). */
export function departureLabel(iso: string, now = Date.now()): string {
  const m = minutesUntil(iso, now);
  if (m <= 0) return "now";
  if (m < 60) return `${m} min`;
  return new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}
