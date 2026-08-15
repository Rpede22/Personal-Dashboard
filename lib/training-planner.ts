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
  runDaysPerWeek: RunDaysPerWeek; // how many actual run days (rest days fill the rest)
  suggestedTargetKm: number;      // auto-computed target BEFORE any override (for placeholder UI)
  suggestedComposition: PlanComposition; // template's session-type counts (for placeholder UI)
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

/** How many days per week the user actually wants to run. 3–6 supported. */
export type RunDaysPerWeek = 3 | 4 | 5 | 6;

/**
 * Explicit session counts for the week, overriding the template. Total must be
 * 0–7 (rest days fill the remainder). When provided, this wins over
 * `runDaysPerWeek` and the cutback/starter templates.
 */
export interface PlanComposition {
  easy: number;
  tempo: number;
  speed: number;
  long: number;
}

export interface PlanOptions {
  /** Override the auto-suggested weekly volume (km). Undefined = use the algorithm. */
  targetKmOverride?: number;
  /**
   * How many run days you want next week (3–6). Undefined = auto-choose based on
   * volume: starter → 3, regular ≤ 24 km → 4, ≤ 40 km → 5, > 40 km → 6.
   */
  runDaysPerWeek?: RunDaysPerWeek;
  /**
   * Explicit session-type counts. Overrides `runDaysPerWeek` + template entirely.
   * Distances are solved from `targetKm` using the same easy/tempo/long/speed
   * ratios as the template weeks.
   */
  composition?: PlanComposition;
}

/**
 * Generate a recommendation for next week's training. Called with the output of
 * computeWeeklyStats(runs, N) — the last entry is the current in-progress week.
 *
 * Baseline for the +10% / cutback logic is the average of the last
 * BASELINE_WEEKS *completed* weeks (not just last week), which is more stable
 * when training has been inconsistent. `lastWeekKm` is still returned for display.
 */
export function generateNextWeekPlan(recent: WeeklyStats[], opts: PlanOptions = {}): TrainingPlan {
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

  // Snapshot the auto-suggestion before an override rewrites `targetKm`
  const suggestedTargetKm = targetKm;

  // Manual override wins over the auto-suggestion.
  if (opts.targetKmOverride !== undefined && opts.targetKmOverride >= 0) {
    targetKm = round05(opts.targetKmOverride);
    reason = `Custom target: ${targetKm.toFixed(1)} km (auto-suggestion ${isStarter ? "was" : "would be"} shown as placeholder).`;
    isStarter = targetKm < 5;
  }

  const changePct = baselineKm > 0 ? ((targetKm - baselineKm) / baselineKm) * 100 : 0;

  // Auto-choose runDaysPerWeek if not specified: starter → 3, then scale with volume.
  const runDays: RunDaysPerWeek = opts.runDaysPerWeek ?? (
    isStarter    ? 3 :
    targetKm <= 24 ? 4 :
    targetKm <= 40 ? 5 : 6
  );

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

  // 3. Build the session breakdown — either from the user's explicit composition
  //    or from the framework template.
  const templateSessions = buildSessions(targetKm, isCutback, isStarter, runDays);
  const suggestedComposition = compositionOfSessions(templateSessions);
  const sessions = opts.composition
    ? buildSessionsFromComposition(targetKm, opts.composition)
    : templateSessions;

  return {
    targetKm,
    baselineKm,
    baselineWeeks,
    lastWeekKm,
    changePct,
    reason,
    isCutback,
    isStarter,
    runDaysPerWeek: runDays,
    suggestedTargetKm,
    suggestedComposition,
    sessions,
    warnings,
  };
}

/** Count each session type in a built week. Used to seed the composition UI. */
function compositionOfSessions(sessions: PlannedSession[]): PlanComposition {
  const c: PlanComposition = { easy: 0, tempo: 0, speed: 0, long: 0 };
  for (const s of sessions) {
    if (s.type === "rest") continue;
    c[s.type] += 1;
  }
  return c;
}

/** Round to nearest 0.5 km for realistic training numbers. */
function round05(x: number): number {
  return Math.round(x * 2) / 2;
}

const DAYS: DayName[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Build a Mon–Sun schedule following the "never do two hard sessions back-to-back"
 * rule and putting the long run on the weekend. Returns exactly 7 sessions, one per
 * day (rest days included). Filter out `type === "rest"` if you only want workouts.
 *
 * Templates by runDays:
 *   3 (beginner):    Tue Easy · Thu Easy · Sun Long                            (no quality — build the base first)
 *   4 (build):       Mon Easy · Wed Tempo · Fri Easy · Sun Long                (one quality session)
 *   5 (standard):    Mon Easy · Tue Speed · Wed Easy · Thu Tempo · Sun Long
 *   6 (advanced):    Mon Easy · Tue Speed · Wed Easy · Thu Tempo · Fri Easy · Sun Long
 *
 * Cutback (any runDays): drops the speed session, keeps tempo as the one quality
 *   stimulus, adds an extra rest day.
 * Starter (baseline < 5 km): always 3 easy runs, no quality regardless of runDays.
 */
function buildSessions(
  targetKm: number,
  isCutback: boolean,
  isStarter: boolean,
  runDays: RunDaysPerWeek,
): PlannedSession[] {
  const REST_DESC = "Full rest day — walk, mobility, sleep. Recovery is when adaptation happens.";
  const rest = (day: DayName): PlannedSession => ({
    type: "rest", distanceKm: 0, description: REST_DESC, day,
  });
  const easyDesc = "Truly easy — nasal-breathing pace. This is where most of your fitness is actually built.";

  // ── Starter: 3 easy runs, no quality, generous rest ─────────────────────────
  //    Overrides runDays — building the base is the priority. Long ≥ 1.4 × easy
  //    (matches the same ratio the regular weeks enforce).
  if (isStarter) {
    // total = 2·easy + 1.4·easy = 3.4·easy → easy = target / 3.4
    const easyStarter = round05(targetKm / 3.4);
    const longStarter = round05(easyStarter * 1.4);
    const layout: Array<{ day: DayName; type: SessionType; km: number }> = [
      { day: "Tue", type: "easy", km: easyStarter },
      { day: "Thu", type: "easy", km: easyStarter },
      { day: "Sun", type: "long", km: longStarter },
    ];
    return DAYS.map((d): PlannedSession => {
      const slot = layout.find((s) => s.day === d);
      if (!slot) return rest(d);
      if (slot.type === "long") {
        return { type: "long", distanceKm: slot.km, day: d, description: "Easy conversational pace. Your longest run of the week — this is where distance progress comes from." };
      }
      return { type: "easy", distanceKm: slot.km, day: d, description: "Easy conversational pace. Build the aerobic base before adding harder work." };
    });
  }

  const longSession = (km: number, day: DayName = "Sun", note?: string): PlannedSession => ({
    type: "long",
    distanceKm: km,
    description: note ?? "Easy conversational pace. Where most of your distance progress comes from.",
    day,
  });
  // Speed = fixed 3 km warmup + 10 × 400m intervals ≈ 4 km + small cooldown =
  // ~7 km total. Same shape every week regardless of target volume — intervals
  // are a stimulus, not a mileage bucket, so scaling them with the target
  // makes no physiological sense.
  const SPEED_KM = 7;
  const SPEED_DESC = "3 km easy warm-up, then 10 × 400 m fast with 200 m jog recovery. Short cool-down to close it out (~7 km total).";
  const speedSession = (day: DayName = "Tue"): PlannedSession => ({
    type: "speed",
    distanceKm: SPEED_KM,
    description: SPEED_DESC,
    day,
  });
  const tempoSession = (km: number, day: DayName): PlannedSession => ({
    type: "tempo",
    distanceKm: km,
    description: '20–30 min at "comfortably hard" pace. You should be able to speak short sentences, not full ones. Same total distance as your easy runs — same volume, harder effort.',
    day,
  });
  const easyOn = (day: DayName, km: number, desc: string = easyDesc): PlannedSession => ({
    type: "easy", distanceKm: km, description: desc, day,
  });

  // ── Distance rules (uniform across regular + cutback weeks) ─────────────────
  //   • long  ≥ 1.4 × easy  (long is always the biggest run of the week)
  //   • tempo = easy         (same volume, higher intensity)
  //   • speed = SPEED_KM     (fixed intervals, independent of target)
  //
  // Solving for easy from the target:
  //   total = long + tempo + speed + N·easy
  //         = 1.4·easy + easy + speed + N·easy
  //         = (2.4 + N)·easy + speed
  //   → easy = (target − speed) / (2.4 + N)
  //
  // The `hasSpeed` flag drops the speed line when the week doesn't include it
  // (cutback + 3/4-run weeks). A minimum easy of 3 km keeps very short target
  // weeks from producing 0-km runs.
  function easySize(target: number, easyCount: number, hasSpeed: boolean): number {
    const budget = Math.max(0, target - (hasSpeed ? SPEED_KM : 0));
    return Math.max(3, round05(budget / (2.4 + easyCount)));
  }

  // ── Cutback: one quality (tempo) session + easy + long, extra rest ──────────
  if (isCutback) {
    const cutbackEasy = Math.max(1, runDays - 2); // 1 tempo + 1 long + N easy
    const easyKm = easySize(targetKm, cutbackEasy, false);
    const longKm = round05(easyKm * 1.4);
    const tempoKm = Math.min(6, easyKm); // Cap tempo at 6 km — sustained "comfortably hard" beyond that stops being a tempo and becomes a race effort.

    const sessions: PlannedSession[] = [
      easyOn("Mon", easyKm),
      rest("Tue"),
      tempoSession(tempoKm, "Wed"),
      rest("Thu"),
      easyOn("Fri", easyKm),
      cutbackEasy >= 3 ? easyOn("Sat", easyKm, "Truly easy. Optional if legs feel heavy.") : rest("Sat"),
      longSession(longKm, "Sun", "Easy conversational pace. Shorter than usual — recovery focus."),
    ];
    return sessions;
  }

  // ── Regular week — layout depends on runDays ────────────────────────────────
  if (runDays === 3) {
    // 3 easy runs: Tue, Thu, Sun (long) — beginner-friendly, no quality yet
    const easyKm = easySize(targetKm, 2, false);
    const longKm = round05(easyKm * 1.4);
    return [
      rest("Mon"),
      easyOn("Tue", easyKm, "Easy conversational pace. Building your aerobic base."),
      rest("Wed"),
      easyOn("Thu", easyKm, "Easy conversational pace. Building your aerobic base."),
      rest("Fri"),
      rest("Sat"),
      longSession(longKm, "Sun"),
    ];
  }
  if (runDays === 4) {
    // 4 runs: one quality (tempo), 2 easy, 1 long — still no speed yet
    const easyKm = easySize(targetKm, 2, false);
    const longKm = round05(easyKm * 1.4);
    const tempoKm = Math.min(6, easyKm); // Cap tempo at 6 km — sustained "comfortably hard" beyond that stops being a tempo and becomes a race effort.
    return [
      easyOn("Mon", easyKm),
      rest("Tue"),
      tempoSession(tempoKm, "Wed"),
      rest("Thu"),
      easyOn("Fri", easyKm),
      rest("Sat"),
      longSession(longKm, "Sun"),
    ];
  }

  if (runDays === 5) {
    // 1 speed + 1 tempo + 2 easy + 1 long
    const easyKm = easySize(targetKm, 2, true);
    const longKm = round05(easyKm * 1.4);
    const tempoKm = Math.min(6, easyKm); // Cap tempo at 6 km — sustained "comfortably hard" beyond that stops being a tempo and becomes a race effort.
    return [
      easyOn("Mon", easyKm),
      speedSession("Tue"),
      easyOn("Wed", easyKm),
      tempoSession(tempoKm, "Thu"),
      rest("Fri"),
      rest("Sat"),
      longSession(longKm, "Sun"),
    ];
  }

  // runDays === 6 — 1 speed + 1 tempo + 3 easy + 1 long
  {
    const easyKm = easySize(targetKm, 3, true);
    const longKm = round05(easyKm * 1.4);
    const tempoKm = Math.min(6, easyKm); // Cap tempo at 6 km — sustained "comfortably hard" beyond that stops being a tempo and becomes a race effort.
    return [
      easyOn("Mon", easyKm),
      speedSession("Tue"),
      easyOn("Wed", easyKm),
      tempoSession(tempoKm, "Thu"),
      easyOn("Fri", easyKm),
      rest("Sat"),
      longSession(longKm, "Sun"),
    ];
  }
}

/**
 * Build a week from an explicit session-count composition. Distances follow
 * the same base-unit math as the framework templates:
 *   E = (target − speed·SPEED_KM) / (long·1.4 + tempo + easy)
 *   long = 1.4·E · tempo = E · easy = E · speed = SPEED_KM (fixed)
 *
 * Sessions are laid out on Mon–Sun by priority (long → Sun/Sat, speed →
 * Tue/Fri, tempo → Thu/Wed, easy → fills remaining) with a light no-two-hard-
 * adjacent pass. Extra sessions beyond 7 are dropped. A rest fills every
 * empty day so the returned array is always exactly 7 entries.
 */
export function buildSessionsFromComposition(
  targetKm: number,
  comp: PlanComposition,
): PlannedSession[] {
  const REST_DESC = "Full rest day — walk, mobility, sleep. Recovery is when adaptation happens.";
  const rest = (day: DayName): PlannedSession => ({
    type: "rest", distanceKm: 0, description: REST_DESC, day,
  });

  const clamp = (n: number) => Math.max(0, Math.floor(n));
  const c: PlanComposition = {
    easy:  clamp(comp.easy),
    tempo: clamp(comp.tempo),
    speed: clamp(comp.speed),
    long:  clamp(comp.long),
  };
  const total = c.easy + c.tempo + c.speed + c.long;
  if (total === 0) return DAYS.map(rest);

  const SPEED_KM = 7;
  const speedTotal = c.speed * SPEED_KM;
  const unitDenom = c.long * 1.4 + c.tempo + c.easy;
  const budget = Math.max(0, targetKm - speedTotal);
  const E = unitDenom > 0 ? Math.max(3, round05(budget / unitDenom)) : 0;
  const longKm  = round05(E * 1.4);
  const tempoKm = Math.min(6, E); // Cap tempo at 6 km — see comment in buildSessions().
  const easyKm  = E;

  // Priority day slots per type. The order encodes "put quality where it has
  // the most rest around it" — long anchors the weekend, speed opens the week,
  // tempo lands mid-late, easy fills the gaps.
  const PRIORITY: Record<Exclude<SessionType, "rest">, DayName[]> = {
    long:  ["Sun", "Sat", "Wed"],
    speed: ["Tue", "Fri", "Wed", "Thu"],
    tempo: ["Thu", "Wed", "Fri", "Sat", "Tue"],
    easy:  ["Mon", "Wed", "Fri", "Sat", "Thu", "Tue", "Sun"],
  };

  const placement = new Map<DayName, SessionType>();
  function place(type: Exclude<SessionType, "rest">, count: number) {
    let remaining = count;
    for (const day of PRIORITY[type]) {
      if (remaining === 0) break;
      if (placement.has(day)) continue;
      placement.set(day, type);
      remaining -= 1;
    }
    // If preferred slots ran out, fall back to any empty day
    if (remaining > 0) {
      for (const day of DAYS) {
        if (remaining === 0) break;
        if (placement.has(day)) continue;
        placement.set(day, type);
        remaining -= 1;
      }
    }
  }
  // Order matters — hardest first so long/speed/tempo grab their preferred slots
  place("long",  c.long);
  place("speed", c.speed);
  place("tempo", c.tempo);
  place("easy",  c.easy);

  // Light no-two-hard-adjacent pass: if a hard day sits next to another hard
  // day AND there's an easy elsewhere to swap with, swap them.
  const isHard = (t: SessionType | undefined) => t === "speed" || t === "tempo";
  for (let i = 0; i < DAYS.length - 1; i++) {
    const a = placement.get(DAYS[i]);
    const b = placement.get(DAYS[i + 1]);
    if (isHard(a) && isHard(b)) {
      const swapDay = DAYS.find((d) => placement.get(d) === "easy" && !isHard(placement.get(DAYS[DAYS.indexOf(d) - 1])) && !isHard(placement.get(DAYS[DAYS.indexOf(d) + 1])));
      if (swapDay) {
        placement.set(swapDay, b!);
        placement.set(DAYS[i + 1], "easy");
      }
    }
  }

  return DAYS.map((day): PlannedSession => {
    const type = placement.get(day);
    if (!type) return rest(day);
    switch (type) {
      case "long":  return { type: "long",  distanceKm: longKm,   day, description: "Easy conversational pace. Your longest run of the week — where distance progress comes from." };
      case "speed": return { type: "speed", distanceKm: SPEED_KM, day, description: "3 km easy warm-up, then 10 × 400 m fast with 200 m jog recovery. Short cool-down (~7 km total)." };
      case "tempo": return { type: "tempo", distanceKm: tempoKm,  day, description: '20–30 min at "comfortably hard" pace. Same total distance as easy runs — same volume, harder effort.' };
      case "easy":  return { type: "easy",  distanceKm: easyKm,   day, description: "Truly easy — nasal-breathing pace. This is where most of your fitness is actually built." };
      case "rest":  return rest(day);
    }
  });
}

/** Human-readable pace like "5:12/km" from seconds-per-km, or "—" if null. */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

/** Format a duration in seconds as `H:MM:SS` (or `M:SS` under an hour). */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface RacePrediction {
  predictedSeconds: number;
  predictedPaceSecPerKm: number;
  anchorRun: { date: string; distanceKm: number; durationSeconds: number };
  qualifyingRuns: number;
  weeksToRace: number | null;
  confidence: "low" | "medium" | "high";
  note: string;
}

/**
 * Predict a race-day time from recent training using the Riegel formula:
 *   T2 = T1 · (D2 / D1) ^ 1.06
 *
 * For every run in the last 90 days at ≥ max(3 km, 20% of race distance),
 * extrapolate it to the race distance and keep the fastest projection —
 * that naturally reflects current fitness.
 *
 * Returns `null` when there's nothing to predict from (no race distance set,
 * or no qualifying runs).
 */
export function predictRaceTime(
  runs: RunEntry[],
  raceDistanceKm: number | null | undefined,
  raceDate: Date | null,
): RacePrediction | null {
  if (!raceDistanceKm || raceDistanceKm <= 0) return null;

  const now = Date.now();
  const cutoff = now - 90 * 86400000;
  const minDistance = Math.max(3, raceDistanceKm * 0.2);

  const qualifying = runs.filter((r) => {
    if (!(r.distance > 0) || !(r.duration > 0)) return false;
    const t = new Date(r.date).getTime();
    if (!isFinite(t) || t < cutoff || t > now) return false;
    return r.distance >= minDistance;
  });

  if (qualifying.length === 0) return null;

  const RIEGEL = 1.06;
  let bestRun = qualifying[0];
  let bestProjected = qualifying[0].duration * Math.pow(raceDistanceKm / qualifying[0].distance, RIEGEL);
  for (const r of qualifying.slice(1)) {
    const proj = r.duration * Math.pow(raceDistanceKm / r.distance, RIEGEL);
    if (proj < bestProjected) {
      bestProjected = proj;
      bestRun = r;
    }
  }

  const weeksToRace = raceDate
    ? Math.max(0, Math.round((raceDate.getTime() - now) / (7 * 86400000)))
    : null;

  // Confidence: how close the anchor run's distance is to the race distance,
  // and how many qualifying efforts back it up. Rough heuristic — good enough
  // to warn the user when a 5 km run is extrapolated to a marathon.
  const ratio = bestRun.distance / raceDistanceKm;
  let confidence: RacePrediction["confidence"];
  if (ratio >= 0.6 && qualifying.length >= 3) confidence = "high";
  else if (ratio >= 0.35 && qualifying.length >= 2) confidence = "medium";
  else confidence = "low";

  const note =
    confidence === "low"
      ? `Low confidence — anchor run (${bestRun.distance.toFixed(1)} km) is a big extrapolation to ${raceDistanceKm} km. A longer training run will sharpen the prediction.`
      : confidence === "medium"
        ? `Riegel-extrapolated from your best recent ${bestRun.distance.toFixed(1)} km effort. A slightly longer run at that pace would raise confidence.`
        : `Riegel-extrapolated from your best recent ${bestRun.distance.toFixed(1)} km effort (${qualifying.length} qualifying runs in the last 90 days).`;

  return {
    predictedSeconds: bestProjected,
    predictedPaceSecPerKm: bestProjected / raceDistanceKm,
    anchorRun: { date: bestRun.date, distanceKm: bestRun.distance, durationSeconds: bestRun.duration },
    qualifyingRuns: qualifying.length,
    weeksToRace,
    confidence,
    note,
  };
}
