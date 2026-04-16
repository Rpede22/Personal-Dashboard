"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface RunLog {
  id: number;
  date: string;
  distance: number;
  duration: number;
  notes: string | null;
}

interface RunPlan {
  id: number;
  date: string;
  distance: number | null;
  type: string;
  notes: string | null;
  completed: boolean;
}

const PLAN_TYPE_OPTIONS = ["easy", "tempo", "long", "rest"] as const;

const PLAN_TYPE_COLOR: Record<string, string> = {
  easy: "var(--accent-green)",
  tempo: "var(--accent-orange)",
  long: "var(--accent-blue)",
  rest: "var(--text-muted)",
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pace(distKm: number, durationSec: number): string {
  if (distKm === 0) return "—";
  const secPerKm = durationSec / distKm;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

// Use local time for user-facing calendar dates (form inputs, week navigation)
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Use UTC when converting API-returned DateTime fields (stored as UTC midnight)
function toUTCDateStr(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function RunningHub() {
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [raceDate, setRaceDate] = useState("");
  const [raceDateInput, setRaceDateInput] = useState("");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    distanceKm: "",
    durationMin: "",
    durationSec: "",
    notes: "",
  });

  // Planner state
  const [plans, setPlans] = useState<RunPlan[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()));
  const [showMonthView, setShowMonthView] = useState(false);
  const [addPlanDay, setAddPlanDay] = useState<string | null>(null); // date string for inline form
  const [planForm, setPlanForm] = useState({ type: "easy", distance: "", notes: "" });

  async function loadRuns() {
    setLoading(true);
    try {
      const res = await fetch("/api/running?limit=30");
      const data = await res.json();
      setRuns(data.runs ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    const res = await fetch("/api/running/summary");
    const data = await res.json();
    setRaceDate(data.raceDate ?? "");
    setRaceDateInput(data.raceDate ?? "");
  }

  async function loadPlans(from: Date, to: Date) {
    const res = await fetch(
      `/api/running/plans?from=${toLocalDateStr(from)}&to=${toLocalDateStr(to)}`
    );
    const data = await res.json();
    setPlans(data.plans ?? []);
  }

  useEffect(() => {
    loadRuns();
    loadSummary();
  }, []);

  useEffect(() => {
    // Load plans for visible range
    if (showMonthView) {
      // Current month
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      loadPlans(from, to);
    } else {
      const to = new Date(weekStart);
      to.setDate(weekStart.getDate() + 6);
      loadPlans(weekStart, to);
    }
  }, [weekStart, showMonthView]);

  async function logRun(e: React.FormEvent) {
    e.preventDefault();
    const durationSec =
      parseInt(form.durationMin || "0") * 60 + parseInt(form.durationSec || "0");
    await fetch("/api/running", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        distance: parseFloat(form.distanceKm),
        duration: durationSec,
        notes: form.notes || null,
      }),
    });
    setForm({
      date: new Date().toISOString().slice(0, 10),
      distanceKm: "",
      durationMin: "",
      durationSec: "",
      notes: "",
    });
    setShowForm(false);
    loadRuns();
  }

  async function deleteRun(id: number) {
    await fetch(`/api/running/${id}`, { method: "DELETE" });
    setRuns((prev) => prev.filter((r) => r.id !== id));
  }

  async function saveRaceDate() {
    await fetch("/api/running/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceDate: raceDateInput }),
    });
    setRaceDate(raceDateInput);
  }

  async function addPlan(dateStr: string) {
    await fetch("/api/running/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: dateStr,
        type: planForm.type,
        distance: planForm.distance ? parseFloat(planForm.distance) : null,
        notes: planForm.notes || null,
      }),
    });
    setPlanForm({ type: "easy", distance: "", notes: "" });
    setAddPlanDay(null);
    // Reload plans
    const to = new Date(weekStart);
    to.setDate(weekStart.getDate() + 6);
    loadPlans(weekStart, to);
  }

  async function deletePlan(id: number) {
    await fetch(`/api/running/plans/${id}`, { method: "DELETE" });
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }

  async function togglePlanComplete(plan: RunPlan) {
    await fetch(`/api/running/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !plan.completed }),
    });
    setPlans((prev) =>
      prev.map((p) => (p.id === plan.id ? { ...p, completed: !p.completed } : p))
    );
  }

  const daysToRace = raceDate
    ? Math.ceil((new Date(raceDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // Weekly mileage — compare UTC dates to avoid timezone issues
  const now = new Date();
  const monday = getMondayOf(now);
  const mondayStr = toLocalDateStr(monday);
  const weeklyKm = runs
    .filter((r) => toUTCDateStr(new Date(r.date)) >= mondayStr)
    .reduce((sum, r) => sum + r.distance, 0);
  const totalKm = runs.reduce((sum, r) => sum + r.distance, 0);

  const weekDays = getWeekDays(weekStart);
  const weekEnd = weekDays[6];

  // Build a map of dateStr -> RunLog for the planner
  // API dates are stored as UTC midnight — use UTC extraction to avoid timezone shift
  const runsByDate = new Map<string, RunLog>();
  runs.forEach((r) => {
    runsByDate.set(toUTCDateStr(new Date(r.date)), r);
  });

  // Build a map of dateStr -> RunPlan[]
  const plansByDate = new Map<string, RunPlan[]>();
  plans.forEach((p) => {
    const key = toUTCDateStr(new Date(p.date));
    if (!plansByDate.has(key)) plansByDate.set(key, []);
    plansByDate.get(key)!.push(p);
  });

  // Month view helpers
  const monthDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
  const monthFirstDay = monthDate.getDay(); // 0=Sun
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  // Offset: Monday-based calendar
  const startOffset = monthFirstDay === 0 ? 6 : monthFirstDay - 1;

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--background)" }}>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--accent-green)" }}>
          🏃 Running Hub
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="ml-auto px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "var(--accent-green)", color: "#fff" }}
        >
          + Log Run
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "This week", value: `${weeklyKm.toFixed(1)} km`, color: "var(--accent-green)" },
          { label: "Total logged", value: `${totalKm.toFixed(1)} km`, color: "var(--accent-blue)" },
          { label: "Total runs", value: runs.length.toString(), color: "var(--accent-purple)" },
          {
            label: "Days to race",
            value: daysToRace !== null ? daysToRace.toString() : "—",
            color: "var(--accent-orange)",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl p-4 text-center"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="text-2xl font-bold" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Race date config */}
      <div
        className="rounded-2xl p-4 mb-6 flex flex-wrap items-end gap-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Race date
          </label>
          <input
            type="date"
            value={raceDateInput}
            onChange={(e) => setRaceDateInput(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{
              background: "var(--surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              colorScheme: "dark",
            }}
          />
        </div>
        <button
          onClick={saveRaceDate}
          className="px-4 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--accent-green)", color: "#fff" }}
        >
          Save
        </button>
        {raceDate && (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {new Date(raceDate).toLocaleDateString("en-GB", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        )}
      </div>

      {/* Log run form */}
      {showForm && (
        <form
          onSubmit={logRun}
          className="rounded-2xl p-5 mb-6 space-y-3"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <h3 className="font-semibold">Log a Run</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                Date
              </label>
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  colorScheme: "dark",
                }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                Distance (km)
              </label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 10.5"
                value={form.distanceKm}
                onChange={(e) => setForm((f) => ({ ...f, distanceKm: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                Duration
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  placeholder="min"
                  value={form.durationMin}
                  onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                  className="flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="sec"
                  value={form.durationSec}
                  onChange={(e) => setForm((f) => ({ ...f, durationSec: e.target.value }))}
                  className="flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            </div>
          </div>
          <input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{
              background: "var(--surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent-green)", color: "#fff" }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Run log */}
      <h3 className="font-semibold mb-3">Run Log</h3>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : runs.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center mb-8"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-lg mb-2">No runs logged yet</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Click &quot;+ Log Run&quot; to add your first run
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden mb-8"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Date", "Distance", "Duration", "Pace", "Notes", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td className="px-4 py-3">
                    {new Date(run.date).toLocaleDateString("en-GB", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: "var(--accent-green)" }}>
                    {run.distance.toFixed(2)} km
                  </td>
                  <td className="px-4 py-3">{formatDuration(run.duration)}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {pace(run.distance, run.duration)}
                  </td>
                  <td
                    className="px-4 py-3 text-xs max-w-40 truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {run.notes ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteRun(run.id)}
                      className="text-xs px-2 py-1 rounded-md font-medium"
                      style={{
                        color: "var(--accent-red)",
                        border: "1px solid var(--accent-red)",
                        background: "transparent",
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Run Planner ─── */}
      <div className="flex items-center gap-3 mb-4">
        <h3 className="font-semibold text-lg">Run Planner</h3>
        <button
          onClick={() => setShowMonthView((v) => !v)}
          className="ml-auto text-sm px-3 py-1.5 rounded-lg"
          style={{
            background: showMonthView ? "var(--accent-green)" : "var(--surface)",
            color: showMonthView ? "#fff" : "var(--text-muted)",
            border: "1px solid var(--border)",
          }}
        >
          {showMonthView ? "Week view" : "Month view"}
        </button>
      </div>

      {showMonthView ? (
        /* ─── Month view ─── */
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                const d = new Date(weekStart);
                d.setMonth(d.getMonth() - 1);
                setWeekStart(getMondayOf(new Date(d.getFullYear(), d.getMonth(), 1)));
              }}
              className="px-3 py-1 rounded-lg text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text)" }}
            >
              ‹
            </button>
            <span className="font-semibold">
              {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
            </span>
            <button
              onClick={() => {
                const d = new Date(weekStart);
                d.setMonth(d.getMonth() + 1);
                setWeekStart(getMondayOf(new Date(d.getFullYear(), d.getMonth(), 1)));
              }}
              className="px-3 py-1 rounded-lg text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text)" }}
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-medium py-1" style={{ color: "var(--text-muted)" }}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const dayNum = i + 1;
              const dateStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const dayPlans = plansByDate.get(dateStr) ?? [];
              const run = runsByDate.get(dateStr);
              return (
                <div
                  key={dayNum}
                  className="rounded-lg p-1 min-h-12 text-xs"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>
                    {dayNum}
                  </div>
                  {dayPlans.map((p) => (
                    <div
                      key={p.id}
                      className="px-1 rounded text-xs mb-0.5 truncate"
                      style={{
                        background: `${PLAN_TYPE_COLOR[p.type]}22`,
                        color: PLAN_TYPE_COLOR[p.type],
                      }}
                    >
                      {p.type}{p.distance ? ` ${p.distance}k` : ""}
                    </div>
                  ))}
                  {run && (
                    <div
                      className="px-1 rounded text-xs truncate"
                      style={{ background: "var(--accent-green)22", color: "var(--accent-green)" }}
                    >
                      ✓ {run.distance.toFixed(1)}km
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ─── Week view ─── */
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {/* Week navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() - 7);
                setWeekStart(d);
              }}
              className="px-3 py-1 rounded-lg text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text)" }}
            >
              ‹ Prev
            </button>
            <span className="font-semibold text-sm">
              Week of{" "}
              {weekStart.toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
              {" — "}
              {weekEnd.toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
            </span>
            <button
              onClick={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + 7);
                setWeekStart(d);
              }}
              className="px-3 py-1 rounded-lg text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text)" }}
            >
              Next ›
            </button>
          </div>

          {/* 7 day cards */}
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
            {weekDays.map((day, idx) => {
              const dateStr = toLocalDateStr(day);
              const dayPlans = plansByDate.get(dateStr) ?? [];
              const run = runsByDate.get(dateStr);
              const isToday = toLocalDateStr(new Date()) === dateStr;

              return (
                <div
                  key={dateStr}
                  className="rounded-xl p-3 flex flex-col gap-1.5 min-h-28 relative"
                  style={{
                    background: isToday ? "var(--accent-green)11" : "var(--surface-2)",
                    border: isToday
                      ? "1px solid var(--accent-green)"
                      : "1px solid var(--border)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{ color: isToday ? "var(--accent-green)" : "var(--text-muted)" }}>
                      {DAY_NAMES[idx]}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {day.getDate()}
                    </span>
                  </div>

                  {/* Plans */}
                  {dayPlans.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-md px-2 py-1 text-xs flex items-center justify-between gap-1"
                      style={{
                        background: `${PLAN_TYPE_COLOR[p.type]}22`,
                        color: PLAN_TYPE_COLOR[p.type],
                        border: `1px solid ${PLAN_TYPE_COLOR[p.type]}44`,
                        opacity: p.completed ? 0.5 : 1,
                      }}
                    >
                      <span className="capitalize font-medium truncate">
                        {p.type}{p.distance ? ` ${p.distance}k` : ""}
                      </span>
                      <button
                        onClick={() => deletePlan(p.id)}
                        title="Remove plan"
                        style={{ color: "inherit", opacity: 0.7, flexShrink: 0 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {/* Done overlay if run exists */}
                  {run && (
                    <div
                      className="rounded-md px-2 py-1 text-xs font-semibold"
                      style={{
                        background: "var(--accent-green)22",
                        color: "var(--accent-green)",
                        border: "1px solid var(--accent-green)44",
                      }}
                    >
                      ✓ Done {run.distance.toFixed(1)}km
                    </div>
                  )}

                  {/* Add plan button */}
                  {addPlanDay !== dateStr ? (
                    <button
                      onClick={() => {
                        setAddPlanDay(dateStr);
                        setPlanForm({ type: "easy", distance: "", notes: "" });
                      }}
                      className="mt-auto text-xs rounded-md py-1 text-center"
                      style={{
                        color: "var(--text-muted)",
                        border: "1px dashed var(--border)",
                      }}
                    >
                      +
                    </button>
                  ) : (
                    /* Inline mini-form */
                    <div
                      className="rounded-md p-2 space-y-1.5 mt-auto"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <select
                        value={planForm.type}
                        onChange={(e) => setPlanForm((f) => ({ ...f, type: e.target.value }))}
                        className="w-full rounded px-1 py-1 text-xs"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--text)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {PLAN_TYPE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="km (opt)"
                        value={planForm.distance}
                        onChange={(e) => setPlanForm((f) => ({ ...f, distance: e.target.value }))}
                        className="w-full rounded px-1 py-1 text-xs"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--text)",
                          border: "1px solid var(--border)",
                        }}
                      />
                      <input
                        placeholder="notes (opt)"
                        value={planForm.notes}
                        onChange={(e) => setPlanForm((f) => ({ ...f, notes: e.target.value }))}
                        className="w-full rounded px-1 py-1 text-xs"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--text)",
                          border: "1px solid var(--border)",
                        }}
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => addPlan(dateStr)}
                          className="flex-1 py-1 rounded text-xs font-medium"
                          style={{ background: "var(--accent-green)", color: "#fff" }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setAddPlanDay(null)}
                          className="flex-1 py-1 rounded text-xs"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
