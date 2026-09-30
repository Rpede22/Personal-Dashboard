/**
 * Meal planner — shared types + TheMealDB client (client-safe, no `fs`).
 *
 * TheMealDB is free + keyless (public test key "1"). We use it for:
 *  - search by name         (search.php?s=)
 *  - filter by ingredient   (filter.php?i=)  → basic meal cards (no ingredients)
 *  - full recipe lookup     (lookup.php?i=)  → ingredients + instructions
 *
 * The novel "what can I make" matcher (`findByIngredients`) fans out one filter
 * per pantry ingredient, ranks meals by how many of your ingredients they use,
 * then looks up the top candidates to compute the have/missing breakdown.
 *
 * The weekly plan itself is stored file-based in the route (`meal-plan.json`).
 */

const BASE = "https://www.themealdb.com/api/json/v1/1";

export interface MealIngredient { name: string; measure: string }

export interface Meal {
  id: string;
  title: string;
  thumb?: string;
  category?: string;
  area?: string;
  instructions?: string;
  ingredients: MealIngredient[];
  source?: string;
  youtube?: string;
}

export interface PlannedMeal {
  date: string;   // YYYY-MM-DD
  id: string;
  title: string;
  thumb?: string;
}

/** A user-added dish (any language) — the reliable Danish path. File-based in
 *  `custom-dishes.json`; recipe is optional (free-text steps and/or a URL). */
export interface CustomDish {
  id: string;            // "custom_<ts>"
  title: string;
  recipe?: string;       // free-text instructions
  recipeUrl?: string;    // link to a full recipe
  ingredients?: string[];
  thumb?: string;        // optional image URL
  createdAt: string;
}

/** Adapt a CustomDish to the `Meal` shape so the recipe modal + planner reuse it. */
export function customToMeal(d: CustomDish): Meal {
  return {
    id: d.id,
    title: d.title,
    thumb: d.thumb,
    category: "Your dish",
    instructions: d.recipe,
    ingredients: (d.ingredients ?? []).map((name) => ({ name, measure: "" })),
    source: d.recipeUrl,
  };
}

/** True for ids that belong to a user-added dish (vs a TheMealDB id). */
export function isCustomId(id: string): boolean {
  return id.startsWith("custom_");
}

export interface RecipeMatch {
  meal: Meal;
  /** How many of the recipe's ingredients you already have (fuzzy). */
  haveCount: number;
  total: number;
  /** Recipe ingredients you're missing. */
  missing: string[];
}

// ── normalization ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeMeal(raw: any): Meal {
  const ingredients: MealIngredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (raw[`strIngredient${i}`] ?? "").trim();
    const measure = (raw[`strMeasure${i}`] ?? "").trim();
    if (name) ingredients.push({ name, measure });
  }
  return {
    id: String(raw.idMeal),
    title: raw.strMeal ?? "Untitled",
    thumb: raw.strMealThumb || undefined,
    category: raw.strCategory || undefined,
    area: raw.strArea || undefined,
    instructions: raw.strInstructions || undefined,
    ingredients,
    source: raw.strSource || undefined,
    youtube: raw.strYoutube || undefined,
  };
}

async function mealdb<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawList = { meals: any[] | null };

/** Full-recipe search by name. */
export async function searchMeals(query: string): Promise<Meal[]> {
  const data = await mealdb<RawList>(`/search.php?s=${encodeURIComponent(query)}`);
  return (data?.meals ?? []).map(normalizeMeal);
}

/** One full recipe by id. */
export async function lookupMeal(id: string): Promise<Meal | null> {
  const data = await mealdb<RawList>(`/lookup.php?i=${encodeURIComponent(id)}`);
  const m = data?.meals?.[0];
  return m ? normalizeMeal(m) : null;
}

/** Basic meal cards containing one ingredient (no ingredient list). */
async function filterByIngredient(ingredient: string): Promise<Array<{ id: string; title: string; thumb?: string }>> {
  const q = ingredient.trim().replace(/\s+/g, "_");
  const data = await mealdb<RawList>(`/filter.php?i=${encodeURIComponent(q)}`);
  return (data?.meals ?? []).map((m) => ({ id: String(m.idMeal), title: m.strMeal, thumb: m.strMealThumb || undefined }));
}

/** Case-insensitive fuzzy match — does any pantry item appear in the recipe
 *  ingredient name (or vice versa)? "egg" ↔ "Eggs", "chicken" ↔ "Chicken breast". */
function pantryHas(pantry: string[], ingredient: string): boolean {
  const ing = ingredient.toLowerCase();
  return pantry.some((p) => {
    const a = p.toLowerCase().trim();
    return a.length > 1 && (ing.includes(a) || a.includes(ing));
  });
}

/**
 * "What can I make" — rank meals by how many of your ingredients they use,
 * then compute the have/missing breakdown for the best candidates.
 */
export async function findByIngredients(have: string[], limit = 10): Promise<RecipeMatch[]> {
  const pantry = have.map((s) => s.trim()).filter((s) => s.length > 1).slice(0, 6);
  if (pantry.length === 0) return [];

  // 1. Fan out one filter per pantry item; tally how many of my ingredients
  //    each candidate meal appears under (more = more of my pantry it uses).
  const lists = await Promise.all(pantry.map(filterByIngredient));
  const appearances = new Map<string, { title: string; thumb?: string; count: number }>();
  for (const list of lists) {
    for (const m of list) {
      const cur = appearances.get(m.id);
      if (cur) cur.count++;
      else appearances.set(m.id, { title: m.title, thumb: m.thumb, count: 1 });
    }
  }
  if (appearances.size === 0) return [];

  // 2. Look up the most-promising candidates for the full ingredient list.
  const candidates = [...appearances.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([id]) => id);
  const meals = (await Promise.all(candidates.map(lookupMeal))).filter((m): m is Meal => !!m);

  // 3. Compute have/missing per meal (fuzzy pantry match).
  const matches: RecipeMatch[] = meals.map((meal) => {
    let haveCount = 0;
    const missing: string[] = [];
    for (const ing of meal.ingredients) {
      if (pantryHas(pantry, ing.name)) haveCount++;
      else missing.push(ing.name);
    }
    return { meal, haveCount, total: meal.ingredients.length, missing };
  });

  // 4. Rank: fewest missing first, then most of my pantry used, then simplest.
  matches.sort((a, b) =>
    a.missing.length - b.missing.length ||
    b.haveCount - a.haveCount ||
    a.total - b.total,
  );
  return matches.slice(0, limit);
}

/**
 * Curated common ingredients for the "By ingredients" tick-list (#2). Grouped so
 * the picker reads as a categorised checklist instead of a free-text box. Names
 * are chosen to match TheMealDB's ingredient vocabulary (lowercase, singular-ish)
 * so `findByIngredients` resolves them. Users can still add anything else via the
 * "add other" escape hatch.
 */
export const COMMON_INGREDIENTS: Array<{ category: string; items: string[] }> = [
  { category: "Produce", items: ["onion", "garlic", "tomato", "potato", "carrot", "bell pepper", "mushroom", "spinach", "broccoli", "courgette", "lemon", "lime", "avocado", "chilli"] },
  { category: "Protein", items: ["chicken", "beef", "pork", "bacon", "sausage", "salmon", "tuna", "prawns", "eggs", "tofu", "chickpeas", "kidney beans", "lentils"] },
  { category: "Dairy", items: ["milk", "butter", "cheese", "parmesan", "cream", "yogurt", "mozzarella", "feta"] },
  { category: "Pantry", items: ["rice", "pasta", "spaghetti", "noodles", "flour", "bread", "tortilla", "olive oil", "soy sauce", "tomato paste", "coconut milk", "stock", "honey", "sugar"] },
  { category: "Herbs & spices", items: ["basil", "parsley", "coriander", "oregano", "thyme", "rosemary", "cumin", "paprika", "curry powder", "cinnamon", "ginger", "black pepper", "chilli powder"] },
];
