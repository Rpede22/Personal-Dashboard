"use client";

import { useEffect, useMemo, useState } from "react";
import HubShell from "@/components/HubShell";
import {
  Task, Priority, PRIORITIES, priorityMeta,
  sortActive, sortCompleted, openCounts, dueLabel,
} from "@/lib/tasks";

const ACCENT = "var(--accent-indigo)";

interface ApiPayload { tasks: Task[]; openCount: number; counts: Record<Priority, number> }

export default function TasksHub() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/tasks");
      const j: ApiPayload = await res.json();
      setTasks(j.tasks ?? []);
    } catch { setTasks([]); }
  }
  useEffect(() => { load(); }, []);

  async function call(method: string, body?: unknown, query = "") {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/tasks${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Something went wrong."); return; }
      setTasks(j.tasks ?? []);
    } catch { setError("Network error."); }
    finally { setBusy(false); }
  }

  async function add() {
    const t = title.trim();
    if (!t) return;
    await call("POST", { title: t, priority, due: dueDate || undefined, dueTime: dueTime || undefined });
    setTitle(""); setDueDate(""); setDueTime("");
  }
  const setDue = (task: Task, due: string, time: string) => call("PATCH", { id: task.id, due: due || null, dueTime: time || null });

  const toggle = (task: Task) => call("PATCH", { id: task.id, done: !task.done });
  const setTaskPriority = (task: Task, p: Priority) => call("PATCH", { id: task.id, priority: p });
  const remove = (task: Task) => call("DELETE", undefined, `?id=${encodeURIComponent(task.id)}`);
  const clearCompleted = () => {
    if (!confirm("Remove all completed tasks?")) return;
    call("DELETE", undefined, "?clear=completed");
  };

  function startEdit(task: Task) { setEditingId(task.id); setEditTitle(task.title); }
  async function saveEdit() {
    if (!editingId) return;
    const t = editTitle.trim();
    if (t) await call("PATCH", { id: editingId, title: t });
    setEditingId(null); setEditTitle("");
  }

  const active = useMemo(() => (tasks ? sortActive(tasks) : []), [tasks]);
  const completed = useMemo(() => (tasks ? sortCompleted(tasks) : []), [tasks]);
  const counts = useMemo(() => (tasks ? openCounts(tasks) : { high: 0, medium: 0, low: 0 }), [tasks]);

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <HubShell
      title="Tasks"
      emoji="✅"
      color={ACCENT}
      tabs={
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
          <span>{active.length} open</span>
          {PRIORITIES.map((p) => counts[p.value] > 0 && (
            <span key={p.value} className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              {counts[p.value]} {p.label.toLowerCase()}
            </span>
          ))}
          <span className="ml-auto">Quick todos — optional day/time.</span>
        </div>
      }
    >
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Add form */}
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Add a task</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="What needs doing?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              className="text-sm px-2 py-1.5 rounded-md flex-1"
              style={inputStyle}
            />
            <div className="flex gap-1">
              {PRIORITIES.map((p) => {
                const on = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className="text-xs px-2.5 py-1.5 rounded-md font-medium"
                    style={{
                      background: on ? `${p.color}22` : "var(--surface-2)",
                      color: on ? p.color : "var(--text-muted)",
                      border: `1px solid ${on ? p.color : "var(--border)"}`,
                    }}
                  >{p.label}</button>
                );
              })}
            </div>
            <button
              onClick={add}
              disabled={busy || !title.trim()}
              className="text-sm px-3 py-1.5 rounded-md disabled:opacity-40"
              style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}
            >Add</button>
          </div>
          {/* Optional day/time — lighter than the School planner, but precise when you want it. */}
          <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span>📅 When (optional):</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="px-2 py-1 rounded-md" style={inputStyle} />
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!dueDate} className="px-2 py-1 rounded-md disabled:opacity-40" style={inputStyle} title={dueDate ? "Optional time" : "Pick a date first"} />
            {dueDate && <button type="button" onClick={() => { setDueDate(""); setDueTime(""); }} className="underline">clear</button>}
          </div>
          {error && <div className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>{error}</div>}
        </div>

        {/* Active list */}
        {tasks === null ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading tasks…</p>
        ) : active.length === 0 ? (
          <div className="rounded-2xl p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
            🎉 Nothing open — add a task above.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {active.map((task) => {
              const meta = priorityMeta(task.priority);
              const editing = editingId === task.id;
              return (
                <li
                  key={task.id}
                  className="rounded-lg px-3 py-2 flex items-center gap-3"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${meta.color}` }}
                >
                  <button
                    onClick={() => toggle(task)}
                    title="Mark done"
                    className="w-5 h-5 rounded-full shrink-0 grid place-items-center"
                    style={{ border: `2px solid ${meta.color}`, color: meta.color }}
                  >
                    <span className="text-[10px] opacity-0 hover:opacity-100">✓</span>
                  </button>
                  {editing ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") { setEditingId(null); } }}
                      onBlur={saveEdit}
                      className="text-sm px-2 py-1 rounded flex-1"
                      style={inputStyle}
                    />
                  ) : (
                    <span className="flex-1 min-w-0 text-sm truncate cursor-text" onDoubleClick={() => startEdit(task)} title="Double-click to rename">
                      {task.title}
                    </span>
                  )}
                  {/* Optional day/time — set or change inline */}
                  {(() => {
                    const dl = dueLabel(task);
                    return (
                      <span className="flex items-center gap-1 shrink-0" title="Optional day/time">
                        {dl && <span className="text-[10px] px-1.5 py-0.5 rounded hidden sm:inline" style={{ background: dl.overdue ? "var(--accent-red)22" : "var(--surface-2)", color: dl.overdue ? "var(--accent-red)" : "var(--text-muted)" }}>{dl.overdue ? "⚠ " : ""}{dl.text}</span>}
                        <input type="date" value={task.due ?? ""} onChange={(e) => setDue(task, e.target.value, task.dueTime ?? "")}
                          className="text-[11px] px-1 py-0.5 rounded" style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }} />
                        {task.due && (
                          <input type="time" value={task.dueTime ?? ""} onChange={(e) => setDue(task, task.due!, e.target.value)}
                            className="text-[11px] px-1 py-0.5 rounded" style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }} />
                        )}
                      </span>
                    );
                  })()}
                  {/* Priority cycle */}
                  <select
                    value={task.priority}
                    onChange={(e) => setTaskPriority(task, e.target.value as Priority)}
                    className="text-[11px] px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: "var(--surface-2)", color: meta.color, border: `1px solid var(--border)` }}
                    title="Priority"
                  >
                    {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <button onClick={() => remove(task)} className="text-xs shrink-0" style={{ color: "var(--accent-red)" }} title="Delete">✕</button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setShowDone((s) => !s)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                {showDone ? "▾" : "▸"} Completed · {completed.length}
              </button>
              <button onClick={clearCompleted} className="text-xs ml-auto" style={{ color: "var(--accent-red)" }}>Clear completed</button>
            </div>
            {showDone && (
              <ul className="space-y-1">
                {completed.map((task) => (
                  <li key={task.id} className="rounded-lg px-3 py-1.5 flex items-center gap-3" style={{ background: "var(--surface)", border: "1px solid var(--border)", opacity: 0.6 }}>
                    <button
                      onClick={() => toggle(task)}
                      title="Reopen"
                      className="w-5 h-5 rounded-full shrink-0 grid place-items-center text-[10px]"
                      style={{ background: "var(--accent-green)", color: "#fff" }}
                    >✓</button>
                    <span className="flex-1 min-w-0 text-sm line-through truncate">{task.title}</span>
                    <button onClick={() => remove(task)} className="text-xs shrink-0" style={{ color: "var(--accent-red)" }} title="Delete">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </HubShell>
  );
}
