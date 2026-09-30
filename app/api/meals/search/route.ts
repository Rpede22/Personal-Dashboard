import { NextResponse } from "next/server";
import { searchMeals, lookupMeal, findByIngredients } from "@/lib/meals";

/**
 * Recipe search via TheMealDB (keyless).
 *   GET /api/meals/search?q=<name>          → { meals }         (full recipes by name)
 *   GET /api/meals/search?have=egg,flour    → { matches }       ("what can I make" ranked)
 *   GET /api/meals/search?id=<mealId>       → { meal }          (one full recipe)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const have = url.searchParams.get("have");
  const q = url.searchParams.get("q");

  if (id) {
    const meal = await lookupMeal(id);
    return NextResponse.json({ meal });
  }
  if (have) {
    const ingredients = have.split(",").map((s) => s.trim()).filter(Boolean);
    const matches = await findByIngredients(ingredients);
    return NextResponse.json({ matches });
  }
  if (q && q.trim()) {
    const meals = await searchMeals(q.trim());
    return NextResponse.json({ meals });
  }
  return NextResponse.json({ meals: [] });
}
