"use client";

import { useEffect, useMemo, useState } from "react";
import Card, { CardHeader } from "@/components/Card";
import { Task, Priority, priorityMeta, sortActive, openCounts } from "@/lib/tasks";
import { useRefreshMs } from "@/lib/useRefreshMs";

/** Top open tasks by priority, with an inline tick to complete. Links to /tasks. */
export default function TasksWidget() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const refreshMs = useRefreshMs("tasks", 0);

  async function load() {
    try {
      const res = await fetch("/api/tasks");
      const j = await res.json();
      setTasks(j.tasks ?? []);
    } catch { setTasks([]); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (refreshMs === 0) return;
    const iv = setInterval(load, refreshMs);
    return () => clearInterval(iv);
  }, [refreshMs]);

  async function complete(id: string) {
    // Optimistic — hide immediately, then persist.
    setTasks((prev) => prev ? prev.map((t) => t.id === id ? { ...t, done: true } : t) : prev);
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done: true }),
      });
      load();
    } catch { load(); }
  }

  const active = useMemo(() => (tasks ? sortActive(tasks) : []), [tasks]);
  const counts = useMemo(() => (tasks ? openCounts(tasks) : { high: 0, medium: 0, low: 0 } as Record<Priority, number>), [tasks]);
  const top = active.slice(0, 5);

  return (
    <Card accentColor="var(--accent-indigo)">
      <CardHeader
        icon="✅"
        title="Tasks"
        subtitle={tasks === null ? "" : `${active.length} open${counts.high ? ` · ${counts.high} high` : ""}`}
        accentColor="var(--accent-indigo)"
      />
      {tasks === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : top.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>🎉 All clear — add tasks in the hub.</p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((task) => {
            const meta = priorityMeta(task.priority);
            return (
              <li
                key={task.id}
                className="text-sm flex items-center gap-2 rounded-md px-2 py-1"
                style={{ background: "var(--surface-2)", borderLeft: `3px solid ${meta.color}` }}
              >
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); complete(task.id); }}
                  title="Mark done"
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ border: `2px solid ${meta.color}` }}
                />
                <span className="flex-1 min-w-0 truncate">{task.title}</span>
                <span className="text-[10px] uppercase tracking-wide shrink-0" style={{ color: meta.color }}>{task.priority}</span>
              </li>
            );
          })}
          {active.length > top.length && (
            <li className="text-[11px] pt-0.5" style={{ color: "var(--text-muted)" }}>+{active.length - top.length} more</li>
          )}
        </ul>
      )}
    </Card>
  );
}
