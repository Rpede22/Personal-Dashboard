"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Assignment {
  id: number;
  title: string;
  dueDate: string;
  dueTime: string | null;
  subject: string | null;
  priority: string;
  status: string;
  estimatedHours: number | null;
  hoursSpent: number;
}

// Non-overdue statuses the user can manually set
const STATUS_OPTIONS = ["pending", "in_progress", "done"] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
  overdue: "Overdue",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--accent-orange)",
  in_progress: "var(--accent-blue)",
  done: "var(--text-muted)",
  overdue: "var(--accent-red)",
};

// Schedule-aware dot color:
// - Overdue → red
// - Has estimate + needs hard cap (tight deadline) → orange
// - Has estimate + fits soft cap → green
// - No estimate → based on days to deadline
function getDotColor(
  a: { status: string; dueDate: string; estimatedHours: number | null },
  isOverdue: boolean,
  needsHardCapMap: Record<number, boolean>,
  id: number
): string {
  if (isOverdue) return "var(--accent-red)";
  if (a.status === "done") return "var(--text-muted)";
  if (a.estimatedHours) {
    return needsHardCapMap[id] ? "var(--accent-orange)" : "var(--accent-green)";
  }
  // No estimate — use proximity to deadline
  const daysLeft = Math.ceil((new Date(a.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 1) return "var(--accent-red)";
  if (daysLeft <= 4) return "var(--accent-orange)";
  return "var(--accent-green)";
}

export default function SchoolHub() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    dueDate: "",
    dueTime: "",
    subject: "",
    estimatedHours: "",
  });
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [formError, setFormError] = useState<string | null>(null);
  const [loadPlan, setLoadPlan] = useState<Record<string, { assignmentId: number; title: string; hours: number }[]>>({});
  const [estDoneMap, setEstDoneMap] = useState<Record<number, string>>({});
  const [needsHardCapMap, setNeedsHardCapMap] = useState<Record<number, boolean>>({});
  const [hoursSpentEdits, setHoursSpentEdits] = useState<Record<number, string>>({});
  const [estimatedHoursEdits, setEstimatedHoursEdits] = useState<Record<number, string>>({});
  // workDays: JS day numbers (0=Sun…6=Sat) available for school work
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  // hoursPerDay: soft cap — preferred study hours per day
  const [hoursPerDay, setHoursPerDay] = useState<number>(3);
  const [hoursPerDayInput, setHoursPerDayInput] = useState<string>("3");

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/school");
      const data = await res.json();
      setAssignments(data.assignments ?? []);
      setLoadPlan(data.loadPlan ?? {});
      setEstDoneMap(data.estDoneMap ?? {});
      setNeedsHardCapMap(data.needsHardCapMap ?? {});
      if (typeof data.hoursPerDay === "number") {
        setHoursPerDay(data.hoursPerDay);
        setHoursPerDayInput(String(data.hoursPerDay));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetch("/api/school/settings")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.workDays)) setWorkDays(d.workDays);
        if (typeof d.hoursPerDay === "number") {
          setHoursPerDay(d.hoursPerDay);
          setHoursPerDayInput(String(d.hoursPerDay));
        }
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await fetch("/api/school", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          dueDate: form.dueDate,
          dueTime: form.dueTime || null,
          subject: form.subject || null,
          priority: "low",
          estimatedHours: form.estimatedHours || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFormError(body.error ?? `Server error ${res.status} — try restarting npm run dev`);
        return;
      }
      setForm({ title: "", dueDate: "", dueTime: "", subject: "", estimatedHours: "" });
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(`Network error — is the dev server running? (${String(err)})`);
    }
  }

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/school/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
  }

  async function deleteAssignment(id: number) {
    await fetch(`/api/school/${id}`, { method: "DELETE" });
    load(true);
  }

  async function saveEstimatedHours(id: number, rawValue: string) {
    const val = rawValue === "" ? null : parseFloat(rawValue);
    if (val !== null && (isNaN(val) || val <= 0)) return;
    await fetch(`/api/school/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedHours: val }),
    });
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, estimatedHours: val } : a))
    );
    load(true);
  }

  async function saveHoursPerDay(raw: string) {
    const val = parseFloat(raw);
    if (isNaN(val) || val <= 0) return;
    const rounded = Math.round(val * 2) / 2; // nearest 0.5
    setHoursPerDay(rounded);
    setHoursPerDayInput(String(rounded));
    await fetch("/api/school/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hoursPerDay: rounded }),
    });
    load(true);
  }

  async function toggleWorkDay(day: number) {
    const next = workDays.includes(day)
      ? workDays.filter((d) => d !== day)
      : [...workDays, day].sort((a, b) => a - b);
    setWorkDays(next);
    await fetch("/api/school/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workDays: next }),
    });
    load(true);
  }

  async function saveHoursSpent(id: number, rawValue: string) {
    const val = parseFloat(rawValue);
    if (isNaN(val) || val < 0) return;
    const res = await fetch(`/api/school/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hoursSpent: val }),
    });
    if (!res.ok) {
      console.error("Failed to save hours spent:", await res.text());
      return;
    }
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, hoursSpent: val } : a))
    );
    // Silent reload to refresh load plan + est done dates without flicker
    load(true);
  }

  function formatDueDate(dueDate: string): string {
    return new Date(dueDate).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function dueInfo(a: Assignment): { label: string; color: string } {
    if (a.status === "overdue") return { label: "Overdue", color: "var(--accent-red)" };
    const diff = Math.ceil(
      (new Date(a.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (diff < 0) return { label: "Overdue", color: "var(--accent-red)" };
    if (diff === 0) return {
      label: a.dueTime ? `Today ${a.dueTime}` : "Today",
      color: "var(--accent-orange)",
    };
    if (diff === 1) return { label: "Tomorrow", color: "var(--accent-orange)" };
    return {
      label: a.dueTime ? `${diff}d · ${a.dueTime}` : `${diff} days`,
      color: "var(--text-muted)",
    };
  }

  const ALL_FILTER_OPTIONS = ["all", "pending", "in_progress", "overdue", "done"] as const;

  const filtered =
    filterStatus === "all"
      ? assignments.filter((a) => a.status !== "done")
      : assignments.filter((a) => a.status === filterStatus);

  // Sort: overdue first, then by dueDate asc; done tasks at end
  const sortedFiltered = [...filtered].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (a.status !== "done" && b.status === "done") return -1;
    if (a.status === "overdue" && b.status !== "overdue") return -1;
    if (a.status !== "overdue" && b.status === "overdue") return 1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  // Build auto-priority index map: only for active (non-done) sorted by dueDate
  const activeSorted = [...assignments]
    .filter((a) => a.status !== "done")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const priorityIndexMap = new Map(activeSorted.map((a, i) => [a.id, i]));

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--background)" }}>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--accent-orange)" }}>
          📚 School Hub
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="ml-auto px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "var(--accent-orange)", color: "#fff" }}
        >
          + Add Task
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={submit}
          className="rounded-2xl p-5 mb-6 space-y-3"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <h3 className="font-semibold">New Task</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--surface-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            />
            <input
              placeholder="Subject (optional)"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--surface-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            />
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                Due date
              </label>
              <input
                required
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
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
                Due time (optional)
              </label>
              <input
                type="time"
                value={form.dueTime}
                onChange={(e) => setForm((f) => ({ ...f, dueTime: e.target.value }))}
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
                Estimated hours (optional)
              </label>
              <input
                type="number"
                placeholder="e.g. 4"
                value={form.estimatedHours}
                onChange={(e) => setForm((f) => ({ ...f, estimatedHours: e.target.value }))}
                min="0.5"
                step="0.5"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  colorScheme: "dark",
                }}
              />
            </div>
          </div>
          {formError && (
            <p className="text-xs px-1" style={{ color: "var(--accent-red)" }}>
              ⚠ {formError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent-orange)", color: "#fff" }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null); }}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Work days picker */}
      {(() => {
        const DAYS = [
          { label: "Mon", day: 1 },
          { label: "Tue", day: 2 },
          { label: "Wed", day: 3 },
          { label: "Thu", day: 4 },
          { label: "Fri", day: 5 },
          { label: "Sat", day: 6 },
          { label: "Sun", day: 0 },
        ];
        return (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Study days:</span>
            {DAYS.map(({ label, day }) => {
              const active = workDays.includes(day);
              return (
                <button
                  key={day}
                  onClick={() => toggleWorkDay(day)}
                  className="w-9 py-1 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: active ? "var(--accent-indigo)" : "var(--surface-2)",
                    color: active ? "#fff" : "var(--text-muted)",
                    border: active ? "1px solid var(--accent-indigo)" : "1px solid var(--border)",
                  }}
                >
                  {label}
                </button>
              );
            })}
            <span className="text-xs ml-3" style={{ color: "var(--text-muted)" }}>h/day:</span>
            <input
              type="number"
              min="0.5"
              max="16"
              step="0.5"
              value={hoursPerDayInput}
              onChange={(e) => setHoursPerDayInput(e.target.value)}
              onBlur={(e) => saveHoursPerDay(e.target.value)}
              className="w-14 rounded-lg px-2 py-1 text-xs text-center"
              style={{
                background: "var(--surface-2)",
                color: "var(--accent-indigo)",
                border: "1px solid var(--accent-indigo)",
                fontWeight: 600,
              }}
              title="Preferred study hours per day"
            />
          </div>
        );
      })()}

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {ALL_FILTER_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className="px-3 py-1.5 rounded-lg text-sm capitalize transition-colors"
            style={{
              background: filterStatus === s ? "var(--surface)" : "transparent",
              color: filterStatus === s
                ? (s === "overdue" ? "var(--accent-red)" : "var(--accent-orange)")
                : "var(--text-muted)",
              border: filterStatus === s ? "1px solid var(--border)" : "1px solid transparent",
            }}
          >
            {s === "all" ? "All" : STATUS_LABEL[s]}
          </button>
        ))}
        <span className="ml-auto text-sm" style={{ color: "var(--text-muted)" }}>
          {sortedFiltered.length} item{sortedFiltered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Assignment list */}
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : sortedFiltered.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-lg mb-2">No tasks here</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Click &quot;+ Add Task&quot; to add one
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedFiltered.map((a) => {
            const due = dueInfo(a);
            const isOverdue = a.status === "overdue";
            const dotColor = getDotColor(a, isOverdue, needsHardCapMap, a.id);

            return (
              <div
                key={a.id}
                className="rounded-2xl p-4 flex items-center gap-4"
                style={{
                  background: "var(--surface)",
                  border: isOverdue
                    ? "1px solid var(--accent-red)44"
                    : "1px solid var(--border)",
                  opacity: a.status === "done" ? 0.5 : 1,
                }}
              >
                {/* Dot — glows for overdue */}
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{
                    background: dotColor,
                    boxShadow: isOverdue
                      ? "0 0 8px 3px var(--accent-red)"
                      : undefined,
                  }}
                />

                <div className="flex-1 min-w-0">
                  <p
                    className="font-medium"
                    style={{
                      textDecoration: a.status === "done" ? "line-through" : "none",
                    }}
                  >
                    {a.title}
                  </p>
                  {a.status !== "done" && (a.subject || a.dueTime) && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {[a.subject, a.dueTime ? `⏰ ${a.dueTime}` : null].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {a.status === "done" && a.subject && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{a.subject}</p>
                  )}

                  {/* Hours spent row — only for in_progress with estimate */}
                  {a.estimatedHours && a.status === "in_progress" && (
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        Spent:
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={hoursSpentEdits[a.id] ?? a.hoursSpent ?? 0}
                          onChange={(e) =>
                            setHoursSpentEdits((prev) => ({ ...prev, [a.id]: e.target.value }))
                          }
                          onBlur={(e) => saveHoursSpent(a.id, e.target.value)}
                          className="w-14 rounded px-1.5 py-0.5 text-xs"
                          style={{
                            background: "var(--surface-2)",
                            color: "var(--text)",
                            border: "1px solid var(--border)",
                          }}
                        />
                        / {a.estimatedHours}h
                      </label>
                      {estDoneMap[a.id] && (
                        <span className="text-xs font-medium" style={{ color: "var(--accent-indigo)" }}>
                          Est. done{" "}
                          {new Date(estDoneMap[a.id]).toLocaleDateString("en-GB", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Est done for pending tasks with an estimate */}
                  {a.estimatedHours && a.status === "pending" && estDoneMap[a.id] && (
                    <p className="text-xs font-medium mt-1" style={{ color: "var(--accent-indigo)" }}>
                      Est. done{" "}
                      {new Date(estDoneMap[a.id]).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  )}
                </div>

                {/* Right-side info block — est hours (editable) · due date · countdown */}
                {a.status !== "done" && (
                  <div className="flex-shrink-0 text-right space-y-0.5">
                    <div className="flex items-center justify-end gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>Est:</span>
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        placeholder="—"
                        value={estimatedHoursEdits[a.id] ?? (a.estimatedHours ?? "")}
                        onChange={(e) =>
                          setEstimatedHoursEdits((prev) => ({ ...prev, [a.id]: e.target.value }))
                        }
                        onBlur={(e) => saveEstimatedHours(a.id, e.target.value)}
                        className="w-12 rounded px-1 py-0.5 text-xs text-right"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--text)",
                          border: "1px solid var(--border)",
                        }}
                      />
                      <span>h</span>
                    </div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Due: {formatDueDate(a.dueDate)}
                    </p>
                    {!isOverdue && (
                      <p className="text-xs font-semibold" style={{ color: due.color }}>
                        {due.label}
                      </p>
                    )}
                  </div>
                )}

                {/* Status selector — overdue is read-only (only Done clears it) */}
                {isOverdue ? (
                  <span
                    className="rounded-lg px-2 py-1 text-xs font-medium"
                    style={{
                      background: "var(--accent-red)22",
                      color: "var(--accent-red)",
                      border: "1px solid var(--accent-red)44",
                    }}
                  >
                    Overdue
                  </span>
                ) : (
                  <select
                    value={a.status}
                    onChange={(e) => updateStatus(a.id, e.target.value)}
                    className="rounded-lg px-2 py-1 text-xs"
                    style={{
                      background: "var(--surface-2)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                )}

                {/* Done button (always shown for overdue/pending/in_progress) */}
                {a.status !== "done" && (
                  <button
                    onClick={() => updateStatus(a.id, "done")}
                    className="text-xs px-2 py-1 rounded-lg font-medium flex-shrink-0"
                    style={{
                      color: "var(--accent-green)",
                      border: "1px solid var(--accent-green)",
                      background: "transparent",
                    }}
                  >
                    Done
                  </button>
                )}

                <button
                  onClick={() => deleteAssignment(a.id)}
                  className="text-xs px-2 py-1 rounded-lg font-medium"
                  style={{
                    color: "var(--accent-red)",
                    border: "1px solid var(--accent-red)",
                    background: "transparent",
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Work Plan */}
      {Object.keys(loadPlan).length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-3">Work Plan</h3>
          <div className="space-y-2">
            {(() => {
              const now = new Date();
              const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
              return Object.entries(loadPlan)
                .filter(([date]) => date >= localToday)
                .sort(([a], [b]) => a.localeCompare(b));
            })().map(([date, slots]) => {
                const totalHours = Math.ceil(slots.reduce((s, sl) => s + sl.hours, 0) * 2) / 2;
                const planColor = totalHours > hoursPerDay ? "var(--accent-red)" : "var(--accent-green)";
                return (
                  <div
                    key={date}
                    className="rounded-xl p-3"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">
                        {new Date(date).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: planColor }}
                      >
                        {totalHours}h
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {slots.map((slot, i) => (
                        <div key={i} className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                          <span>{slot.title}</span>
                          <span>{Math.ceil(slot.hours * 2) / 2}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
