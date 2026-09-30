import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import type { CustomDish } from "@/lib/meals";

/**
 * User-added dishes — file-based (no DB), language-agnostic. The reliable
 * Danish path: add a dish with an optional recipe (free-text and/or URL).
 *   GET    /api/meals/custom            → { dishes }
 *   POST   /api/meals/custom            → add { title, recipe?, recipeUrl?, ingredients?, thumb? }
 *   DELETE /api/meals/custom?id=custom_ → remove one
 */

const FILE = configPath("custom-dishes.json");
const MAX = 200;

function read(): CustomDish[] {
  try {
    const p = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(p?.dishes) ? (p.dishes as CustomDish[]) : [];
  } catch {
    return [];
  }
}
function write(dishes: CustomDish[]): void {
  writeFileSync(FILE, JSON.stringify({ dishes }, null, 2));
}

export function GET() {
  return NextResponse.json({ dishes: read().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "A dish name is required." }, { status: 400 });

  const dishes = read();
  if (dishes.length >= MAX) return NextResponse.json({ error: `Max ${MAX} dishes.` }, { status: 400 });

  const url = String(body.recipeUrl ?? "").trim();
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "The recipe link must start with http(s)://" }, { status: 400 });
  }
  const ingredients = Array.isArray(body.ingredients)
    ? (body.ingredients as unknown[]).map((s) => String(s).trim()).filter(Boolean).slice(0, 40)
    : undefined;

  const dish: CustomDish = {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    recipe: String(body.recipe ?? "").trim() || undefined,
    recipeUrl: url || undefined,
    ingredients: ingredients && ingredients.length > 0 ? ingredients : undefined,
    thumb: String(body.thumb ?? "").trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  dishes.push(dish);
  write(dishes);
  return NextResponse.json({ ok: true, dish });
}

export function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  write(read().filter((d) => d.id !== id));
  return NextResponse.json({ ok: true });
}
