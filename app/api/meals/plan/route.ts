import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { PlannedMeal } from "@/lib/meals";

/**
 * Weekly meal plan — file-based (no DB). One meal per date (dinner).
 *   GET    /api/meals/plan                → { plan: PlannedMeal[] }
 *   POST   /api/meals/plan                → assign { date, id, title, thumb? } (upsert per date)
 *   DELETE /api/meals/plan?date=YYYY-MM-DD → clear that day
 */

const FILE = configPath("meal-plan.json");

function read(): PlannedMeal[] {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(parsed?.plan) ? (parsed.plan as PlannedMeal[]) : [];
  } catch {
    return [];
  }
}
function write(plan: PlannedMeal[]): void {
  writeFileSync(FILE, JSON.stringify({ plan }, null, 2));
}

export function GET() {
  const plan = read().sort((a, b) => a.date.localeCompare(b.date));
  return NextResponse.json({ plan });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const date = String(body.date ?? "");
  const id = String(body.id ?? "");
  const title = String(body.title ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });
  if (!id || !title) return NextResponse.json({ error: "A meal is required." }, { status: 400 });

  const plan = read().filter((p) => p.date !== date); // one meal per day → replace
  plan.push({ date, id, title, thumb: body.thumb ? String(body.thumb) : undefined });
  write(plan);
  return NextResponse.json({ plan: plan.sort((a, b) => a.date.localeCompare(b.date)) });
}

export function DELETE(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  const plan = read().filter((p) => p.date !== date);
  write(plan);
  return NextResponse.json({ plan });
}
