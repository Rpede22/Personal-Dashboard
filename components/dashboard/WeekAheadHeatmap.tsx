"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface CalEvent { uid: string; title: string; start: string; end: string; allDay: boolean }
interface Assignment { id: number; estimatedHours: number | null }
interface RunPlan { date: string; type: string; distance: number | null }

interface SchoolBreakdownItem { title: string; hours: number }
interface CalBreakdownItem { title: string; hours: number; range: string }

const PLAN_COLOR: Record<string, string> = {
  easy:  "var(--accent-green)",
  tempo: "var(--accent-orange)",
  speed: "var(--accent-red)",
  long:  "var(--accent-blue)",
  rest:  "var(--text-muted)",
};

interface DayCell {
  date: Date;
  key: string;
  label: string;    // "Mon"
  dayNum: number;   // 24
  schoolHours: number;
  calendarHours: number;
  schoolBreakdown: SchoolBreakdownItem[];
  calBreakdown: CalBreakdownItem[];
  runPlan: RunPlan | null;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function WeekAheadHeatmap() {
  const [days, setDays] = useState<DayCell[] | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [schoolRes, calRes, runRes] = await Promise.allSettled([
        fetch("/api/school?status=pending,in_progress,overdue").then((r) => r.json()),
        fetch("/api/calendar").then((r) => r.json()),
        fetch("/api/running/summary").then((r) => r.json()),
      ]);

      // Build the 7-day skeleton starting today (local)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cells: DayCell[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        return {
          date: d,
          key: dateKey(d),
          label: d.toLocaleDateString("en-GB", { weekday: "short" }),
          dayNum: d.getDate(),
          schoolHours: 0,
          calendarHours: 0,
          schoolBreakdown: [],
          calBreakdown: [],
          runPlan: null,
        };
      });

      // Running: attach the day's planned session (if any) — one per date.
      if (runRes.status === "fulfilled") {
        const plans: RunPlan[] = runRes.value?.upcomingPlans ?? [];
        for (const p of plans) {
          const planDate = new Date(p.date);
          const planKey = dateKey(planDate);
          const cell = cells.find((c) => c.key === planKey);
          if (cell) cell.runPlan = p;
        }
      }

      // School: loadPlan is { [dateKey]: Array<{ assignmentId, title, hours }> }.
      // (Not an object keyed by id — this shape bit me: iterating .values on
      // an array yielded the DaySlot objects, and `0 + {...}` coerced to a
      // string that later crashed .toFixed().)
      if (schoolRes.status === "fulfilled") {
        const loadPlan: Record<string, Array<{ hours: unknown; title?: string }>> = schoolRes.value?.loadPlan ?? {};
        for (const c of cells) {
          const slots = loadPlan[c.key];
          if (Array.isArray(slots)) {
            for (const slot of slots) {
              const n = Number(slot?.hours);
              if (Number.isFinite(n)) {
                c.schoolHours += n;
                c.schoolBreakdown.push({ title: String(slot?.title ?? "Assignment"), hours: n });
              }
            }
          }
        }
        void (schoolRes.value?.assignments as Assignment[] | undefined);
      }

      // Calendar: sum event durations that overlap each day, in hours.
      if (calRes.status === "fulfilled") {
        const events: CalEvent[] = calRes.value?.events ?? [];
        for (const e of events) {
          if (e.allDay) continue; // all-day items shouldn't fill "busy hours" bars
          const s = new Date(e.start);
          const en = new Date(e.end);
          if (!isFinite(s.getTime()) || !isFinite(en.getTime())) continue;
          for (const c of cells) {
            // Overlap of [s, en) with [c.date, c.date + 24h)
            const dayStart = c.date.getTime();
            const dayEnd = dayStart + 24 * 3600 * 1000;
            const overlap = Math.max(0, Math.min(en.getTime(), dayEnd) - Math.max(s.getTime(), dayStart));
            if (overlap > 0) {
              c.calendarHours += overlap / 3600000;
              const startHM = s.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
              const endHM   = en.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
              c.calBreakdown.push({
                title: String(e.title ?? "Event"),
                hours: overlap / 3600000,
                range: `${startHM}–${endHM}`,
              });
            }
          }
        }
      }

      if (!cancelled) setDays(cells);
    }

    load();
    const iv = setInterval(load, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  if (days === null) return null;
  if (days.every((d) => d.schoolHours === 0 && d.calendarHours === 0 && !d.runPlan)) return null;

  return (
    <div
      className="mb-6 rounded-2xl px-4 py-3"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Week ahead</div>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "var(--accent-indigo)" }} /> school
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "var(--accent-pink)" }} /> calendar
          </span>
        </div>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {days.map((d, i) => {
          const total = d.schoolHours + d.calendarHours;
          const cap = 12; // "waking hours" ceiling for bar scale
          const schoolPct = Math.min(1, d.schoolHours / cap) * 50; // top half = up to 50% height
          const calPct = Math.min(1, d.calendarHours / cap) * 50;  // bottom half = up to 50% height

          const loadColor =
            total > 12 ? "var(--accent-red)"
            : total > 8 ? "var(--accent-orange)"
            : "var(--accent-green)";
          const isToday = i === 0;

          return (
            <div
              key={d.key}
              className="rounded-lg overflow-hidden flex flex-col relative"
              style={{
                background: "var(--surface-2)",
                border: `1px solid ${isToday ? loadColor : "var(--border)"}`,
                minHeight: 88,
              }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((prev) => (prev === i ? null : prev))}
            >
              <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
                <span className="text-[10px] uppercase tracking-wide flex items-center gap-1" style={{ color: isToday ? loadColor : "var(--text-muted)" }}>
                  {isToday ? "Today" : d.label}
                  {d.runPlan && (
                    <span
                      title={`Run: ${d.runPlan.type}${d.runPlan.distance ? ` · ${d.runPlan.distance.toFixed(1)} km` : ""}`}
                      style={{ color: PLAN_COLOR[d.runPlan.type] ?? "var(--text-muted)", fontSize: "10px" }}
                    >
                      {d.runPlan.type === "rest" ? "😴" : "🏃"}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-semibold" style={{ color: loadColor }}>
                  {total > 0 ? `${total.toFixed(1)}h` : ""}
                </span>
              </div>

              {/* Bars: two halves of a fixed 48px canvas */}
              <div className="relative mx-2 mb-2" style={{ height: 48 }}>
                {/* Top half — school (grows down from midline) */}
                <Link
                  href="/school"
                  aria-label={`${d.schoolHours.toFixed(1)}h school on ${d.label}`}
                  className="absolute left-0 right-0 rounded-sm hover:brightness-125"
                  style={{
                    top: 24 - (schoolPct / 100) * 24,
                    height: (schoolPct / 100) * 24,
                    background: "var(--accent-indigo)",
                  }}
                />
                {/* Midline */}
                <div className="absolute left-0 right-0" style={{ top: 23, height: 1, background: "var(--border)" }} />
                {/* Bottom half — calendar (grows up from midline) */}
                <Link
                  href={`/calendar?date=${d.key}`}
                  aria-label={`${d.calendarHours.toFixed(1)}h calendar on ${d.label}`}
                  className="absolute left-0 right-0 rounded-sm hover:brightness-125"
                  style={{
                    top: 24,
                    height: (calPct / 100) * 24,
                    background: "var(--accent-pink)",
                  }}
                />
              </div>

              {hoverIdx === i && (d.schoolBreakdown.length > 0 || d.calBreakdown.length > 0) && (
                <div
                  className="absolute z-30 rounded-lg p-2 text-[11px] shadow-xl pointer-events-none"
                  style={{
                    top: "100%",
                    left: i >= 5 ? "auto" : 0,
                    right: i >= 5 ? 0 : "auto",
                    marginTop: 6,
                    minWidth: 200,
                    maxWidth: 260,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                >
                  <div className="font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                    {isToday ? "Today" : d.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
                  </div>
                  {d.schoolBreakdown.length > 0 && (
                    <div className="mb-1">
                      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--accent-indigo)" }}>School · {d.schoolHours.toFixed(1)}h</div>
                      {d.schoolBreakdown.map((s, si) => (
                        <div key={si} className="flex justify-between gap-2">
                          <span className="truncate">{s.title}</span>
                          <span className="tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>{s.hours.toFixed(1)}h</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {d.calBreakdown.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--accent-pink)" }}>Calendar · {d.calendarHours.toFixed(1)}h</div>
                      {d.calBreakdown.map((e, ei) => (
                        <div key={ei} className="flex justify-between gap-2">
                          <span className="truncate">{e.title}</span>
                          <span className="tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>{e.range}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
