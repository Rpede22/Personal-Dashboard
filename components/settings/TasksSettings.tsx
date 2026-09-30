"use client";

import { useEffect, useState } from "react";
import { PanelIntro } from "@/components/settings/SettingsHelp";
import { PRIORITIES, sortActive, type Task, type Priority } from "@/lib/tasks";

/**
 * Tasks settings panel (#5) — add a few starter to-dos so the Tasks widget/hub
 * aren't empty on day one. Shares the `/api/tasks` endpoints with the hub, which
 * owns the full completion/edit workflow.
 */

const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

export default function TasksSettings() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  function load() {
    fetch("/api/tasks").then((r) => r.json()).then((d) => setTasks(d.tasks ?? [])).catch(() => {});
  }
  useEffect(load, []);

  async function add() {
    if (!title.trim()) return;
    const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), priority }) });
    if (res.ok) { setTitle(""); load(); }
  }
  async function remove(id: string) {
    await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  const open = sortActive(tasks);

  return (
    <div className="space-y-4">
      <PanelIntro accent="var(--accent-indigo)">
        Quick prioritised to-dos — lighter than the School planner (no due dates). Add a few starters; tick them off,
        rename, and reprioritise in the Tasks hub.
      </PanelIntro>

      <div className="flex flex-wrap items-center gap-2">
        <input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          className="flex-1 min-w-[10rem] rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle}>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <button onClick={add} className="text-sm px-4 py-2 rounded-lg font-medium" style={{ background: "var(--accent-indigo)22", color: "var(--accent-indigo)", border: "1px solid var(--accent-indigo)" }}>+ Add</button>
      </div>

      {open.length > 0 && (
        <div className="space-y-1.5">
          {open.map((t) => {
            const meta = PRIORITIES.find((p) => p.value === t.priority);
            return (
              <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm" style={{ background: "var(--surface-2)", borderLeft: `3px solid ${meta?.color ?? "var(--border)"}` }}>
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-[10px] uppercase" style={{ color: meta?.color ?? "var(--text-muted)" }}>{meta?.label}</span>
                <button onClick={() => remove(t.id)} className="text-xs" style={{ color: "var(--accent-red)" }} title="Remove">✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
