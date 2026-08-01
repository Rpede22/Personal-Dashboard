"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
  if (name === "Rasmus_skole")     return "var(--accent-red)";
  if (name === "Cand")             return "var(--accent-indigo)";
  if (name === "Jennifer_arbejde") return "var(--accent-green)";
  if (name === "Kalender")         return "var(--accent-blue)";
  if (name === "Rasmus_arbejde")   return "var(--accent-pink)";
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
  const [enabledCals, setEnabledCals] = useState<Set<string>>(new Set(["SDU", "Cand", "Rasmus_Arbejde"]));
  const [calendarNames, setCalendarNames] = useState<string[]>([]);
  const [writeableCalendars, setWriteableCalendars] = useState<string[]>([]);
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Deep-link: /calendar?date=YYYY-MM-DD from the WeekAheadHeatmap opens
  // straight into that day's detail (and jumps the month view to it).
  const searchParams = useSearchParams();
  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (!dateParam) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam);
    if (!m) return;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    setSelectedDay(dateParam);
    setViewDate(new Date(y, mo, 1));
    void d;
  }, [searchParams]);

  // ── Quick-add state ─────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({
    calendar: "Kalender",
    title: "",
    date: new Date().toISOString().slice(0, 10),   // yyyy-mm-dd
    startTime: "12:00",
    endTime: "13:00",
    allDay: false,
    location: "",
  });

  // `writeableCalendars` is populated from the API (`data.writableCalendars`),
  // which returns only iCloud CalDAV names — ICS feeds are read-only by nature.

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true);
    setAddError(null);
    try {
      // Interpret the input date + time as Europe/Copenhagen local. We build
      // the ISO in UTC by asking the browser to format the components; the
      // simplest reliable way is to send the local-string and let the server
      // interpret it. iCloud handles UTC ISO strings correctly.
      const startLocal = addForm.allDay
        ? `${addForm.date}T00:00:00`
        : `${addForm.date}T${addForm.startTime}:00`;
      const endLocal = addForm.allDay
        ? `${addForm.date}T23:59:59`
        : `${addForm.date}T${addForm.endTime}:00`;

      const res = await fetch("/api/calendar/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendar: addForm.calendar,
          title: addForm.title.trim(),
          startISO: new Date(startLocal).toISOString(),
          endISO: new Date(endLocal).toISOString(),
          allDay: addForm.allDay,
          location: addForm.location.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Reset form + reload calendar with cache bust so the new event appears.
      setAddForm((f) => ({ ...f, title: "", location: "" }));
      setAddOpen(false);
      loadCalendar(true);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddSaving(false);
    }
  }

  // Load calendar data. `bust=true` skips the server cache to force a fresh fetch.
  const loadCalendar = useCallback((bust = false) => {
    fetch(`/api/calendar${bust ? "?bust=1" : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setConfigured(d.configured ?? true);
        const evs: CalEvent[] = d.events ?? [];
        setAllEvents(evs);
        if (d.error) setError(d.error);
        // Prefer the API-provided list of all configured calendars so empty
        // calendars still get a filter toggle; fall back to names derived from events.
        const eventNames = [...new Set(evs.map((e) => e.calendar))];
        const apiNames: string[] = Array.isArray(d.calendars) ? d.calendars : [];
        const names = [...new Set([...apiNames, ...eventNames])].sort();
        setCalendarNames(names);
        const apiWriteable: string[] = Array.isArray(d.writableCalendars) ? d.writableCalendars : [];
        setWriteableCalendars(apiWriteable);
        try {
          const raw = localStorage.getItem(FILTER_KEY);
          if (!raw) {
            setEnabledCals(new Set(names));
          } else {
            // Migrate old stored filter: keep known names, auto-enable any new/renamed calendars.
            const stored: string[] = JSON.parse(raw);
            const kept = stored.filter((n) => names.includes(n));
            const newNames = names.filter((n) => !stored.includes(n));
            setEnabledCals(new Set([...kept, ...newNames]));
          }
        } catch {
          setEnabledCals(new Set(names));
        }
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCalendar();
    // Auto-refresh every hour (bust=true so we always get fresh CalDAV data)
    const interval = setInterval(() => loadCalendar(true), 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadCalendar]);

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
    <div className="min-h-screen p-6 page-bg">
      {/* Sticky header: title + filter toggles */}
      <div
        className="sticky top-[28px] z-10 -mx-6 px-6 pt-5 pb-3 mb-4 page-bg"
      >
        <div className="flex items-center gap-4 mb-3">
          <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: "var(--accent-purple)" }}>📅 Calendar</h1>
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: addOpen ? "var(--surface-2)" : "var(--accent-purple)", color: addOpen ? "var(--text-muted)" : "#fff" }}
          >
            {addOpen ? "Cancel" : "+ Add event"}
          </button>
        </div>

        {/* Quick-add form — pops out under the header when the button is toggled. */}
        {addOpen && (
          <form
            onSubmit={submitAdd}
            className="mb-3 rounded-xl p-3 grid gap-2"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            }}
          >
            <input
              required
              value={addForm.title}
              onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Event title"
              className="rounded-lg px-2 py-1.5 text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", gridColumn: "1 / -1" }}
            />
            <select
              value={addForm.calendar}
              onChange={(e) => setAddForm((f) => ({ ...f, calendar: e.target.value }))}
              className="rounded-lg px-2 py-1.5 text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
            >
              {writeableCalendars.length === 0 && <option value="Kalender">Kalender</option>}
              {writeableCalendars.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="date"
              required
              value={addForm.date}
              onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
              className="rounded-lg px-2 py-1.5 text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
            />
            {!addForm.allDay && (
              <>
                <input
                  type="time"
                  value={addForm.startTime}
                  onChange={(e) => setAddForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="rounded-lg px-2 py-1.5 text-sm"
                  style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                />
                <input
                  type="time"
                  value={addForm.endTime}
                  onChange={(e) => setAddForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="rounded-lg px-2 py-1.5 text-sm"
                  style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                />
              </>
            )}
            <label className="flex items-center gap-2 text-xs px-2" style={{ color: "var(--text-muted)" }}>
              <input
                type="checkbox"
                checked={addForm.allDay}
                onChange={(e) => setAddForm((f) => ({ ...f, allDay: e.target.checked }))}
              />
              All day
            </label>
            <input
              value={addForm.location}
              onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Location (optional)"
              className="rounded-lg px-2 py-1.5 text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", gridColumn: "1 / -1" }}
            />
            <button
              type="submit"
              disabled={addSaving || !addForm.title.trim()}
              className="rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{
                background: addSaving ? "var(--surface-2)" : "var(--accent-green)",
                color: "#fff",
                gridColumn: "1 / -1",
                opacity: !addForm.title.trim() ? 0.5 : 1,
              }}
            >
              {addSaving ? "Saving to iCloud…" : "Save event"}
            </button>
            {addError && (
              <p className="text-xs whitespace-pre-wrap break-words rounded-md p-2"
                 style={{ background: "var(--accent-red)11", color: "var(--accent-red)", border: "1px solid var(--accent-red)44", gridColumn: "1 / -1" }}>
                {addError}
              </p>
            )}
          </form>
        )}

        {/* Calendar filter toggles */}
        {calendarNames.length > 0 && (
          <div className="flex flex-wrap gap-2">
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
      </div>

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
