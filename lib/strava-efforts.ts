/**
 * Strava `best_efforts` normalisation. Strava returns an array like:
 *   [{ name: "5k", moving_time: 1234, elapsed_time: 1240, distance: 5000, ... }, …]
 * We keep only the buckets we care about, keyed by our PR-grid labels, so the
 * client can just look up `efforts[label]` for a best time.
 */

export type EffortLabel = "400m" | "5k" | "10k" | "Half" | "Marathon";

const NAME_MAP: Record<string, EffortLabel> = {
  "400m": "400m",
  "5k": "5k",
  "10k": "10k",
  "half-marathon": "Half",
  "marathon": "Marathon",
};

interface StoredEffort { name: EffortLabel; movingSec: number }
interface RawEffort { name?: unknown; moving_time?: unknown }

/** Filters + normalises Strava's raw `best_efforts` array. Returns [] on any
 *  parse issue (silent — the caller stores null and PR falls back to the
 *  whole-run heuristic). */
export function extractBestEfforts(raw: unknown): StoredEffort[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredEffort[] = [];
  for (const e of raw as RawEffort[]) {
    const rawName = String(e.name ?? "").toLowerCase();
    const label = NAME_MAP[rawName];
    if (!label) continue;
    const sec = Number(e.moving_time);
    if (!Number.isFinite(sec) || sec <= 0) continue;
    // Keep the fastest instance per bucket (Strava usually returns one per
    // activity, but a very long run occasionally logs two 5k efforts).
    const existing = out.find((x) => x.name === label);
    if (!existing || sec < existing.movingSec) {
      if (existing) existing.movingSec = sec;
      else out.push({ name: label, movingSec: sec });
    }
  }
  return out;
}

export type EffortsMap = Partial<Record<EffortLabel, number>>;

/** Parse a stored `bestEffortsJson` blob into `{ [label]: seconds }`. */
export function parseEffortsJson(json: string | null | undefined): EffortsMap {
  if (!json) return {};
  try {
    const arr = JSON.parse(json) as StoredEffort[];
    const map: EffortsMap = {};
    for (const e of arr) {
      if (typeof e?.name === "string" && Number.isFinite(e.movingSec)) {
        map[e.name as EffortLabel] = e.movingSec;
      }
    }
    return map;
  } catch { return {}; }
}
