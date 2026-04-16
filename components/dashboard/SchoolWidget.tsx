"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface Assignment {
  id: number;
  title: string;
  dueDate: string;
  subject: string | null;
  status: string;
}

// Auto-priority: position 0-1 = high, 2-3 = medium, 4+ = low
function autoPriorityColor(index: number): string {
  if (index < 2) return "var(--accent-red)";
  if (index < 4) return "var(--accent-orange)";
  return "var(--accent-green)";
}

export default function SchoolWidget() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/school?status=pending,in_progress")
      .then((r) => r.json())
      .then((d) => {
        const all: Assignment[] = d.assignments ?? [];
        // Sort by dueDate asc for auto-priority
        const sorted = [...all].sort(
          (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        );
        setAssignments(sorted.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function markDone(id: number) {
    await fetch(`/api/school/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  function daysUntil(date: string) {
    const diff = Math.ceil(
      (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (diff < 0) return "Overdue";
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return `${diff}d`;
  }

  return (
    <Card accentColor="var(--accent-orange)">
      <CardHeader
        icon="📚"
        title="School"
        subtitle="Upcoming deadlines"
        accentColor="var(--accent-orange)"
      />

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : assignments.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No upcoming deadlines
        </p>
      ) : (
        <div className="space-y-2">
          {assignments.map((a, idx) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-xl p-2.5"
              style={{ background: "var(--surface-2)" }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: autoPriorityColor(idx) }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.title}</p>
                {a.subject && (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {a.subject}
                  </p>
                )}
              </div>
              <span
                className="text-xs font-semibold flex-shrink-0"
                style={{
                  color:
                    daysUntil(a.dueDate) === "Overdue"
                      ? "var(--accent-red)"
                      : daysUntil(a.dueDate) === "Today"
                      ? "var(--accent-orange)"
                      : "var(--text-muted)",
                }}
              >
                {daysUntil(a.dueDate)}
              </span>
              <button
                onClick={() => markDone(a.id)}
                className="text-xs px-2 py-1 rounded-md font-medium flex-shrink-0"
                style={{
                  background: "var(--accent-green)22",
                  color: "var(--accent-green)",
                  border: "1px solid var(--accent-green)",
                }}
                title="Mark as done"
              >
                ✓
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
