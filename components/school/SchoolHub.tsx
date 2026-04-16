"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Assignment {
  id: number;
  title: string;
  dueDate: string;
  subject: string | null;
  priority: string;
  status: string;
}

const STATUS_OPTIONS = ["pending", "in_progress", "done"] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
};

// Auto-priority: sort pending+in_progress by dueDate asc, position 1-2=high, 3-4=medium, 5+=low
function getAutoPriorityColor(index: number): string {
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
    subject: "",
  });
  const [filterStatus, setFilterStatus] = useState<string>("all");

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
    await fetch("/api/school", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, priority: "low" }),
    });
    setForm({ title: "", dueDate: "", subject: "" });
    setShowForm(false);
    load();
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

  function daysUntil(date: string) {
    const diff = Math.ceil(
      (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (diff < 0) return { label: "Overdue", color: "var(--accent-red)" };
    if (diff === 0) return { label: "Today", color: "var(--accent-orange)" };
    if (diff === 1) return { label: "Tomorrow", color: "var(--accent-orange)" };
    return { label: `${diff} days`, color: "var(--text-muted)" };
  }

  const filtered =
    filterStatus === "all"
      ? assignments
      : assignments.filter((a) => a.status === filterStatus);

  // Sort filtered list — pending/in_progress by dueDate asc; done tasks at end
  const sortedFiltered = [...filtered].sort((a, b) => {
    const aActive = a.status !== "done";
    const bActive = b.status !== "done";
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  // Build auto-priority index map: only for pending+in_progress sorted by dueDate
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
            <input
              required
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--surface-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                colorScheme: "dark",
              }}
            />
          </div>
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
              onClick={() => setShowForm(false)}
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
        {["all", ...STATUS_OPTIONS].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className="px-3 py-1.5 rounded-lg text-sm capitalize transition-colors"
            style={{
              background: filterStatus === s ? "var(--surface)" : "transparent",
              color: filterStatus === s ? "var(--accent-orange)" : "var(--text-muted)",
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
            const due = daysUntil(a.dueDate);
            const priorityIdx = priorityIndexMap.get(a.id);
            const dotColor =
              a.status === "done"
                ? "var(--text-muted)"
                : priorityIdx !== undefined
                ? getAutoPriorityColor(priorityIdx)
                : "var(--text-muted)";

            return (
              <div
                key={a.id}
                className="rounded-2xl p-4 flex items-center gap-4"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  opacity: a.status === "done" ? 0.5 : 1,
                }}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: dotColor }}
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
                  {a.subject && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {a.subject}
                    </p>
                  )}
                </div>

                <span className="text-sm font-semibold" style={{ color: due.color }}>
                  {due.label}
                </span>

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

                <button
                  onClick={() => deleteAssignment(a.id)}
                  className="text-xs px-2 py-1 rounded-lg font-medium"
                  style={{
                    color: "var(--accent-red)",
                    border: "1px solid var(--accent-red)",
                    background: "transparent",
                  }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
