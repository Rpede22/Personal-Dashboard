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

// Auto-priority: sort pending+in_progress+overdue by dueDate asc, position 1-2=high, 3-4=medium, 5+=low
function getAutoPriorityColor(index: number, isOverdue: boolean): string {
  if (isOverdue) return "var(--accent-red)";
  if (index < 2) return "var(--accent-red)";
  if (index < 4) return "var(--accent-orange)";
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
  });
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/school");
      const data = await res.json();
      setAssignments(data.assignments ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
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
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFormError(body.error ?? `Server error ${res.status} — try restarting npm run dev`);
        return;
      }
      setForm({ title: "", dueDate: "", dueTime: "", subject: "" });
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
    setAssignments((prev) => prev.filter((a) => a.id !== id));
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
      ? assignments
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
            const priorityIdx = priorityIndexMap.get(a.id);
            const dotColor =
              a.status === "done"
                ? "var(--text-muted)"
                : getAutoPriorityColor(priorityIdx ?? 99, isOverdue);

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
                </div>

                {a.status !== "done" && a.status !== "overdue" && (
                  <span className="text-sm font-semibold flex-shrink-0" style={{ color: due.color }}>
                    {due.label}
                  </span>
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
    </div>
  );
}
