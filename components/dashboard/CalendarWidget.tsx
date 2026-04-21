"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface CalEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendar: string;
}

const FILTER_KEY = "calendarFilter";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function calColor(name: string): string {
  if (name === "SDU")              return "var(--accent-blue)";
  if (name === "Cand")             return "var(--accent-pink)";
  if (name === "Arbejde")          return "var(--accent-green)";
  if (name === "Skolerelateret")   return "var(--accent-orange)";
  if (name === "Kalender")         return "var(--accent-red)";
  return "var(--accent-blue)";
}

function toDateKey(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
}

// Expand multi-day events so each day they cover gets an entry
function buildEventsByDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const e of events) {
    const start = new Date(e.start);
    const end   = new Date(e.end);

    // All-day DTEND is exclusive (day after last), step back 1 ms
    const lastMs = e.allDay ? end.getTime() - 1 : end.getTime();
    const last   = new Date(lastMs);

    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const lastDay = new Date(last);
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

export default function CalendarWidget() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledCals, setEnabledCals] = useState<Set<string> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      if (raw) setEnabledCals(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }

    fetch("/api/calendar")
      .then((r) => r.json())
      .then((d) => {
        setConfigured(d.configured ?? true);
        setEvents(d.events ?? []);
        if (d.error) setError(d.error);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const visible = enabledCals ? events.filter((e) => enabledCals.has(e.calendar)) : events;
  const eventsByDay = buildEventsByDay(visible);

  const todayKey = toDateKey(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <Card accentColor="var(--accent-pink)">
      <CardHeader icon="📅" title="Calendar" subtitle="Upcoming events" accentColor="var(--accent-pink)" />

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !configured ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Calendar not configured.</p>
      ) : error ? (
        <p className="text-sm" style={{ color: "var(--accent-red)" }}>Error: {error}</p>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            const key = toDateKey(day);
            const dayEvs = eventsByDay.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <div
                key={i}
                className="rounded-xl p-1.5 flex flex-col"
                style={{
                  background: dayEvs.length > 0 ? `${calColor(dayEvs[0].calendar)}18` : "var(--surface-2)",
                  border: isToday ? "1px solid var(--accent-pink)" : "1px solid transparent",
                  minHeight: "80px",
                }}
              >
                {/* Day name */}
                <div
                  className="font-medium text-center mb-0.5"
                  style={{ fontSize: "9px", color: isToday ? "var(--accent-pink)" : "var(--text-muted)" }}
                >
                  {DAY_NAMES[day.getDay()]}
                </div>
                {/* Date number */}
                <div
                  className="font-bold text-center mb-1"
                  style={{ fontSize: "13px", color: isToday ? "var(--accent-pink)" : "var(--text)" }}
                >
                  {day.getDate()}
                </div>
                {/* Event labels */}
                <div className="flex flex-col gap-0.5 flex-1">
                  {dayEvs.slice(0, 2).map((e) => (
                    <div
                      key={e.uid}
                      className="rounded px-0.5 truncate"
                      style={{
                        background: `${calColor(e.calendar)}28`,
                        color: calColor(e.calendar),
                        fontSize: "9px",
                        lineHeight: "14px",
                      }}
                    >
                      {e.title}
                    </div>
                  ))}
                  {dayEvs.length > 2 && (
                    <div style={{ fontSize: "8px", color: "var(--text-muted)" }}>
                      +{dayEvs.length - 2}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
