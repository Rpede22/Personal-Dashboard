/**
 * Quick tasks / todo — shared types + pure helpers (client-safe, no `fs`).
 *
 * Deliberately lighter than the School hub: no due-date scheduling, no load
 * distribution — just quick tasks with a priority you can tick off. File-based
 * (`tasks.json`) so it needs no database.
 */

export type Priority = "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  done: boolean;
  note?: string;
  due?: string;              // optional YYYY-MM-DD — lighter than the School planner
  dueTime?: string;          // optional HH:MM (only meaningful with `due`)
  createdAt: string;         // ISO
  completedAt?: string;      // ISO, set when done
}

/** Validate a YYYY-MM-DD date string. */
export function isDateStr(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
/** Validate an HH:MM time string. */
export function isTimeStr(v: unknown): v is string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}
/** A short human label for a task's optional due date/time: "today 14:00",
 *  "Tue 9 Sep", "overdue", "tomorrow", etc. Returns null when no due date. */
export function dueLabel(task: Pick<Task, "due" | "dueTime">, now = new Date()): { text: string; overdue: boolean } | null {
  if (!task.due) return null;
  const [y, m, d] = task.due.split("-").map(Number);
  const at = new Date(y, m - 1, d, ...(task.dueTime ? task.dueTime.split(":").map(Number) as [number, number] : [23, 59]));
  const midToday = new Date(now); midToday.setHours(0, 0, 0, 0);
  const midDue = new Date(y, m - 1, d);
  const diffDays = Math.round((midDue.getTime() - midToday.getTime()) / 86400000);
  const overdue = at.getTime() < now.getTime();
  const t = task.dueTime ? ` ${task.dueTime}` : "";
  let day: string;
  if (diffDays === 0) day = "today";
  else if (diffDays === 1) day = "tomorrow";
  else if (diffDays === -1) day = "yesterday";
  else if (diffDays > 1 && diffDays < 7) day = midDue.toLocaleDateString("en-GB", { weekday: "short" });
  else day = midDue.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return { text: `${day}${t}`, overdue };
}

export const PRIORITIES: { value: Priority; label: string; color: string; rank: number }[] = [
  { value: "high",   label: "High",   color: "var(--accent-red)",    rank: 0 },
  { value: "medium", label: "Medium", color: "var(--accent-orange)", rank: 1 },
  { value: "low",    label: "Low",    color: "var(--accent-green)",  rank: 2 },
];

export function priorityMeta(p: Priority) {
  return PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[1];
}

export function isPriority(v: unknown): v is Priority {
  return v === "high" || v === "medium" || v === "low";
}

/** Open tasks, highest priority first, then oldest first within a priority so
 *  long-standing todos surface above freshly-added ones. */
export function sortActive(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.done)
    .sort((a, b) =>
      priorityMeta(a.priority).rank - priorityMeta(b.priority).rank ||
      a.createdAt.localeCompare(b.createdAt),
    );
}

/** Completed tasks, most-recently-finished first. */
export function sortCompleted(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
}

/** Count of open tasks per priority (for the hub summary + widget). */
export function openCounts(tasks: Task[]): Record<Priority, number> {
  const out: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
  for (const t of tasks) if (!t.done) out[t.priority]++;
  return out;
}
