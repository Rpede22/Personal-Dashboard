"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CalEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendar: string;
  location?: string;
  description?: string;
}

const FILTER_KEY = "calendarFilter";
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function calColor(name: string): string {
  if (name === "SDU")              return "var(--accent-blue)";
  if (name === "Cand")             return "var(--accent-purple)";
  if (name === "Arbejde")          return "var(--accent-green)";
  if (name === "Skolerelateret")   return "var(--accent-orange)";
  if (name === "Kalender")         return "var(--accent-red)";
  return "var(--accent-blue)";
}

function toDateKey(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("da-DK", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen",
  });
}

function fmtTimeRange(start: string, end: string, allDay: boolean): string {
  if (allDay) return "All day";
  const s = fmtTime(start);
  const diff = new Date(end).getTime() - new Date(start).getTime();
  // Only show end time if it's within the same 24h window
  if (diff < 24 * 60 * 60 * 1000) return `${s} – ${fmtTime(end)}`;
  return s;
}

// Expand multi-day events so each calendar day gets its own entry
function buildEventsByDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const e of events) {
    const start = new Date(e.start);
    const end   = new Date(e.end);
    const lastMs = e.allDay ? end.getTime() - 1 : end.getTime();

    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const lastDay = new Date(lastMs);
    lastDay.setHours(0, 0, 0, 0);

    while (cur <= lastDay) {
      const key = toDateKey(cur);
      if (!map.has(key)) map.set(key, []);
      if (!map.get(key)!.some((ev) => ev.uid === e.uid)) map.get(key)!.push(e);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return map;
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7; // Mon = 0
  const cells: (Date | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarHub() {
  const [allEvents, setAllEvents] = useState<CalEvent[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledCals, setEnabledCals] = useState<Set<string>>(new Set(["SDU", "Cand", "Arbejde"]));
  const [calendarNames, setCalendarNames] = useState<string[]>([]);
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((d) => {
        setConfigured(d.configured ?? true);
        const evs: CalEvent[] = d.events ?? [];
        setAllEvents(evs);
        if (d.error) setError(d.error);
        const names = [...new Set(evs.map((e) => e.calendar))];
        setCalendarNames(names);
        try {
          const raw = localStorage.getItem(FILTER_KEY);
          setEnabledCals(raw ? new Set(JSON.parse(raw)) : new Set(names));
        } catch {
          setEnabledCals(new Set(names));
        }
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  function toggleCal(name: string) {
    setEnabledCals((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      try { localStorage.setItem(FILTER_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  const todayKey = toDateKey(new Date());
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = buildMonthGrid(year, month);

  const visible = allEvents.filter((e) => enabledCals.has(e.calendar));
  const eventsByDay = buildEventsByDay(visible);
  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--accent-purple)" }}>📅 Calendar</h1>
      </div>

      {/* Calendar filter toggles */}
      {calendarNames.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {calendarNames.map((name) => {
            const color = calColor(name);
            const on = enabledCals.has(name);
            return (
              <button
                key={name}
                onClick={() => toggleCal(name)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{
                  background: on ? `${color}22` : "var(--surface-2)",
                  border: `1px solid ${on ? color : "var(--border)"}`,
                  color: on ? color : "var(--text-muted)",
                  opacity: on ? 1 : 0.5,
                  transition: "all 0.15s",
                }}
              >
                <div className="w-2 h-2 rounded-full" style={{ background: on ? color : "var(--border)" }} />
                {name}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading calendar…</p>
      ) : !configured ? (
        <div className="rounded-2xl p-6 space-y-3 max-w-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h2 className="font-semibold" style={{ color: "var(--text)" }}>Calendar not configured</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Add <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>CALENDAR_SDU_URL</code>,{" "}
            <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>CALENDAR_CAND_URL</code>, and{" "}
            <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>CALENDAR_ARBEJDE_URL</code> to .env.local.
          </p>
        </div>
      ) : error ? (
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--accent-red)44" }}>
          <p className="text-sm font-medium" style={{ color: "var(--accent-red)" }}>Calendar error</p>
          <p className="text-xs font-mono mt-1" style={{ color: "var(--text-muted)" }}>{error}</p>
        </div>
      ) : (
        <div>
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => { setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)); setSelectedDay(null); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg font-bold"
              style={{ background: "var(--surface-2)", color: "var(--text)", fontSize: "18px" }}
            >
              ‹
            </button>
            <span className="text-lg font-bold" style={{ color: "var(--text)" }}>
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              onClick={() => { setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)); setSelectedDay(null); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg font-bold"
              style={{ background: "var(--surface-2)", color: "var(--text)", fontSize: "18px" }}
            >
              ›
            </button>
          </div>

          {/* Day column headers */}
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {DAY_HEADERS.map((d) => (
              <div
                key={d}
                className="text-center text-xs font-semibold uppercase tracking-wide py-1"
                style={{ color: "var(--text-muted)" }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((date, i) => {
              if (!date) return <div key={i} />;
              const key = toDateKey(date);
              const dayEvs = eventsByDay.get(key) ?? [];
              const isToday    = key === todayKey;
              const isSelected = key === selectedDay;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(isSelected ? null : key)}
                  className="rounded-xl p-2 text-left"
                  style={{
                    background: isSelected
                      ? "var(--surface)"
                      : dayEvs.length > 0
                      ? `${calColor(dayEvs[0].calendar)}14`
                      : "var(--surface-2)",
                    border: isToday
                      ? "1px solid var(--accent-purple)"
                      : isSelected
                      ? "1px solid var(--border)"
                      : "1px solid transparent",
                    minHeight: "80px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    className="text-sm font-bold mb-1"
                    style={{ color: isToday ? "var(--accent-purple)" : "var(--text-muted)" }}
                  >
                    {date.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvs.slice(0, 3).map((e) => (
                      <div
                        key={e.uid}
                        className="rounded px-1 truncate"
                        style={{
                          background: `${calColor(e.calendar)}28`,
                          color: calColor(e.calendar),
                          fontSize: "10px",
                          lineHeight: "16px",
                        }}
                      >
                        {!e.allDay && <span className="opacity-70">{fmtTime(e.start)} </span>}
                        {e.title}
                      </div>
                    ))}
                    {dayEvs.length > 3 && (
                      <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        +{dayEvs.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected day detail panel */}
          {selectedDay && selectedEvents.length > 0 && (
            <div className="mt-4 rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
                {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-GB", {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </p>
              <div className="space-y-2">
                {selectedEvents.map((e) => {
                  const color = calColor(e.calendar);
                  return (
                    <div
                      key={e.uid}
                      className="flex items-start gap-3 rounded-xl px-4 py-3"
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                    >
                      <div
                        className="w-1 self-stretch rounded-full shrink-0 mt-0.5"
                        style={{ background: color, minHeight: "1.25rem" }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <span className="text-sm shrink-0" style={{ color: "var(--text-muted)" }}>
                            {fmtTimeRange(e.start, e.end, e.allDay)}
                          </span>
                          <span className="font-semibold text-base">{e.title}</span>
                        </div>
                        {e.location && (
                          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>📍 {e.location}</p>
                        )}
                        {e.description && (
                          <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>{e.description}</p>
                        )}
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded-md font-medium shrink-0"
                        style={{ background: `${color}22`, color }}
                      >
                        {e.calendar}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
