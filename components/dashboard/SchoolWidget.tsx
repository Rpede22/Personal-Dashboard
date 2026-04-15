"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface Assignment {
  id: number;
  title: string;
  dueDate: string;
  subject: string | null;
  priority: string;
  status: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: "var(--accent-red)",
  medium: "var(--accent-orange)",
  low: "var(--accent-green)",
};

export default function SchoolWidget() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/school?limit=3&status=pending,in_progress")
      .then((r) => r.json())
      .then((d) => setAssignments(d.assignments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
          {assignments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-xl p-2.5"
              style={{ background: "var(--surface-2)" }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: PRIORITY_COLOR[a.priority] ?? "var(--text-muted)" }}
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
                  color: daysUntil(a.dueDate) === "Overdue"
                    ? "var(--accent-red)"
                    : daysUntil(a.dueDate) === "Today"
                    ? "var(--accent-orange)"
                    : "var(--text-muted)",
                }}
              >
                {daysUntil(a.dueDate)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
