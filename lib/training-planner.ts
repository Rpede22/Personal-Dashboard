/**
 * Training planner for the Running Hub.
 *
 * Reads the user's run log and derives:
 *  1. Weekly stats for the last N Mon–Sun weeks
 *  2. A recommendation for next week's total volume + session breakdown
 *
 * Framework used:
 *  - 80/20: ~80% easy, ~20% hard
 *  - Weekly structure: 1 long + 1 speed + 1 tempo + 2–3 easy
 *  - Progression: +10% max per week, cutback every 4th week (~-25%)
 *  - Long run ≈ 25–30% of weekly volume
 */

export interface RunEntry {
  date: string;      // ISO
  distance: number;  // km
  duration: number;  // seconds
}

export interface WeeklyStats {
  weekStart: Date;
  totalKm: number;
  runCount: number;
  longestKm: number;
  avgPaceSecPerKm: number | null; // distance-weighted average pace, null if no runs
}

export type SessionType = "long" | "speed" | "tempo" | "easy" | "rest";

/** Mon–Sun so the week reads left-to-right. */
export type DayName = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface PlannedSession {
  type: SessionType;
  distanceKm: number;
  description: string;
  day: DayName;
}

export interface TrainingPlan {
  targetKm: number;
  baselineKm: number;      // rolling average used to compute target
  baselineWeeks: number;   // how many recent weeks the baseline averaged
  lastWeekKm: number;      // for display alongside the rolling baseline
  changePct: number;       // % change from baseline
  reason: string;          // human-readable explanation
  isCutback: boolean;
  isStarter: boolean;      // true when we have no baseline to grow from
  sessions: PlannedSession[];
  warnings: string[];
}

/** Monday 00:00 local of the week containing `d`. */
export function mondayOf(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();               // 0=Sun … 6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + offset);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Extract the local-date parts of an ISO date and rebuild it at local midnight. */
function toLocalMidnight(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Compute per-week stats for the last `weeksBack` calendar weeks, oldest first.
 * `runs` may be in any order; entries with distance 0 or duration 0 are skipped.
 */
export function computeWeeklyStats(runs: RunEntry[], weeksBack: number = 8): WeeklyStats[] {
  const now = new Date();
  const thisMonday = mondayOf(now);

  const weeks: WeeklyStats[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekStart = new Date(thisMonday);
    weekStart.setDate(thisMonday.getDate() - i * 7);
    weeks.push({
      weekStart,
      totalKm: 0,
      runCount: 0,
      longestKm: 0,
      avgPaceSecPerKm: null,
    });
  }

  const startOfRange = weeks[0].weekStart.getTime();
  const paceAccum = new Map<number, { paceSum: number; distSum: number }>(); // key = week index

  for (const r of runs) {
    if (!(r.distance > 0) || !(r.duration > 0)) continue;
    const rd = toLocalMidnight(r.date);
    if (rd.getTime() < startOfRange) continue;
    const rMonday = mondayOf(rd);
    const diffWeeks = Math.round((rMonday.getTime() - startOfRange) / (7 * 86400000));
    const w = weeks[diffWeeks];
    if (!w) continue;

    w.totalKm += r.distance;
    w.runCount += 1;
    if (r.distance > w.longestKm) w.longestKm = r.distance;

    const pace = r.duration / r.distance;
    const acc = paceAccum.get(diffWeeks) ?? { paceSum: 0, distSum: 0 };
    acc.paceSum += pace * r.distance;
    acc.distSum += r.distance;
    paceAccum.set(diffWeeks, acc);
  }

  for (const [idx, acc] of paceAccum) {
    weeks[idx].avgPaceSecPerKm = acc.distSum > 0 ? acc.paceSum / acc.distSum : null;
  }

  return weeks;
}

/**
 * Detect a cutback week: after 3 consecutive up-weeks (each > previous), the 4th
 * should reduce volume by ~25% to allow adaptation. Also flag cutback if the LAST
 * completed week was already unusually high vs. its predecessors.
 */
function shouldCutBack(weeks: WeeklyStats[]): boolean {
  // Look at the last 3 completed weeks (exclude current in-progress week)
  const completed = weeks.slice(0, -1);
  if (completed.length < 3) return false;
  const [w1, w2, w3] = completed.slice(-3);
  const up12 = w2.totalKm > w1.totalKm * 1.02;
  const up23 = w3.totalKm > w2.totalKm * 1.02;
  return up12 && up23 && w3.totalKm > 0;
}

/**
 * Number of completed weeks averaged into the baseline. A rolling average smooths
 * over sporadic weeks so one skipped or one big week doesn't whipsaw the target.
 */
const BASELINE_WEEKS = 3;

/**
 * Generate a recommendation for next week's training. Called with the output of
 * computeWeeklyStats(runs, N) — the last entry is the current in-progress week.
 *
 * Baseline for the +10% / cutback logic is the average of the last
 * BASELINE_WEEKS *completed* weeks (not just last week), which is more stable
 * when training has been inconsistent. `lastWeekKm` is still returned for display.
 */
export function generateNextWeekPlan(recent: WeeklyStats[]): TrainingPlan {
  const warnings: string[] = [];
  const completed = recent.slice(0, -1); // drop the in-progress week
  const lastCompleted = completed[completed.length - 1];
  const lastWeekKm = lastCompleted?.totalKm ?? 0;

  // Rolling average of the last BASELINE_WEEKS completed weeks (zero weeks count
  // — a lazy week SHOULD drag the baseline down so the next target stays safe).
  const window = completed.slice(-BASELINE_WEEKS);
  const baselineWeeks = window.length;
  const baselineKm = baselineWeeks > 0
    ? window.reduce((s, w) => s + w.totalKm, 0) / baselineWeeks
    : 0;

  // 1. Decide next week's target volume
  let targetKm: number;
  let reason: string;
  let isCutback = false;
  let isStarter = false;

  if (baselineKm < 5) {
    // Not enough recent running to progress off of — bootstrap conservatively
    targetKm = Math.max(baselineKm * 1.2, 12);
    reason = baselineKm === 0
      ? "No recent running — starting with a conservative base to build from."
      : `Very light recent training (${baselineWeeks}-week avg: ${baselineKm.toFixed(1)} km). Starting with a conservative base to build from.`;
    isStarter = true;
  } else if (shouldCutBack(recent)) {
    targetKm = Math.round(baselineKm * 0.75 * 2) / 2;
    reason = `Cutback week — you've had 3 consecutive weeks of volume growth. Reduce by ~25% (from your ${baselineWeeks}-week avg of ${baselineKm.toFixed(1)} km) so your body absorbs the gains.`;
    isCutback = true;
  } else {
    targetKm = Math.round(baselineKm * 1.10 * 2) / 2;
    reason = `+10% on your ${baselineWeeks}-week rolling average (${baselineKm.toFixed(1)} km) — smoothed baseline is more stable than "last week only" when training is uneven.`;
  }

  const changePct = baselineKm > 0 ? ((targetKm - baselineKm) / baselineKm) * 100 : 0;

  // 2. Warn if last week's structure looked off
  if (!isStarter && lastCompleted) {
    if (lastCompleted.runCount > 0 && lastCompleted.longestKm / lastCompleted.totalKm < 0.20) {
      warnings.push("Your longest run last week was under 20% of your weekly volume — consider a proper long run next week.");
    }
    if (lastCompleted.runCount >= 3 && lastCompleted.longestKm / lastCompleted.totalKm > 0.55) {
      warnings.push("Your long run was more than half of your weekly volume — split it into 2–3 easier days to protect against injury.");
    }
    if (lastCompleted.runCount === 1) {
      warnings.push("You only ran once last week. Aim for 3–5 runs to build a real base.");
    }
  }

  // 3. Build the session breakdown from the target volume
  const sessions = buildSessions(targetKm, isCutback);

  return {
    targetKm,
    baselineKm,
    baselineWeeks,
    lastWeekKm,
    changePct,
    reason,
    isCutback,
    isStarter,
    sessions,
    warnings,
  };
}

/** Round to nearest 0.5 km for realistic training numbers. */
function round05(x: number): number {
  return Math.round(x * 2) / 2;
}

function buildSessions(targetKm: number, isCutback: boolean): PlannedSession[] {
  // Distribute total volume into 4–5 sessions following the 80/20 framework:
  //   long ≈ 30%   (long slow distance — endurance)
  //   speed ≈ 10%  (short + fast — reps)
  //   tempo ≈ 15%  (medium + comfortably hard)
  //   easy  ≈ 45%  (split into 2–3 days)
  //   → hard portion (speed + tempo) ≈ 25%, easy (long + easy days) ≈ 75%.
  //
  // On a cutback week, drop the speed session (only keep tempo as the quality
  // stimulus) and shift everything toward easy to maximise recovery.

  if (isCutback) {
    const longKm  = round05(targetKm * 0.30);
    const tempoKm = round05(targetKm * 0.20);
    const remaining = Math.max(0, targetKm - longKm - tempoKm);
    const easyEach = round05(remaining / 3);
    return [
      { type: "long",  distanceKm: longKm,  description: "Easy conversational pace. Shorter than usual — recovery focus." },
      { type: "tempo", distanceKm: tempoKm, description: "Comfortably hard — the quality stimulus for the week." },
      { type: "easy",  distanceKm: easyEach, description: "Truly easy — nasal-breathing pace." },
      { type: "easy",  distanceKm: easyEach, description: "Truly easy — nasal-breathing pace." },
      { type: "easy",  distanceKm: Math.max(0, remaining - easyEach * 2), description: "Truly easy. Optional if legs feel heavy." },
      { type: "rest",  distanceKm: 0,       description: "Full rest day — walk, mobility, sleep." },
    ];
  }

  const longKm  = round05(targetKm * 0.30);
  const speedKm = round05(targetKm * 0.10);
  const tempoKm = round05(targetKm * 0.15);
  const remaining = Math.max(0, targetKm - longKm - speedKm - tempoKm);
  const easyDays = remaining >= 12 ? 3 : 2;
  const easyEach = round05(remaining / easyDays);

  const sessions: PlannedSession[] = [
    {
      type: "long",
      distanceKm: longKm,
      description: "Easy conversational pace. Where most of your distance progress comes from.",
    },
    {
      type: "speed",
      distanceKm: speedKm,
      description: `Warm up, then intervals — e.g. 6–8 × 400 m fast with equal jog recovery, or 4 × 800 m at 5K pace. Total distance including warm-up/cool-down.`,
    },
    {
      type: "tempo",
      distanceKm: tempoKm,
      description: `20–30 min at "comfortably hard" pace. You should be able to speak short sentences, not full ones.`,
    },
  ];

  for (let i = 0; i < easyDays; i++) {
    sessions.push({
      type: "easy",
      distanceKm: easyEach,
      description: "Truly easy — nasal-breathing pace. This is where most of your fitness is actually built.",
    });
  }

  return sessions;
}

/** Human-readable pace like "5:12/km" from seconds-per-km, or "—" if null. */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}
