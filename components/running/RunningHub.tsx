"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  computeWeeklyStats,
  generateNextWeekPlan,
  formatPace,
  type SessionType,
  type DayName,
  type RunDaysPerWeek,
} from "@/lib/training-planner";

const RunDetailModal = dynamic(() => import("./RunDetailModal"), { ssr: false });

interface RunLog {
  id: number;
  date: string;
  distance: number;
  duration: number;
  notes: string | null;
  stravaId: string | null;
}

interface RunPlan {
  id: number;
  date: string;
  distance: number | null;
  type: string;
  notes: string | null;
  completed: boolean;
}

const PLAN_TYPE_OPTIONS = ["easy", "tempo", "speed", "long", "rest"] as const;

const PLAN_TYPE_COLOR: Record<string, string> = {
  easy:  "var(--accent-green)",
  tempo: "var(--accent-orange)",
  speed: "var(--accent-red)",
  long:  "var(--accent-blue)",
  rest:  "var(--text-muted)",
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
  const [raceDistance, setRaceDistance] = useState<number | null>(null);
  const [raceDistanceInput, setRaceDistanceInput] = useState("");
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
  const [monthViewDate, setMonthViewDate] = useState<Date>(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [showMonthView, setShowMonthView] = useState(false);
  const [addPlanDay, setAddPlanDay] = useState<string | null>(null); // date string for inline form
  const [planForm, setPlanForm] = useState({ type: "easy", distance: "", notes: "" });

  // Tabs
  const [activeTab, setActiveTab] = useState<"overview" | "log" | "training">("overview");

  // Training tab → planner apply
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [applyPlanResult, setApplyPlanResult] = useState<string | null>(null);
  // Training tab manual overrides — empty means "use auto-suggested"
  const [targetKmInput, setTargetKmInput] = useState<string>("");
  const [runDaysInput, setRunDaysInput] = useState<RunDaysPerWeek | null>(null);

  // Run detail modal
  const [selectedRun, setSelectedRun] = useState<RunLog | null>(null);
  const [showAllRuns, setShowAllRuns] = useState(false);

  // Strava state
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaHasCredentials, setStravaHasCredentials] = useState(false);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaSyncResult, setStravaSyncResult] = useState<string | null>(null);

  async function loadRuns() {
    setLoading(true);
    try {
      const res = await fetch("/api/running?limit=1000");
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
    setRaceDistance(data.raceDistance ?? null);
    setRaceDistanceInput(data.raceDistance != null ? String(data.raceDistance) : "");
  }

  async function loadPlans(from: Date, to: Date) {
    const res = await fetch(
      `/api/running/plans?from=${toLocalDateStr(from)}&to=${toLocalDateStr(to)}`
    );
    const data = await res.json();
    setPlans(data.plans ?? []);
  }

  async function checkStrava() {
    try {
      const res = await fetch("/api/strava");
      const data = await res.json();
      setStravaConnected(data.connected);
      setStravaHasCredentials(data.hasCredentials);
    } catch {}
  }

  async function syncStrava() {
    setStravaLoading(true);
    setStravaSyncResult(null);
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setStravaSyncResult(`Error: ${data.error}`);
      } else {
        setStravaSyncResult(`Imported ${data.imported}, skipped ${data.skipped} duplicates`);
        loadRuns();
      }
    } catch {
      setStravaSyncResult("Sync failed");
    } finally {
      setStravaLoading(false);
    }
  }

  async function disconnectStrava() {
    await fetch("/api/strava", { method: "DELETE" });
    setStravaConnected(false);
    setStravaSyncResult(null);
  }

  useEffect(() => {
    loadRuns();
    checkStrava();
    loadSummary();
  }, []);

  useEffect(() => {
    // Load plans for visible range
    if (showMonthView) {
      const from = new Date(monthViewDate.getFullYear(), monthViewDate.getMonth(), 1);
      const to = new Date(monthViewDate.getFullYear(), monthViewDate.getMonth() + 1, 0);
      loadPlans(from, to);
    } else {
      const to = new Date(weekStart);
      to.setDate(weekStart.getDate() + 6);
      loadPlans(weekStart, to);
    }
  }, [weekStart, showMonthView, monthViewDate]);

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

  async function saveRaceDistance() {
    const val = raceDistanceInput ? parseFloat(raceDistanceInput) : null;
    await fetch("/api/running/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceDistance: val }),
    });
    setRaceDistance(val);
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

  // Move a plan to a different date (used by drag-drop between day cards).
  // Passes the local YYYY-MM-DD; the API turns it into UTC midnight.
  async function movePlan(planId: number, newDateStr: string) {
    setPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, date: new Date(newDateStr).toISOString() } : p))
    );
    await fetch(`/api/running/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newDateStr }),
    });
  }

  // Track which day is currently a drag target so we can highlight it
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

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

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const thirtyDaysAgoStr = toLocalDateStr(thirtyDaysAgo);
  const monthlyKm = runs
    .filter((r) => toUTCDateStr(new Date(r.date)) >= thirtyDaysAgoStr)
    .reduce((sum, r) => sum + r.distance, 0);

  // Calendar month (1st of this month → now)
  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const thisMonthKm = runs
    .filter((r) => toUTCDateStr(new Date(r.date)) >= monthStartStr)
    .reduce((sum, r) => sum + r.distance, 0);

  // This year (Jan 1 → now)
  const yearStartStr = `${now.getFullYear()}-01-01`;
  const thisYearKm = runs
    .filter((r) => toUTCDateStr(new Date(r.date)) >= yearStartStr)
    .reduce((sum, r) => sum + r.distance, 0);

  const totalKm = runs.reduce((sum, r) => sum + r.distance, 0);

  // A: Weekly mileage — last 12 weeks, oldest first. Label shows Mon–Sun date range.
  const weeklyProgress = Array.from({ length: 12 }, (_, i) => {
    const wMonday = getMondayOf(new Date(now));
    wMonday.setDate(wMonday.getDate() - i * 7);
    const wSunday = new Date(wMonday);
    wSunday.setDate(wMonday.getDate() + 6);
    const wMondayStr = toLocalDateStr(wMonday);
    const wSundayStr = toLocalDateStr(wSunday);
    const km = runs
      .filter((r) => { const d = toUTCDateStr(new Date(r.date)); return d >= wMondayStr && d <= wSundayStr; })
      .reduce((sum, r) => sum + r.distance, 0);
    const startFmt = wMonday.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
    const endFmt   = wSunday.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
    return {
      label: `${startFmt} – ${endFmt}`,
      km,
      isCurrent: i === 0,
    };
  }).reverse();
  const maxWeeklyKm = Math.max(...weeklyProgress.map((w) => w.km), 1);

  // B: Longest run per month — last 6 months, oldest first. Label shows month name only.
  const longestByMonth = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthRuns = runs.filter((r) => toUTCDateStr(new Date(r.date)).startsWith(monthStr));
    const longest = monthRuns.reduce<RunLog | null>(
      (max, r) => (!max || r.distance > max.distance ? r : max),
      null
    );
    return {
      label: d.toLocaleDateString("en-GB", { month: "short" }),
      km: longest?.distance ?? 0,
      date: longest
        ? new Date(longest.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
        : null,
      isCurrent: i === 0,
    };
  }).reverse();
  const maxLongestKm = Math.max(...longestByMonth.map((m) => m.km), 1);

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

  // Month view helpers — use independent monthViewDate, not weekStart
  const monthFirstDay = monthViewDate.getDay(); // 0=Sun
  const daysInMonth = new Date(monthViewDate.getFullYear(), monthViewDate.getMonth() + 1, 0).getDate();
  // Offset: Monday-based calendar
  const startOffset = monthFirstDay === 0 ? 6 : monthFirstDay - 1;

  return (
    <div className="min-h-screen p-6 page-bg">

      {/* ── Sticky header: title + stats bar + tabs ── */}
      <div className="sticky top-[28px] z-10 -mx-6 px-6 pt-5 pb-0 mb-4 page-bg">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: "var(--accent-green)" }}>
            🏃 Running Hub
          </h1>
        </div>

        {/* Stats bar — 2 dp so nothing is rounded away */}
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-3 mb-4">
          {[
            { label: "This week",    value: `${weeklyKm.toFixed(2)} km`,    color: "var(--accent-green)" },
            { label: "Last 30 days", value: `${monthlyKm.toFixed(2)} km`,   color: "var(--accent-green)" },
            { label: "This month",   value: `${thisMonthKm.toFixed(2)} km`, color: "var(--accent-blue)" },
            { label: "This year",    value: `${thisYearKm.toFixed(2)} km`,  color: "var(--accent-purple)" },
            { label: "Total logged", value: `${totalKm.toFixed(2)} km`,     color: "var(--accent-blue)" },
            { label: "Total runs",   value: runs.length.toString(),          color: "var(--accent-purple)" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl p-4 text-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{stat.label}</div>
            </div>
          ))}
          {/* Race stat */}
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="text-2xl font-bold" style={{ color: "var(--accent-orange)" }}>
              {daysToRace !== null ? `${daysToRace}d` : "—"}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {raceDistance ? `to ${raceDistance} km race` : "days to race"}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
          {([
            ["overview", "Overview"],
            ["log",      "Run Log"],
            ["training", "Training"],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-2 text-sm font-medium transition-colors"
              style={{
                color: activeTab === tab ? "var(--accent-green)" : "var(--text-muted)",
                borderBottom: activeTab === tab ? "2px solid var(--accent-green)" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div> {/* end sticky header */}

      {/* ── Overview tab ── */}
      {activeTab === "overview" && (<>

      {/* Training Progress */}
      {runs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* A: Weekly kilometers */}
          <div
            className="rounded-2xl p-4"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--accent-green)" }}>
              Weekly Kilometers — last 12 weeks
            </h3>
            <div className="space-y-2">
              {weeklyProgress.map((w) => (
                <div key={w.label} className="flex items-center gap-2 text-xs">
                  <span className="w-28 text-right flex-shrink-0 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {w.label}
                  </span>
                  <div
                    className="flex-1 rounded-full overflow-hidden relative"
                    style={{ background: "var(--surface-2)", height: "12px" }}
                  >
                    {w.km > 0 && (
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(w.km / maxWeeklyKm) * 100}%`,
                          background: w.isCurrent ? "var(--accent-green)" : "#3a7d55",
                          minWidth: "6px",
                          transition: "width 0.4s",
                        }}
                      />
                    )}
                  </div>
                  <span
                    className="w-16 flex-shrink-0 font-medium"
                    style={{ color: w.isCurrent ? "var(--accent-green)" : "var(--text-muted)" }}
                  >
                    {w.km > 0 ? `${w.km.toFixed(1)} km` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* B: Longest run by month */}
          <div
            className="rounded-2xl p-4"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--accent-blue)" }}>
              Longest Run — last 6 months
            </h3>
            <div className="space-y-2">
              {longestByMonth.map((m) => (
                <div key={m.label} className="flex items-center gap-2 text-xs">
                  <span className="w-14 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                    {m.label}
                  </span>
                  <div
                    className="flex-1 rounded-full overflow-hidden"
                    style={{ background: "var(--surface-2)", height: "12px" }}
                  >
                    {m.km > 0 && (
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(m.km / maxLongestKm) * 100}%`,
                          background: m.isCurrent ? "var(--accent-blue)" : "#2a5a8c",
                          minWidth: "6px",
                          transition: "width 0.4s",
                        }}
                      />
                    )}
                  </div>
                  <div className="w-28 flex-shrink-0">
                    <span
                      className="font-medium"
                      style={{ color: m.isCurrent ? "var(--accent-blue)" : "var(--text-muted)" }}
                    >
                      {m.km > 0 ? `${m.km.toFixed(1)} km` : "—"}
                    </span>
                    {m.date && (
                      <span className="block" style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                        {m.date}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Race distance (km)
          </label>
          <input
            type="number"
            min="0.1"
            step="0.1"
            placeholder="e.g. 21.1"
            value={raceDistanceInput}
            onChange={(e) => setRaceDistanceInput(e.target.value)}
            onBlur={saveRaceDistance}
            className="rounded-lg px-3 py-1.5 text-sm w-28"
            style={{
              background: "var(--surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
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
        {(raceDate || raceDistance) && (
          <button
            onClick={async () => {
              await fetch("/api/running/summary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ raceDate: "", raceDistance: null }),
              });
              setRaceDate("");
              setRaceDateInput("");
              setRaceDistance(null);
              setRaceDistanceInput("");
            }}
            className="px-4 py-1.5 rounded-lg text-sm"
            style={{ background: "var(--surface-2)", color: "var(--accent-red)", border: "1px solid var(--accent-red)" }}
          >
            Clear
          </button>
        )}
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

      {/* Strava integration */}
      <div
        className="rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <span className="text-lg">🏃</span>
        <span className="text-sm font-semibold" style={{ color: "var(--accent-orange)" }}>Strava</span>
        {stravaConnected ? (
          <>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-green)22", color: "var(--accent-green)" }}>Connected</span>
            <button
              onClick={syncStrava}
              disabled={stravaLoading}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--accent-orange)", color: "#fff" }}
            >
              {stravaLoading ? "Syncing…" : "Sync runs"}
            </button>
            <button
              onClick={disconnectStrava}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--surface-2)", color: "var(--accent-red)", border: "1px solid var(--accent-red)" }}
            >
              Disconnect
            </button>
            {stravaSyncResult && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{stravaSyncResult}</span>
            )}
          </>
        ) : stravaHasCredentials ? (
          <a
            href="/api/strava/auth"
            className="px-4 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: "var(--accent-orange)", color: "#fff" }}
          >
            Connect Strava
          </a>
        ) : (
          <div className="text-xs space-y-1" style={{ color: "var(--text-muted)" }}>
            <p className="font-medium" style={{ color: "var(--text)" }}>Setup required — 3 steps:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>
                Create a Strava app at{" "}
                <a
                  href="https://www.strava.com/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "var(--accent-orange)" }}
                >
                  strava.com/settings/api
                </a>
                {" "}— set <em>Authorization Callback Domain</em> to{" "}
                <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>localhost</code>
              </li>
              <li>
                Add to{" "}
                <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>.env.local</code>
                :{" "}
                <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>STRAVA_CLIENT_ID=…</code>{" "}
                <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>STRAVA_CLIENT_SECRET=…</code>
              </li>
              <li>Restart the dev server, then a &quot;Connect Strava&quot; button will appear here</li>
            </ol>
          </div>
        )}
      </div>

      </>)}

      {/* ── Run Log tab ── */}
      {activeTab === "log" && (<>

      {/* Log run button + toggle */}
      <div className="flex items-center gap-3 mb-4 mt-1">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "var(--accent-green)", color: "#fff" }}
        >
          + Log Run
        </button>
        {runs.length > 5 && (
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setShowAllRuns(false)}
              className="px-3 py-1 rounded-lg text-xs"
              style={{
                background: !showAllRuns ? "var(--accent-green)" : "var(--surface)",
                color: !showAllRuns ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              Recent (5)
            </button>
            <button
              onClick={() => setShowAllRuns(true)}
              className="px-3 py-1 rounded-lg text-xs"
              style={{
                background: showAllRuns ? "var(--accent-green)" : "var(--surface)",
                color: showAllRuns ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              All Runs ({runs.length})
            </button>
          </div>
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
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Date</label>
              <input
                required type="date" value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", colorScheme: "dark" }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Distance (km)</label>
              <input
                required type="number" step="0.01" min="0" placeholder="e.g. 10.5"
                value={form.distanceKm}
                onChange={(e) => setForm((f) => ({ ...f, distanceKm: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Duration</label>
              <div className="flex gap-2">
                <input
                  type="number" min="0" placeholder="min" value={form.durationMin}
                  onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                  className="flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                />
                <input
                  type="number" min="0" max="59" placeholder="sec" value={form.durationSec}
                  onChange={(e) => setForm((f) => ({ ...f, durationSec: e.target.value }))}
                  className="flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                />
              </div>
            </div>
          </div>
          <input
            placeholder="Notes (optional)" value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
          />
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--accent-green)", color: "#fff" }}>Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>Cancel</button>
          </div>
        </form>
      )}

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
              {(showAllRuns ? runs : runs.slice(0, 5)).map((run) => (
                <tr
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  className="hover:bg-[var(--surface-2)]"
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
                    {run.stravaId && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full mr-2" style={{ background: "var(--accent-orange)22", color: "var(--accent-orange)" }}>
                        Strava
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteRun(run.id); }}
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

      </>)}

      {/* ─── Run Planner (Overview tab) ─── */}
      {activeTab === "overview" && (<>

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
              onClick={() =>
                setMonthViewDate(
                  new Date(monthViewDate.getFullYear(), monthViewDate.getMonth() - 1, 1)
                )
              }
              className="px-3 py-1 rounded-lg text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text)" }}
            >
              ‹
            </button>
            <span className="font-semibold">
              {MONTH_NAMES[monthViewDate.getMonth()]} {monthViewDate.getFullYear()}
            </span>
            <button
              onClick={() =>
                setMonthViewDate(
                  new Date(monthViewDate.getFullYear(), monthViewDate.getMonth() + 1, 1)
                )
              }
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
              const dateStr = `${monthViewDate.getFullYear()}-${String(monthViewDate.getMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
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
                      title={p.notes ?? undefined}
                    >
                      {p.type}{p.distance ? ` ${p.distance}k` : ""}{p.notes ? " 📝" : ""}
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

              const isDragTarget = dragOverDay === dateStr;
              return (
                <div
                  key={dateStr}
                  className="rounded-xl p-3 flex flex-col gap-1.5 min-h-28 relative"
                  onDragOver={(e) => {
                    // Required to allow a drop
                    if (e.dataTransfer.types.includes("application/x-runplan")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverDay !== dateStr) setDragOverDay(dateStr);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverDay === dateStr) setDragOverDay(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverDay(null);
                    const raw = e.dataTransfer.getData("application/x-runplan");
                    if (!raw) return;
                    const { id, from } = JSON.parse(raw) as { id: number; from: string };
                    if (from === dateStr) return; // same day
                    movePlan(id, dateStr);
                  }}
                  style={{
                    background: isDragTarget
                      ? "var(--accent-green)22"
                      : isToday
                        ? "var(--accent-green)11"
                        : "var(--surface-2)",
                    border: isDragTarget
                      ? "2px dashed var(--accent-green)"
                      : isToday
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

                  {/* Plans (draggable — grab and drop on another day to move) */}
                  {dayPlans.map((p) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(
                          "application/x-runplan",
                          JSON.stringify({ id: p.id, from: dateStr })
                        );
                      }}
                      title="Drag to another day to move"
                      className="rounded-md px-2 py-1 text-xs"
                      style={{
                        background: `${PLAN_TYPE_COLOR[p.type]}22`,
                        color: PLAN_TYPE_COLOR[p.type],
                        border: `1px solid ${PLAN_TYPE_COLOR[p.type]}44`,
                        opacity: p.completed ? 0.5 : 1,
                        cursor: "grab",
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
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
                      {p.notes && (
                        <div
                          className="text-xs mt-1 opacity-80 whitespace-pre-wrap break-words"
                          style={{ color: "inherit", lineHeight: "1.3" }}
                        >
                          {p.notes}
                        </div>
                      )}
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

      </>)}

      {/* ── Training tab ── */}
      {activeTab === "training" && (() => {
        // Derive the last 8 weeks of stats + next-week plan from your run log.
        const weeklyStats = computeWeeklyStats(
          runs.map((r) => ({ date: r.date, distance: r.distance, duration: r.duration })),
          8
        );
        const parsedTarget = targetKmInput.trim() === "" ? undefined : parseFloat(targetKmInput);
        const plan = generateNextWeekPlan(weeklyStats, {
          targetKmOverride: parsedTarget !== undefined && !isNaN(parsedTarget) ? parsedTarget : undefined,
          runDaysPerWeek: runDaysInput ?? undefined,
        });
        const lastCompleted = weeklyStats[weeklyStats.length - 2];
        const currentWeek   = weeklyStats[weeklyStats.length - 1];
        const maxWeekly = Math.max(...weeklyStats.map((w) => w.totalKm), plan.targetKm, 1);

        const SESSION_META: Record<SessionType, { color: string; label: string; icon: string }> = {
          long:  { color: "var(--accent-blue)",   label: "Long run",           icon: "🏃" },
          speed: { color: "var(--accent-red)",    label: "Speed / intervals",  icon: "⚡" },
          tempo: { color: "var(--accent-orange)", label: "Tempo",              icon: "🔥" },
          easy:  { color: "var(--accent-green)",  label: "Easy",               icon: "🌱" },
          rest:  { color: "var(--text-muted)",    label: "Rest",               icon: "💤" },
        };

        // Map DayName → next-week date. If today is already Sunday, next Mon is tomorrow.
        const DAY_INDEX: Record<DayName, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
        function dateOfNextWeek(day: DayName): Date {
          const today = new Date();
          const thisMonday = getMondayOf(today);
          const nextMonday = new Date(thisMonday);
          nextMonday.setDate(thisMonday.getDate() + 7);
          const d = new Date(nextMonday);
          d.setDate(nextMonday.getDate() + DAY_INDEX[day]);
          return d;
        }

        async function applyTrainingPlan() {
          setApplyingPlan(true);
          setApplyPlanResult(null);
          try {
            // Push every session — including rest days — so the planner shows the
            // full recovery-aware week the training tab recommends.
            const workouts = plan.sessions;

            // Delete any existing next-week plans first so re-applying replaces cleanly.
            const nextMonday = dateOfNextWeek("Mon");
            const nextSunday = dateOfNextWeek("Sun");
            const existingRes = await fetch(
              `/api/running/plans?from=${toLocalDateStr(nextMonday)}&to=${toLocalDateStr(nextSunday)}`
            );
            const existing = (await existingRes.json()).plans ?? [];
            await Promise.all(
              existing.map((p: { id: number }) => fetch(`/api/running/plans/${p.id}`, { method: "DELETE" }))
            );

            // Create one plan per workout, tagged with a short note explaining the framework role.
            await Promise.all(
              workouts.map((s) =>
                fetch("/api/running/plans", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    date: toLocalDateStr(dateOfNextWeek(s.day)),
                    type: s.type,
                    distance: s.distanceKm > 0 ? s.distanceKm : null,
                    notes: `${SESSION_META[s.type].label} — ${s.description}`,
                  }),
                })
              )
            );

            // Refresh plans if the user has this week / next week loaded
            const to = new Date(weekStart);
            to.setDate(weekStart.getDate() + 6);
            loadPlans(weekStart, to);

            setApplyPlanResult(`Added ${workouts.length} sessions to next week — swap days in the Overview planner if needed.`);
          } catch (err) {
            setApplyPlanResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setApplyingPlan(false);
          }
        }

        return (
          <div className="space-y-6 max-w-4xl mx-auto">

            {/* ── Last week + current week snapshot ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                  Last completed week
                </div>
                {lastCompleted && lastCompleted.runCount > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-2xl font-bold" style={{ color: "var(--accent-green)" }}>
                        {lastCompleted.totalKm.toFixed(1)}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>km total</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{lastCompleted.runCount}</div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>runs</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold" style={{ color: "var(--accent-blue)" }}>
                        {lastCompleted.longestKm.toFixed(1)}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>km longest</div>
                    </div>
                    <div className="col-span-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      Avg pace: {formatPace(lastCompleted.avgPaceSecPerKm)}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm" style={{ color: "var(--text-muted)" }}>No runs logged last week.</div>
                )}
              </div>

              <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                  This week so far
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-2xl font-bold" style={{ color: "var(--accent-green)" }}>
                      {currentWeek.totalKm.toFixed(1)}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>km logged</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{currentWeek.runCount}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>runs</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold" style={{ color: "var(--accent-blue)" }}>
                      {currentWeek.longestKm.toFixed(1)}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>km longest</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 8-week volume trend ── */}
            <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--accent-green)" }}>
                Weekly volume — last 8 weeks + next-week target
              </h3>
              <div className="space-y-1.5">
                {weeklyStats.map((w, idx) => {
                  const isCurrent = idx === weeklyStats.length - 1;
                  const label = w.weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                  return (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="w-14 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                        {label}
                      </span>
                      <div className="flex-1 rounded-full overflow-hidden" style={{ background: "var(--surface-2)", height: "12px" }}>
                        {w.totalKm > 0 && (
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(w.totalKm / maxWeekly) * 100}%`,
                              background: isCurrent ? "var(--accent-green)" : "#3a7d55",
                              minWidth: "6px",
                            }}
                          />
                        )}
                      </div>
                      <span className="w-16 flex-shrink-0 font-medium" style={{ color: isCurrent ? "var(--accent-green)" : "var(--text-muted)" }}>
                        {w.totalKm > 0 ? `${w.totalKm.toFixed(1)} km` : "—"}
                      </span>
                    </div>
                  );
                })}
                {/* Next-week target bar */}
                <div className="flex items-center gap-2 text-xs pt-1 mt-1 border-t" style={{ borderColor: "var(--border)" }}>
                  <span className="w-14 text-right flex-shrink-0 font-semibold" style={{ color: "var(--accent-orange)" }}>
                    Next
                  </span>
                  <div className="flex-1 rounded-full overflow-hidden" style={{ background: "var(--surface-2)", height: "12px" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(plan.targetKm / maxWeekly) * 100}%`,
                        background: "var(--accent-orange)",
                        minWidth: "6px",
                      }}
                    />
                  </div>
                  <span className="w-16 flex-shrink-0 font-semibold" style={{ color: "var(--accent-orange)" }}>
                    {plan.targetKm.toFixed(1)} km
                  </span>
                </div>
              </div>
            </div>

            {/* ── Warnings ── */}
            {plan.warnings.length > 0 && (
              <div
                className="rounded-2xl p-4 space-y-1 text-sm"
                style={{ background: "var(--surface)", border: "1px solid var(--accent-orange)44", color: "var(--text)" }}
              >
                {plan.warnings.map((w, i) => (
                  <div key={i} className="flex gap-2">
                    <span style={{ color: "var(--accent-orange)" }}>⚠</span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Customise the plan ── */}
            <div
              className="rounded-2xl p-4 flex flex-wrap items-end gap-4"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                  Weekly target (km)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder={`Auto: ${plan.suggestedTargetKm.toFixed(1)}`}
                  value={targetKmInput}
                  onChange={(e) => setTargetKmInput(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-sm w-32"
                  style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                />
                {targetKmInput && (
                  <button
                    onClick={() => setTargetKmInput("")}
                    className="ml-2 text-xs underline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    reset
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                  Run days per week
                </label>
                <div className="flex gap-1">
                  {([3, 4, 5, 6] as const).map((n) => {
                    const active = (runDaysInput ?? plan.runDaysPerWeek) === n;
                    const isAutoValue = runDaysInput === null && plan.runDaysPerWeek === n;
                    return (
                      <button
                        key={n}
                        onClick={() => setRunDaysInput(n)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium"
                        title={isAutoValue ? "Auto (based on weekly volume)" : undefined}
                        style={{
                          background: active ? "var(--accent-green)" : "var(--surface-2)",
                          color: active ? "#fff" : "var(--text-muted)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                  {runDaysInput !== null && (
                    <button
                      onClick={() => setRunDaysInput(null)}
                      className="ml-1 text-xs underline"
                      style={{ color: "var(--text-muted)" }}
                    >
                      auto
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs flex-1 min-w-[15rem]" style={{ color: "var(--text-muted)" }}>
                Tip: start at <strong>3–4</strong> days/week to build the aerobic base, then bump to <strong>5–6</strong> once you feel steady. Auto-picks 3 (starter), 4 (≤24 km), 5 (≤40 km), 6 (&gt;40 km).
              </p>
            </div>

            {/* ── Next-week plan headline ── */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "var(--surface)",
                border: `1px solid ${plan.isCutback ? "var(--accent-purple)" : "var(--accent-orange)"}44`,
              }}
            >
              <div className="flex items-baseline gap-3 mb-2 flex-wrap">
                <h3 className="text-lg font-semibold" style={{ color: plan.isCutback ? "var(--accent-purple)" : "var(--accent-orange)" }}>
                  Next week&apos;s plan
                </h3>
                <span className="text-3xl font-bold" style={{ color: "var(--text)" }}>
                  {plan.targetKm.toFixed(1)} km
                </span>
                {!plan.isStarter && plan.baselineKm > 0 && (
                  <span
                    className="text-sm font-medium"
                    style={{ color: plan.changePct >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}
                  >
                    {plan.changePct >= 0 ? "+" : ""}{plan.changePct.toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>{plan.reason}</p>
              {/* Show both baselines so it's transparent what "smoothed" means */}
              <div className="flex gap-4 text-xs pt-2 border-t" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <span>
                  Last week: <strong style={{ color: "var(--text)" }}>{plan.lastWeekKm.toFixed(1)} km</strong>
                </span>
                <span>
                  {plan.baselineWeeks}-week avg: <strong style={{ color: "var(--text)" }}>{plan.baselineKm.toFixed(1)} km</strong>
                </span>
              </div>
            </div>

            {/* ── Weekly schedule (Mon-Sun) ── */}
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Weekly schedule
                </h3>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Rule: never two hard days in a row · hard sessions ≥ 48 h apart
                </span>
              </div>

              {/* Apply-to-planner action */}
              <div className="mb-3 flex gap-2 flex-wrap items-center">
                <button
                  onClick={applyTrainingPlan}
                  disabled={applyingPlan}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: "var(--accent-green)", color: "#fff" }}
                >
                  {applyingPlan ? "Applying…" : "→ Apply to next week's planner"}
                </button>
                {applyPlanResult && (
                  <span className="text-xs" style={{ color: applyPlanResult.startsWith("Error") ? "var(--accent-red)" : "var(--text-muted)" }}>
                    {applyPlanResult}
                  </span>
                )}
                <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                  Days can be swapped in the Overview tab planner after applying.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                {plan.sessions.map((s) => {
                  const meta = SESSION_META[s.type];
                  const isHard = s.type === "speed" || s.type === "tempo";
                  return (
                    <div
                      key={s.day}
                      className="rounded-xl p-3 flex flex-col gap-1"
                      style={{
                        background: "var(--surface)",
                        border: `1px solid ${meta.color}${isHard ? "66" : "33"}`,
                        minHeight: "110px",
                      }}
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                          {s.day}
                        </span>
                        <span className="text-lg">{meta.icon}</span>
                      </div>
                      <div className="font-semibold text-sm" style={{ color: meta.color }}>
                        {meta.label}
                      </div>
                      {s.distanceKm > 0 && (
                        <div className="text-sm font-bold" style={{ color: "var(--text)" }}>
                          {s.distanceKm.toFixed(1)} km
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Full descriptions below the grid */}
              <div className="mt-4 space-y-2">
                {plan.sessions.filter((s) => s.type !== "rest").map((s) => {
                  const meta = SESSION_META[s.type];
                  return (
                    <div
                      key={s.day}
                      className="rounded-xl p-3 flex items-start gap-3"
                      style={{ background: "var(--surface)", border: `1px solid ${meta.color}33` }}
                    >
                      <span className="text-xl flex-shrink-0 mt-0.5">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3 mb-0.5">
                          <span className="font-semibold" style={{ color: meta.color }}>
                            {s.day} · {meta.label}
                          </span>
                          <span className="text-sm font-bold" style={{ color: "var(--text)" }}>
                            {s.distanceKm.toFixed(1)} km
                          </span>
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{s.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
              Recommendations follow the 80/20 framework and progress by ~10% per week (cutback every 4th).
              Real training reacts to how you feel — treat these as a starting point, not a prescription.
            </p>
          </div>
        );
      })()}

      {/* Run detail modal */}
      {selectedRun && (
        <RunDetailModal run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </div>
  );
}
