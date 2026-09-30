import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { Task, isPriority, openCounts, isDateStr, isTimeStr } from "@/lib/tasks";

/**
 * Quick-tasks tracker — file-based (no DB).
 *   GET    /api/tasks          → { tasks, openCount, counts }
 *   POST   /api/tasks          → add { title, priority?, note? }
 *   PATCH  /api/tasks          → edit { id, title?, priority?, note?, done? }
 *   DELETE /api/tasks?id=X     → remove one
 *   DELETE /api/tasks?clear=completed → remove all done tasks
 */

const FILE = configPath("tasks.json");
const MAX_TASKS = 500;

function readTasks(): Task[] {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(parsed?.tasks) ? (parsed.tasks as Task[]) : [];
  } catch {
    return [];
  }
}

function writeTasks(tasks: Task[]): void {
  writeFileSync(FILE, JSON.stringify({ tasks }, null, 2));
}

function payload(tasks: Task[]) {
  return { tasks, openCount: tasks.filter((t) => !t.done).length, counts: openCounts(tasks) };
}

export function GET() {
  return NextResponse.json(payload(readTasks()));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "A task title is required." }, { status: 400 });
  const tasks = readTasks();
  if (tasks.length >= MAX_TASKS) return NextResponse.json({ error: `Max ${MAX_TASKS} tasks.` }, { status: 400 });
  const priority = isPriority(body.priority) ? body.priority : "medium";
  const task: Task = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    priority,
    done: false,
    note: body.note ? String(body.note).trim() || undefined : undefined,
    due: isDateStr(body.due) ? body.due : undefined,
    dueTime: isDateStr(body.due) && isTimeStr(body.dueTime) ? body.dueTime : undefined,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  writeTasks(tasks);
  return NextResponse.json(payload(tasks));
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const tasks = readTasks();
  const t = tasks.find((x) => x.id === id);
  if (!t) return NextResponse.json({ error: "Unknown task." }, { status: 404 });
  if ("title" in body) {
    const title = String(body.title ?? "").trim();
    if (title) t.title = title;
  }
  if (isPriority(body.priority)) t.priority = body.priority;
  if ("note" in body) t.note = String(body.note ?? "").trim() || undefined;
  // due: a valid date sets it; null/"" clears it (and its time).
  if ("due" in body) {
    t.due = isDateStr(body.due) ? body.due : undefined;
    if (!t.due) t.dueTime = undefined;
  }
  if ("dueTime" in body) t.dueTime = t.due && isTimeStr(body.dueTime) ? body.dueTime : undefined;
  if ("done" in body) {
    t.done = Boolean(body.done);
    t.completedAt = t.done ? new Date().toISOString() : undefined;
  }
  writeTasks(tasks);
  return NextResponse.json(payload(tasks));
}

export function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const clear = url.searchParams.get("clear");
  let tasks = readTasks();
  if (clear === "completed") {
    tasks = tasks.filter((t) => !t.done);
  } else if (id) {
    tasks = tasks.filter((t) => t.id !== id);
  }
  writeTasks(tasks);
  return NextResponse.json(payload(tasks));
}
