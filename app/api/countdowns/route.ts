import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { configPath } from "@/lib/config-dir";

/**
 * Countdown-to-event tiles. File-based config (no DB) so it works alongside
 * the other config-dir JSON files:
 *   GET    /api/countdowns          → { countdowns: [{ id, label, date }] }
 *   POST   /api/countdowns          → add { label, date } (date = YYYY-MM-DD)
 *   DELETE /api/countdowns?id=X     → remove one
 *
 * `date` is a plain calendar date (YYYY-MM-DD); the client computes the
 * countdown against local midnight of that day.
 */

const COUNTDOWNS_PATH = configPath("countdowns.json");

export interface Countdown {
  id: string;
  label: string;
  date: string; // YYYY-MM-DD
}

function read(): Countdown[] {
  try {
    const raw = JSON.parse(readFileSync(COUNTDOWNS_PATH, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(list: Countdown[]): void {
  writeFileSync(COUNTDOWNS_PATH, JSON.stringify(list, null, 2));
}

const isDateStr = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET() {
  const countdowns = read().sort((a, b) => a.date.localeCompare(b.date));
  return NextResponse.json({ countdowns });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const label = String(body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  if (!isDateStr(body.date)) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  const list = read();
  const item: Countdown = { id: randomUUID().slice(0, 8), label: label.slice(0, 80), date: body.date };
  list.push(item);
  write(list);
  return NextResponse.json(item);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  write(read().filter((c) => c.id !== id));
  return NextResponse.json({ ok: true });
}
