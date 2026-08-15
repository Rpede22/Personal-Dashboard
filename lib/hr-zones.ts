/**
 * Heart-rate zone breakdown for a run.
 *
 * Preferred: pass `zoneBoundaries` (5 lower-bound bpm values, one per zone)
 * fetched from Strava's `/athlete/zones` — bucketing then matches exactly
 * what the athlete sees on strava.com. When no boundaries are available we
 * fall back to Strava's default % model off an estimated max HR (higher of
 * `maxHrFloor` and the run's own peak sample).
 *
 * Strava default zone percentages of max HR (v3 API docs):
 *   Z1 Endurance: 0–72%
 *   Z2 Moderate:  72–82%
 *   Z3 Tempo:     82–87%
 *   Z4 Threshold: 87–92%
 *   Z5 Anaerobic: 92%+
 *
 * Sample rate: Strava's HR stream is 1 Hz aligned with the `time` stream
 * (also 1 Hz seconds-from-start). Bucket by counting seconds between samples.
 */

/** Default max-HR floor for the % fallback. Reasonable upper bound for an
 *  adult runner in their 20s; higher = tighter zones. */
export const DEFAULT_MAX_HR_FLOOR = 195;

/** Strava's default zone breakpoints as fractions of max HR. */
export const STRAVA_DEFAULT_ZONE_FRACTIONS = [0, 0.72, 0.82, 0.87, 0.92];

/** Derive the 5 lower-bound bpm values from Strava-shaped zone objects.
 *  Strava returns `[{min, max}, ..., {min, max: -1}]` where the last zone's
 *  max is -1 ("no upper limit"). We only need the lower bounds. */
export function boundariesFromStravaZones(
  zones: Array<{ min?: number; max?: number }> | undefined | null,
): number[] | null {
  if (!Array.isArray(zones) || zones.length !== 5) return null;
  const bounds = zones.map((z) => Number(z?.min));
  if (bounds.some((n) => !Number.isFinite(n) || n < 0)) return null;
  // Sanity: strictly ascending, and Z1 should start at 0 in practice.
  for (let i = 1; i < bounds.length; i++) if (bounds[i] <= bounds[i - 1]) return null;
  return bounds;
}

export interface HrZones {
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
  totalSec: number;
  maxHrEstimate: number;
  sampleCount: number;
}

/**
 * Bucket a Strava HR stream into Z1..Z5 seconds. Returns null when either
 * stream is missing or empty (a run with no HR watch).
 */
export function bucketHrZonesFromStreams(
  hrData: number[] | undefined,
  timeData: number[] | undefined,
  options: {
    /** Preferred: 5 lower-bound bpm values pulled from `/athlete/zones`. */
    zoneBoundaries?: number[] | null;
    /** Fallback floor for the % model when no boundaries are supplied. */
    maxHrFloor?: number;
  } = {},
): HrZones | null {
  if (!Array.isArray(hrData) || !Array.isArray(timeData) || hrData.length === 0 || timeData.length !== hrData.length) {
    return null;
  }

  const runMax = Math.max(...hrData);
  const { zoneBoundaries, maxHrFloor = DEFAULT_MAX_HR_FLOOR } = options;

  let bounds: number[];
  let maxHrEstimate: number;
  if (zoneBoundaries && zoneBoundaries.length === 5) {
    // Authoritative — matches strava.com exactly.
    bounds = zoneBoundaries;
    // Report the run's own peak here; the top zone has no formal cap in Strava.
    maxHrEstimate = runMax;
  } else {
    // Fallback: Strava's default % breakpoints against an estimated max HR.
    const maxHr = Math.max(maxHrFloor, runMax);
    bounds = STRAVA_DEFAULT_ZONE_FRACTIONS.map((f) => maxHr * f);
    maxHrEstimate = maxHr;
  }

  const zones: HrZones = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, totalSec: 0, maxHrEstimate, sampleCount: hrData.length };

  for (let i = 0; i < hrData.length; i++) {
    const hr = hrData[i];
    if (!(hr > 0)) continue;
    const dt = i === 0 ? 1 : Math.max(0, timeData[i] - timeData[i - 1]);
    zones.totalSec += dt;
    if      (hr < bounds[1]) zones.z1 += dt;
    else if (hr < bounds[2]) zones.z2 += dt;
    else if (hr < bounds[3]) zones.z3 += dt;
    else if (hr < bounds[4]) zones.z4 += dt;
    else                     zones.z5 += dt;
  }

  return zones.totalSec > 0 ? zones : null;
}

export function parseHrZones(json: string | null | undefined): HrZones | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    if (typeof obj?.totalSec !== "number" || obj.totalSec <= 0) return null;
    return obj as HrZones;
  } catch { return null; }
}

/** Human-readable per-zone label. */
export const ZONE_META: Record<keyof Pick<HrZones, "z1" | "z2" | "z3" | "z4" | "z5">, { label: string; color: string }> = {
  z1: { label: "Recovery",  color: "var(--accent-blue)" },
  z2: { label: "Easy",      color: "var(--accent-green)" },
  z3: { label: "Tempo",     color: "var(--accent-orange)" },
  z4: { label: "Threshold", color: "var(--accent-red)" },
  z5: { label: "VO2",       color: "var(--accent-purple)" },
};
