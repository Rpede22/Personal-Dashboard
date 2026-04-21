"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface Assignment {
  id: number;
  title: string;
  dueDate: string;
  dueTime: string | null;
  subject: string | null;
  status: string;
}

// Auto-priority: position 0-1 = high, 2-3 = medium, 4+ = low
function autoPriorityColor(index: number, isOverdue: boolean): string {
  if (isOverdue) return "var(--accent-red)";
  if (index < 2) return "var(--accent-red)";
  if (index < 4) return "var(--accent-indigo)";
  return "var(--accent-green)";
}

export default function SchoolWidget() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/school?status=pending,in_progress,overdue")
      .then((r) => r.json())
      .then((d) => {
        const all: Assignment[] = d.assignments ?? [];
        // Sort: overdue first, then by dueDate asc
        const sorted = [...all].sort((a, b) => {
          if (a.status === "overdue" && b.status !== "overdue") return -1;
          if (a.status !== "overdue" && b.status === "overdue") return 1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
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

  function dueLabel(a: Assignment): string {
    if (a.status === "overdue") return "Overdue";
    const now = Date.now();
    // Build a deadline timestamp combining date + optional time
    const baseDate = new Date(a.dueDate);
    let deadline: number;
    if (a.dueTime) {
      const [hh, mm] = a.dueTime.split(":").map(Number);
      // dueDate is stored as UTC midnight; treat dueTime as local (Copenhagen) time
      const d = new Date(baseDate);
      d.setUTCHours(0, 0, 0, 0);
      // Approximate: use local date components
      const local = new Date(d.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }));
      local.setHours(hh, mm, 0, 0);
      deadline = local.getTime();
    } else {
      // No time set — treat as end of that day
      deadline = baseDate.getTime() + 24 * 60 * 60 * 1000;
    }

    const msLeft = deadline - now;
    if (!a.dueTime) {
      const diffDays = Math.ceil((baseDate.getTime() - now) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) return "Today";
      if (diffDays === 1) return "Tomorrow";
      return `${diffDays}d`;
    }

    // Has a specific time — show exact countdown
    if (msLeft <= 0) return "Overdue";
    const totalMin = Math.floor(msLeft / 60000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours === 0) return `${mins}m`;
    if (hours < 24) return `${hours}h ${mins}m`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }

  function dueColor(a: Assignment): string {
    if (a.status === "overdue") return "var(--accent-red)";
    const now = Date.now();
    const baseDate = new Date(a.dueDate);
    const diff = Math.ceil((baseDate.getTime() - now) / (1000 * 60 * 60 * 24));
    if (diff <= 1) return "var(--accent-indigo)";
    return "var(--text-muted)";
  }

  return (
    <Card accentColor="var(--accent-indigo)">
      <CardHeader
        icon="📚"
        title="School"
        subtitle="Upcoming deadlines"
        accentColor="var(--accent-indigo)"
      />

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : assignments.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No upcoming deadlines
        </p>
      ) : (
        <div className="space-y-2">
          {assignments.map((a, idx) => {
            const isOverdue = a.status === "overdue";
            const dotColor = autoPriorityColor(idx, isOverdue);
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl p-2.5"
                style={{ background: "var(--surface-2)" }}
              >
                {/* Priority / overdue dot — glows red when overdue */}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    background: dotColor,
                    boxShadow: isOverdue
                      ? "0 0 6px 2px var(--accent-red)"
                      : undefined,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <div className="flex items-center gap-1.5">
                    {a.subject && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {a.subject}
                      </span>
                    )}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        background: isOverdue
                          ? "var(--accent-red)22"
                          : a.status === "in_progress"
                          ? "var(--accent-blue)22"
                          : "var(--accent-indigo)22",
                        color: isOverdue
                          ? "var(--accent-red)"
                          : a.status === "in_progress"
                          ? "var(--accent-blue)"
                          : "var(--accent-indigo)",
                        fontSize: "10px",
                      }}
                    >
                      {isOverdue ? "Overdue" : a.status === "in_progress" ? "In Progress" : "Pending"}
                    </span>
                  </div>
                </div>
                {a.status !== "overdue" && (
                  <span
                    className="text-xs font-semibold flex-shrink-0"
                    style={{ color: "#fff" }}
                  >
                    {dueLabel(a)}
                  </span>
                )}
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); markDone(a.id); }}
                  className="text-xs px-2 py-1 rounded-md font-medium flex-shrink-0"
                  style={{
                    background: "var(--accent-green)22",
                    color: "var(--accent-green)",
                    border: "1px solid var(--accent-green)",
                  }}
                  title="Mark as done"
                >
                  DONE
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
