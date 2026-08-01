"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface CalEvent { uid: string; start: string; end: string; allDay: boolean }
interface Assignment { id: number; estimatedHours: number | null }

interface DayCell {
  date: Date;
  key: string;
  label: string;    // "Mon"
  dayNum: number;   // 24
  schoolHours: number;
  calendarHours: number;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function WeekAheadHeatmap() {
  const [days, setDays] = useState<DayCell[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [schoolRes, calRes] = await Promise.allSettled([
        fetch("/api/school?status=pending,in_progress,overdue").then((r) => r.json()),
        fetch("/api/calendar").then((r) => r.json()),
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
        };
      });

      // School: loadPlan is { [dateKey]: Array<{ assignmentId, title, hours }> }.
      // (Not an object keyed by id — this shape bit me: iterating .values on
      // an array yielded the DaySlot objects, and `0 + {...}` coerced to a
      // string that later crashed .toFixed().)
      if (schoolRes.status === "fulfilled") {
        const loadPlan: Record<string, Array<{ hours: unknown }>> = schoolRes.value?.loadPlan ?? {};
        for (const c of cells) {
          const slots = loadPlan[c.key];
          if (Array.isArray(slots)) {
            for (const slot of slots) {
              const n = Number(slot?.hours);
              if (Number.isFinite(n)) c.schoolHours += n;
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
            if (overlap > 0) c.calendarHours += overlap / 3600000;
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
  if (days.every((d) => d.schoolHours === 0 && d.calendarHours === 0)) return null;

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
              className="rounded-lg overflow-hidden flex flex-col"
              style={{
                background: "var(--surface-2)",
                border: `1px solid ${isToday ? loadColor : "var(--border)"}`,
                minHeight: 88,
              }}
            >
              <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
                <span className="text-[10px] uppercase tracking-wide" style={{ color: isToday ? loadColor : "var(--text-muted)" }}>
                  {isToday ? "Today" : d.label}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
