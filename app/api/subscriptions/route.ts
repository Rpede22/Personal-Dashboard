import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { configPath } from "@/lib/config-dir";
import { CYCLES, monthlyTotal, rollForward, type Cycle, type Subscription } from "@/lib/subscriptions";

/**
 * Subscription tracker. File-based config (no DB), same shape as the other
 * config-dir JSONs:
 *   GET    /api/subscriptions          → { subscriptions[], monthlyTotal, next }
 *   POST   /api/subscriptions          → add { name, amount, cycle, nextCharge, category?, note? }
 *   PATCH  /api/subscriptions          → edit { id, ...fields }
 *   DELETE /api/subscriptions?id=X     → remove one
 *
 * On every read, each `nextCharge` is rolled forward by whole cycles until it's
 * today-or-later (and persisted), so the list always shows the *upcoming*
 * charge without a cron.
 */

const PATH = configPath("subscriptions.json");
const CYCLE_VALUES = CYCLES.map((c) => c.value);

function read(): Subscription[] {
  try {
    const raw = JSON.parse(readFileSync(PATH, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function write(list: Subscription[]): void {
  writeFileSync(PATH, JSON.stringify(list, null, 2));
}

const isDateStr = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isCycle = (s: unknown): s is Cycle => typeof s === "string" && (CYCLE_VALUES as string[]).includes(s);

function payload(list: Subscription[]) {
  const sorted = [...list].sort((a, b) => a.nextCharge.localeCompare(b.nextCharge));
  return {
    subscriptions: sorted,
    monthlyTotal: monthlyTotal(sorted),
    next: sorted[0] ?? null,
  };
}

export async function GET() {
  const list = read();
  // Roll each charge date forward to the next upcoming occurrence; persist if
  // anything actually changed so we don't rewrite the file on every request.
  let changed = false;
  const rolled = list.map((s) => {
    const next = rollForward(s.nextCharge, s.cycle);
    if (next !== s.nextCharge) changed = true;
    return { ...s, nextCharge: next };
  });
  if (changed) write(rolled);
  return NextResponse.json(payload(rolled));
}

function sanitize(body: Record<string, unknown>, base?: Subscription): Subscription | { error: string } {
  const name = body.name !== undefined ? String(body.name).trim() : base?.name ?? "";
  if (!name) return { error: "name required" };
  const amountRaw = body.amount !== undefined ? Number(body.amount) : base?.amount;
  if (amountRaw === undefined || !Number.isFinite(amountRaw) || amountRaw < 0 || amountRaw > 1_000_000) {
    return { error: "amount must be 0–1000000" };
  }
  const cycle = body.cycle !== undefined ? body.cycle : base?.cycle;
  if (!isCycle(cycle)) return { error: `cycle must be one of ${CYCLE_VALUES.join(", ")}` };
  const nextCharge = body.nextCharge !== undefined ? body.nextCharge : base?.nextCharge;
  if (!isDateStr(nextCharge)) return { error: "nextCharge must be YYYY-MM-DD" };
  return {
    id: base?.id ?? randomUUID().slice(0, 8),
    name: name.slice(0, 80),
    amount: Math.round(amountRaw * 100) / 100,
    cycle,
    nextCharge: rollForward(nextCharge, cycle),
    category: body.category !== undefined ? String(body.category).trim().slice(0, 40) || undefined : base?.category,
    note: body.note !== undefined ? String(body.note).trim().slice(0, 200) || undefined : base?.note,
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = sanitize(body);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  const list = read();
  list.push(result);
  write(list);
  return NextResponse.json(payload(list));
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const list = read();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });
  const result = sanitize(body, list[idx]);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  list[idx] = result;
  write(list);
  return NextResponse.json(payload(list));
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  write(read().filter((s) => s.id !== id));
  return NextResponse.json(payload(read().filter((s) => s.id !== id)));
}
