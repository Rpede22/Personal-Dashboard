"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";
import { Skeleton, SkeletonList } from "@/components/Skeleton";

interface RecentRun {
  date: string;
  distance: number;
  duration: number;
}

interface UpcomingPlan {
  date: string;
  type: string;
  distance: number | null;
  notes: string | null;
}

interface RunSummary {
  recentRuns: RecentRun[];
  weeklyKm: number;
  weekPlannedKm: number;
  monthlyKm: number;
  thisMonthKm: number;
  thisYearKm: number;
  totalKm: number;
  totalRuns: number;
  raceDate: string | null;
  upcomingPlans: UpcomingPlan[];
}

/** Distance buckets used for PR detection. A run is a PR if its pace beats
 *  every prior run in the same bucket. Buckets grow gradually so a slow
 *  half-marathon isn't tested against a 5 k PB. */
const PR_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "5k",       min: 4.5,  max: 7.5 },
  { label: "10k",      min: 9,    max: 14 },
  { label: "half",     min: 19,   max: 24 },
  { label: "marathon", min: 40,   max: 44 },
];

function bucketFor(distance: number): string | null {
  for (const b of PR_BUCKETS) {
    if (distance >= b.min && distance <= b.max) return b.label;
  }
  return null;
}

const PLAN_COLOR: Record<string, string> = {
  easy: "var(--accent-green)",
  tempo: "var(--accent-orange)",
  long: "var(--accent-blue)",
  rest: "var(--text-muted)",
};

function pace(distKm: number, durationSec: number): string {
  if (distKm === 0) return "—";
  const secPerKm = durationSec / distKm;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

/** Heuristic — call a run "hard" if it's a long one (≥ 10 km) or fast
 *  (pace < 5:00 / km). Good enough for a recovery dot without needing
 *  session-type metadata on RunLog. */
function isHardRun(r: { distance: number; duration: number }): boolean {
  if (r.distance >= 10) return true;
  if (r.distance > 0 && r.duration / r.distance < 300) return true;
  return false;
}

/** Days since a run (date is UTC-midnight ISO). Uses local midnight for both
 *  sides so timezone shifts don't inflate the number. */
function daysSince(iso: string, now: Date = new Date()): number {
  const t = new Date(iso);
  const local = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - local.getTime()) / 86400000);
}

/** Recovery state from the last 3 runs. `red` — hard run today, `orange` —
 *  hard run in the last 2 days, `green` — otherwise well rested. */
function recoveryState(runs: { date: string; distance: number; duration: number }[]): { color: string; label: string } | null {
  if (!runs.length) return null;
  const hardRecent = runs
    .filter(isHardRun)
    .map((r) => daysSince(r.date))
    .sort((a, b) => a - b)[0];
  if (hardRecent === undefined) return { color: "var(--accent-green)", label: "Well rested" };
  if (hardRecent === 0) return { color: "var(--accent-red)", label: "Hard session today — take it easy" };
  if (hardRecent <= 2) return { color: "var(--accent-orange)", label: `Recovering (${hardRecent}d since hard)` };
  return { color: "var(--accent-green)", label: `Well rested (${hardRecent}d since hard)` };
}

interface AllRun { date: string; distance: number; duration: number }

export default function RunningWidget() {
  const [data, setData] = useState<RunSummary | null>(null);
  const [allRuns, setAllRuns] = useState<AllRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/running/summary").then((r) => r.json()),
      // 200-run history is plenty for bucket PB detection without a big payload.
      fetch("/api/running?limit=200").then((r) => r.json()).catch(() => ({ runs: [] })),
    ])
      .then(([summary, hist]) => {
        setData(summary);
        setAllRuns(Array.isArray(hist?.runs) ? hist.runs : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /** For each recent run, decide if it's a PR — i.e. its pace beats every
   *  earlier run in the same distance bucket. Ties don't count as new PRs. */
  const prByDate: Record<string, string> = (() => {
    const out: Record<string, string> = {};
    if (!allRuns.length) return out;
    const sorted = [...allRuns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const bestByBucket: Record<string, number> = {};
    for (const r of sorted) {
      const b = bucketFor(r.distance);
      if (!b || r.distance <= 0) continue;
      const pace = r.duration / r.distance;
      if (bestByBucket[b] === undefined || pace < bestByBucket[b]) {
        bestByBucket[b] = pace;
        out[r.date] = b; // this run *set* the PR at this point in history
      }
    }
    return out;
  })();

  const daysToRace =
    data?.raceDate
      ? Math.ceil((new Date(data.raceDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

  const recovery = data ? recoveryState(data.recentRuns ?? []) : null;

  return (
    <Card accentColor="var(--accent-green)">
      <CardHeader
        icon="🏃"
        title="Running"
        subtitle="Training tracker"
        accentColor="var(--accent-green)"
      />

      {recovery && (
        <div
          className="flex items-center gap-2 mb-3 text-xs"
          style={{ color: "var(--text-muted)" }}
          title={recovery.label}
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: recovery.color, boxShadow: `0 0 8px ${recovery.color}66` }}
          />
          <span>{recovery.label}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="flex gap-3">
            <Skeleton className="flex-1" height={64} rounded="12px" />
            <Skeleton className="flex-1" height={64} rounded="12px" />
            <Skeleton className="flex-1" height={64} rounded="12px" />
          </div>
          <SkeletonList rows={3} rowHeight={40} />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Stats row — this week + last 30 days + days to race */}
          <div className="flex gap-3">
            <div
              className="flex-1 rounded-xl p-3 text-center"
              style={{ background: "var(--surface-2)" }}
            >
              <div className="text-xl font-bold" style={{ color: "var(--accent-green)" }}>
                {data?.weeklyKm?.toFixed(1) ?? "0.0"} <span className="text-base font-semibold">km</span>
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>this week</div>
              {(data?.weekPlannedKm ?? 0) > 0 && (() => {
                const done = data?.weeklyKm ?? 0;
                const plan = data?.weekPlannedKm ?? 0;
                const pct = Math.min(100, (done / plan) * 100);
                const barColor = done >= plan ? "var(--accent-green)" : "var(--accent-orange)";
                return (
                  <div className="mt-1.5" title={`${done.toFixed(1)} / ${plan.toFixed(1)} km planned`}>
                    <div className="rounded-full overflow-hidden" style={{ height: 4, background: "var(--border)" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: barColor }} />
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      / {plan.toFixed(1)} plan
                    </div>
                  </div>
                );
              })()}
            </div>
            <div
              className="flex-1 rounded-xl p-3 text-center"
              style={{ background: "var(--surface-2)" }}
            >
              <div className="text-xl font-bold" style={{ color: "var(--accent-green)" }}>
                {data?.monthlyKm?.toFixed(1) ?? "0.0"} <span className="text-base font-semibold">km</span>
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>last 30 days</div>
            </div>
            {daysToRace !== null && (
              <div
                className="flex-1 rounded-xl p-3 text-center"
                style={{ background: "var(--surface-2)" }}
              >
                <div className="text-xl font-bold" style={{ color: "var(--accent-orange)" }}>
                  {daysToRace} <span className="text-base font-semibold">d</span>
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>to race</div>
              </div>
            )}
          </div>

          {/* Last 3 runs */}
          {data?.recentRuns && data.recentRuns.length > 0 ? (
            <div>
              <p className="text-xs mb-1.5 font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Recent runs
              </p>
              <div className="space-y-1">
                {data.recentRuns.map((r, i) => {
                  const prBucket = prByDate[r.date];
                  return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg px-2.5 py-1.5"
                    style={{
                      background: "var(--surface-2)",
                      border: prBucket ? "1px solid var(--accent-orange)" : "1px solid transparent",
                    }}
                  >
                    <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                      {prBucket && (
                        <span title={`${prBucket} PB!`} style={{ color: "var(--accent-orange)" }}>🏆</span>
                      )}
                      {new Date(r.date).toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: "var(--accent-green)" }}>
                      {r.distance.toFixed(1)} km
                    </span>
                    <span className="text-xs" style={{ color: prBucket ? "var(--accent-orange)" : "var(--text-muted)" }}>
                      {pace(r.distance, r.duration)}
                    </span>
                  </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No runs logged yet</p>
          )}

          {/* Upcoming plans (exclude rest days from list) */}
          {data?.upcomingPlans && data.upcomingPlans.filter(p => p.type !== "rest").length > 0 && (
            <div>
              <p className="text-xs mb-1.5 font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Next 7 days
              </p>
              <div className="space-y-1">
                {data.upcomingPlans.filter(p => p.type !== "rest").map((p, i) => (
                  <div
                    key={i}
                    className="rounded-lg px-2.5 py-1.5"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {new Date(p.date).toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                      <span
                        className="text-xs font-semibold capitalize px-2 py-0.5 rounded-full"
                        style={{
                          background: `${PLAN_COLOR[p.type] ?? "var(--text-muted)"}22`,
                          color: PLAN_COLOR[p.type] ?? "var(--text-muted)",
                        }}
                      >
                        {p.type}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {p.distance ? `${p.distance} km` : "—"}
                      </span>
                    </div>
                    {p.notes && (
                      <div
                        className="text-xs mt-1 opacity-80 whitespace-pre-wrap break-words"
                        style={{ color: "var(--text-muted)", lineHeight: "1.3" }}
                      >
                        {p.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mini 7-day planner */}
          {(() => {
            const days = Array.from({ length: 7 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() + i);
              return d;
            });
            const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            // Map plans by date string for quick lookup
            const planMap = new Map<string, UpcomingPlan>();
            (data?.upcomingPlans ?? []).forEach((p) => {
              const d = new Date(p.date);
              const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
              planMap.set(key, p);
            });

            return (
              <div>
                <p className="text-xs mb-1.5 font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Week ahead
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {days.map((day, i) => {
                    const key = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
                    const plan = planMap.get(key);
                    const isToday = i === 0;
                    const planColor = plan ? (PLAN_COLOR[plan.type] ?? "var(--text-muted)") : undefined;
                    return (
                      <div
                        key={i}
                        className="rounded-lg p-1 text-center"
                        style={{
                          background: plan ? `${planColor}18` : "var(--surface-2)",
                          border: isToday ? "1px solid var(--accent-green)" : "1px solid transparent",
                          minHeight: "40px",
                        }}
                      >
                        <div className="text-xs font-medium" style={{ color: isToday ? "var(--accent-green)" : "var(--text-muted)", fontSize: "9px" }}>
                          {dayNames[day.getDay()]}
                        </div>
                        {plan ? (
                          <div className="text-xs font-bold capitalize" style={{ color: planColor, fontSize: "10px" }}>
                            {plan.type.charAt(0).toUpperCase()}
                            {plan.distance ? <div style={{ fontSize: "8px" }}>{plan.distance}k</div> : null}
                          </div>
                        ) : (
                          <div className="text-xs" style={{ color: "var(--border)", fontSize: "9px" }}>—</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </Card>
  );
}
