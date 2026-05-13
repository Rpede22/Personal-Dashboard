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
  estimatedHours: number | null;
  hoursSpent: number;
}

interface DaySlot {
  assignmentId: number;
  title: string;
  hours: number;
}

function getDotColor(
  a: Assignment,
  isOverdue: boolean,
  needsHardCapMap: Record<number, boolean>
): string {
  if (isOverdue) return "var(--accent-red)";
  if (a.estimatedHours) {
    return needsHardCapMap[a.id] ? "var(--accent-orange)" : "var(--accent-green)";
  }
  const daysLeft = Math.ceil((new Date(a.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 1) return "var(--accent-red)";
  if (daysLeft <= 4) return "var(--accent-orange)";
  return "var(--accent-green)";
}

function formatDueDate(dueDate: string): string {
  return new Date(dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function SchoolWidget() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadPlan, setLoadPlan] = useState<Record<string, DaySlot[]>>({});
  const [estDoneMap, setEstDoneMap] = useState<Record<number, string>>({});
  const [needsHardCapMap, setNeedsHardCapMap] = useState<Record<number, boolean>>({});
  const [hoursPerDay, setHoursPerDay] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/school?status=pending,in_progress,overdue")
      .then((r) => r.json())
      .then((d) => {
        const all: Assignment[] = d.assignments ?? [];
        const sorted = [...all].sort((a, b) => {
          if (a.status === "overdue" && b.status !== "overdue") return -1;
          if (a.status !== "overdue" && b.status === "overdue") return 1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
        setAssignments(sorted.slice(0, 5));
        setLoadPlan(d.loadPlan ?? {});
        setEstDoneMap(d.estDoneMap ?? {});
        setNeedsHardCapMap(d.needsHardCapMap ?? {});
        setHoursPerDay(d.hoursPerDay ?? 3);
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
          {assignments.map((a) => {
            const isOverdue = a.status === "overdue";
            const dotColor = getDotColor(a, isOverdue, needsHardCapMap);
            const statusColor = isOverdue ? "var(--accent-red)" : a.status === "in_progress" ? "var(--accent-blue)" : "var(--accent-indigo)";
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl p-2.5"
                style={{
                  background: "var(--surface-2)",
                  border: isOverdue ? "1px solid var(--accent-red)33" : "1px solid transparent",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: dotColor, boxShadow: isOverdue ? "0 0 6px 2px var(--accent-red)" : undefined }}
                />

                {/* Left: title + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {a.subject && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{a.subject}</span>}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: `${statusColor}22`, color: statusColor, fontSize: "10px" }}
                    >
                      {isOverdue ? "Overdue" : a.status === "in_progress" ? "In Progress" : "Pending"}
                    </span>
                    {a.status === "in_progress" && a.estimatedHours && (
                      <span className="text-xs" style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                        {a.hoursSpent ?? 0}h / {a.estimatedHours}h spent
                      </span>
                    )}
                    {estDoneMap[a.id] && !isOverdue && (
                      <span className="text-xs font-medium" style={{ color: "var(--accent-indigo)", fontSize: "10px" }}>
                        Est. {new Date(estDoneMap[a.id]).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: estimated · due date · countdown */}
                {a.status !== "done" && (
                  <div className="flex-shrink-0 text-right space-y-0.5">
                    {a.estimatedHours && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Estimated: {a.estimatedHours}h</p>
                    )}
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Due: {formatDueDate(a.dueDate)}</p>
                    {!isOverdue && (
                      <p className="text-xs font-semibold" style={{ color: dueColor(a) }}>{dueLabel(a)}</p>
                    )}
                  </div>
                )}

                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); markDone(a.id); }}
                  className="text-xs px-2 py-1 rounded-md font-medium flex-shrink-0"
                  style={{ background: "var(--accent-green)22", color: "var(--accent-green)", border: "1px solid var(--accent-green)" }}
                >
                  DONE
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Work Plan — next 5 days */}
      {(() => {
        const _now = new Date();
        const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
        const planDays = Object.entries(loadPlan)
          .filter(([date]) => date >= today)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, 5);

        if (planDays.length === 0) return null;

        const allDays = Object.keys(loadPlan).sort();
        const lastDay = allDays[allDays.length - 1];
        const estDone = lastDay
          ? new Date(lastDay).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : null;

        return (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Work Plan
              </span>
              {estDone && (
                <span className="text-xs font-medium" style={{ color: "var(--accent-indigo)" }}>
                  Est. done {estDone}
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {planDays.map(([date, slots]) => {
                const totalHours = Math.ceil(slots.reduce((s, sl) => s + sl.hours, 0) * 2) / 2;
                const planColor = totalHours > hoursPerDay ? "var(--accent-red)" : "var(--accent-green)";
                const dayLabel = new Date(date).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                });
                return (
                  <div
                    key={date}
                    className="rounded-lg px-2.5 py-2"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium">{dayLabel}</span>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: planColor }}
                      >
                        {totalHours}h
                      </span>
                    </div>
                    <div className="space-y-0.5 mt-0.5">
                      {slots.map((s, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                            {s.title}
                          </span>
                          <span className="text-xs font-medium flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                            {Math.ceil(s.hours * 2) / 2}h
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </Card>
  );
}
