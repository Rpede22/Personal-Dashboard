"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface RecentRun {
  date: string;
  distance: number;
  duration: number;
}

interface UpcomingPlan {
  date: string;
  type: string;
  distance: number | null;
}

interface RunSummary {
  recentRuns: RecentRun[];
  weeklyKm: number;
  monthlyKm: number;
  thisMonthKm: number;
  thisYearKm: number;
  totalKm: number;
  totalRuns: number;
  raceDate: string | null;
  upcomingPlans: UpcomingPlan[];
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

export default function RunningWidget() {
  const [data, setData] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/running/summary")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const daysToRace =
    data?.raceDate
      ? Math.ceil((new Date(data.raceDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

  return (
    <Card accentColor="var(--accent-green)">
      <CardHeader
        icon="🏃"
        title="Running"
        subtitle="Training tracker"
        accentColor="var(--accent-green)"
      />

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
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
                {data.recentRuns.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg px-2.5 py-1.5"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(r.date).toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: "var(--accent-green)" }}>
                      {r.distance.toFixed(1)} km
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {pace(r.distance, r.duration)}
                    </span>
                  </div>
                ))}
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
                    className="flex items-center justify-between rounded-lg px-2.5 py-1.5"
                    style={{ background: "var(--surface-2)" }}
                  >
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
