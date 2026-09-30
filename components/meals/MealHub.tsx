"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import HubShell from "@/components/HubShell";
import type { Meal, PlannedMeal, RecipeMatch, CustomDish } from "@/lib/meals";
import { customToMeal, isCustomId, COMMON_INGREDIENTS } from "@/lib/meals";
import { useLanguage } from "@/lib/dashboard-settings";

const ACCENT = "var(--accent-orange)";

/** Monday-start week (7 local dates) containing `base`. */
function weekDates(base = new Date()): Date[] {
  const d = new Date(base); d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(d); monday.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(monday); x.setDate(monday.getDate() + i); return x; });
}
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const DAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type FinderMode = "name" | "ingredients";

export default function MealHub() {
  const language = useLanguage();
  const [plan, setPlan] = useState<PlannedMeal[] | null>(null);
  const [dishes, setDishes] = useState<CustomDish[]>([]);
  const week = useMemo(() => weekDates(), []);
  const todayKey = dateKey(new Date());

  const [planningDate, setPlanningDate] = useState<string>(dateKey(new Date()));
  const [mode, setMode] = useState<FinderMode>("ingredients");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [other, setOther] = useState("");
  const [nameResults, setNameResults] = useState<Meal[]>([]);
  const [matches, setMatches] = useState<RecipeMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [detail, setDetail] = useState<Meal | null>(null);

  const loadPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/meals/plan");
      const j = await res.json();
      setPlan(j.plan ?? []);
    } catch { setPlan([]); }
  }, []);
  const loadDishes = useCallback(async () => {
    try {
      const res = await fetch("/api/meals/custom");
      const j = await res.json();
      setDishes(j.dishes ?? []);
    } catch { setDishes([]); }
  }, []);
  useEffect(() => { loadPlan(); loadDishes(); }, [loadPlan, loadDishes]);

  const planByDate = useMemo(() => {
    const m = new Map<string, PlannedMeal>();
    for (const p of plan ?? []) m.set(p.date, p);
    return m;
  }, [plan]);

  // Ingredients search draws from the ticked chips + the free-text "add other".
  const pantry = useMemo(() => {
    const extra = other.split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    return [...new Set([...selected, ...extra])];
  }, [selected, other]);

  function toggleIngredient(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function runSearch() {
    if (mode === "name" ? !query.trim() : pantry.length === 0) return;
    setSearching(true); setSearched(true);
    setNameResults([]); setMatches([]);
    try {
      if (mode === "name") {
        const res = await fetch(`/api/meals/search?q=${encodeURIComponent(query.trim())}`);
        const j = await res.json();
        setNameResults(j.meals ?? []);
      } else {
        const res = await fetch(`/api/meals/search?have=${encodeURIComponent(pantry.join(","))}`);
        const j = await res.json();
        setMatches(j.matches ?? []);
      }
    } catch { /* ignore */ }
    finally { setSearching(false); }
  }

  async function assign(meal: { id: string; title: string; thumb?: string }) {
    const res = await fetch("/api/meals/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: planningDate, id: meal.id, title: meal.title, thumb: meal.thumb }),
    });
    const j = await res.json();
    if (res.ok) setPlan(j.plan ?? []);
  }
  async function clearDay(date: string) {
    const res = await fetch(`/api/meals/plan?date=${date}`, { method: "DELETE" });
    const j = await res.json();
    if (res.ok) setPlan(j.plan ?? []);
  }
  async function viewRecipe(id: string) {
    // Custom dishes aren't in TheMealDB — build the modal from the loaded list.
    if (isCustomId(id)) {
      const dish = dishes.find((d) => d.id === id);
      if (dish) setDetail(customToMeal(dish));
      return;
    }
    try {
      const res = await fetch(`/api/meals/search?id=${encodeURIComponent(id)}`);
      const j = await res.json();
      if (j.meal) setDetail(j.meal);
    } catch { /* ignore */ }
  }
  async function deleteDish(id: string) {
    if (!confirm("Delete this dish?")) return;
    await fetch(`/api/meals/custom?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    loadDishes();
  }

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;
  const planningLabel = (() => {
    const d = week.find((x) => dateKey(x) === planningDate);
    return d ? `${DAY_LABEL[(d.getDay() + 6) % 7]} ${d.getDate()}` : planningDate;
  })();

  return (
    <HubShell title="Meals" emoji="🍽️" color={ACCENT}>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* This week planner */}
        <div>
          <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>This week</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {week.map((d, i) => {
              const key = dateKey(d);
              const meal = planByDate.get(key);
              const isToday = key === todayKey;
              const isPlanning = key === planningDate;
              return (
                <div key={key} className="rounded-xl overflow-hidden flex flex-col" style={{ background: "var(--surface)", border: `1px solid ${isToday ? ACCENT : isPlanning ? `${ACCENT}88` : "var(--border)"}`, minHeight: 128 }}>
                  <div className="px-2 py-1 text-[11px] font-semibold flex items-center justify-between" style={{ color: isToday ? ACCENT : "var(--text-muted)", background: "var(--surface-2)" }}>
                    <span>{DAY_LABEL[i]} {d.getDate()}{isToday && " ·"}</span>
                    {meal && <button onClick={() => clearDay(key)} title="Clear" style={{ color: "var(--accent-red)" }}>✕</button>}
                  </div>
                  {meal ? (
                    <button onClick={() => viewRecipe(meal.id)} className="flex-1 text-left group" title="View recipe">
                      {meal.thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={meal.thumb} alt="" className="w-full h-14 object-cover" />
                      )}
                      <div className="px-2 py-1 text-xs font-medium line-clamp-2" style={{ color: "var(--text)" }}>{meal.title}</div>
                    </button>
                  ) : (
                    <button
                      onClick={() => { setPlanningDate(key); document.getElementById("meal-finder")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                      className="flex-1 grid place-items-center text-xs"
                      style={{ color: isPlanning ? ACCENT : "var(--text-muted)" }}
                    >{isPlanning ? "▼ planning…" : "+ Plan a meal"}</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Your dishes — custom, any language (the reliable Danish path) */}
        <YourDishes
          dishes={dishes} planningDate={planningDate} planningLabel={planningLabel} week={week}
          onPlanningDate={setPlanningDate}
          onAssign={assign} onView={viewRecipe} onDelete={deleteDish} onAdded={loadDishes} accent={ACCENT}
        />

        {/* Recipe finder (TheMealDB) — English only; Danish uses your own dishes */}
        {language === "da" ? (
          <div className="rounded-2xl p-4 text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
            🔎 Opskriftssøgning er kun på engelsk lige nu (TheMealDB). Tilføj dine egne danske retter ovenfor — eller skift sproget til engelsk i Indstillinger for at søge i den internationale opskriftsdatabase.
          </div>
        ) : (
        <div id="meal-finder" className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Find a meal for</span>
            <select value={planningDate} onChange={(e) => setPlanningDate(e.target.value)} className="text-sm px-2 py-1 rounded-md" style={inputStyle}>
              {week.map((d, i) => <option key={dateKey(d)} value={dateKey(d)}>{DAY_LABEL[i]} {d.getDate()}</option>)}
            </select>
          </div>

          {/* Two distinct modes as full-width tabs */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {([
              ["ingredients", "🧺", "By ingredients", "Tick what you have"],
              ["name", "🔤", "By name", "Search a recipe title"],
            ] as const).map(([m, icon, label, sub]) => {
              const on = mode === m;
              return (
                <button key={m} onClick={() => { setMode(m); setSearched(false); setNameResults([]); setMatches([]); }}
                  className="text-left px-3 py-2 rounded-xl transition-colors"
                  style={{ background: on ? `${ACCENT}18` : "var(--surface-2)", border: `1px solid ${on ? ACCENT : "var(--border)"}` }}>
                  <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: on ? ACCENT : "var(--text)" }}>
                    <span>{icon}</span>{label}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>
                </button>
              );
            })}
          </div>

          {mode === "name" ? (
            /* ── By name ── */
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Search recipes by name — e.g. curry, lasagne, tacos"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                className="text-sm px-2 py-1.5 rounded-md flex-1"
                style={inputStyle}
              />
              <button onClick={runSearch} disabled={searching || !query.trim()} className="text-sm px-4 py-1.5 rounded-md disabled:opacity-40" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
          ) : (
            /* ── By ingredients: categorised tick-list ── */
            <div className="rounded-xl p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
                Tick what&apos;s in your kitchen — you&apos;ll get recipes that use the most of it, fewest extras to buy first.
              </div>
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {COMMON_INGREDIENTS.map((group) => (
                  <div key={group.category}>
                    <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>{group.category}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((ing) => {
                        const on = selected.has(ing);
                        return (
                          <button key={ing} onClick={() => toggleIngredient(ing)} className="text-xs px-2 py-1 rounded-full capitalize"
                            style={{ background: on ? ACCENT : "var(--surface)", color: on ? "#fff" : "var(--text-muted)", border: `1px solid ${on ? ACCENT : "var(--border)"}` }}>
                            {on ? "✓ " : ""}{ing}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mt-3 items-stretch sm:items-center">
                <input
                  type="text"
                  placeholder="Add other ingredients (comma-separated)…"
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                  className="text-sm px-2 py-1.5 rounded-md flex-1"
                  style={inputStyle}
                />
                {selected.size > 0 && (
                  <button onClick={() => setSelected(new Set())} className="text-xs px-3 py-1.5 rounded-md" style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                    Clear ({selected.size})
                  </button>
                )}
                <button onClick={runSearch} disabled={searching || pantry.length === 0} className="text-sm px-4 py-1.5 rounded-md disabled:opacity-40" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>
                  {searching ? "Searching…" : `Find recipes${pantry.length ? ` (${pantry.length})` : ""}`}
                </button>
              </div>
            </div>
          )}

          {/* Results */}
          <div className="mt-4">
            {mode === "name" ? (
              searched && !searching && nameResults.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>No recipes found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {nameResults.map((m) => (
                    <ResultCard key={m.id} thumb={m.thumb} title={m.title} sub={[m.category, m.area].filter(Boolean).join(" · ")}
                      onView={() => viewRecipe(m.id)} onAdd={() => assign(m)} planningLabel={planningLabel} accent={ACCENT} />
                  ))}
                </div>
              )
            ) : (
              searched && !searching && matches.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>No matching recipes — try fewer or more common ingredients.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {matches.map((match) => (
                    <ResultCard key={match.meal.id} thumb={match.meal.thumb} title={match.meal.title}
                      sub={[match.meal.category, match.meal.area].filter(Boolean).join(" · ")}
                      badge={match.missing.length === 0 ? { text: "have everything", color: "var(--accent-green)" }
                        : match.missing.length <= 2 ? { text: `need only ${match.missing.length}`, color: ACCENT }
                        : { text: `${match.haveCount}/${match.total} on hand`, color: "var(--text-muted)" }}
                      footer={match.missing.length > 0 ? `Buy: ${match.missing.slice(0, 4).join(", ")}${match.missing.length > 4 ? "…" : ""}` : "You have every ingredient 🎉"}
                      onView={() => viewRecipe(match.meal.id)} onAdd={() => assign(match.meal)} planningLabel={planningLabel} accent={ACCENT} />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
        )}
      </div>

      {detail && <RecipeModal meal={detail} onClose={() => setDetail(null)} onAdd={() => { assign(detail); setDetail(null); }} planningLabel={planningLabel} accent={ACCENT} />}
    </HubShell>
  );
}

function YourDishes({ dishes, planningDate, planningLabel, week, onPlanningDate, onAssign, onView, onDelete, onAdded, accent }: {
  dishes: CustomDish[];
  planningDate: string; planningLabel: string; week: Date[];
  onPlanningDate: (k: string) => void;
  onAssign: (m: { id: string; title: string; thumb?: string }) => void;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
  onAdded: () => void;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [recipe, setRecipe] = useState("");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [thumb, setThumb] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  async function add() {
    if (!title.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/meals/custom", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), recipe: recipe.trim() || undefined, recipeUrl: recipeUrl.trim() || undefined,
          ingredients: ingredients.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
          thumb: thumb.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't add that dish."); return; }
      setTitle(""); setRecipe(""); setRecipeUrl(""); setIngredients(""); setThumb(""); setOpen(false);
      onAdded();
    } catch { setError("Network error."); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Your dishes</h3>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>({dishes.length}) — your own recipes, any language</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Plan for</span>
          <select value={planningDate} onChange={(e) => onPlanningDate(e.target.value)} className="text-sm px-2 py-1 rounded-md" style={inputStyle}>
            {week.map((d, i) => <option key={dateKey(d)} value={dateKey(d)}>{DAY_LABEL[i]} {d.getDate()}</option>)}
          </select>
          <button onClick={() => setOpen((o) => !o)} className="text-xs px-2.5 py-1.5 rounded-md font-medium" style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}` }}>
            {open ? "Cancel" : "＋ Add your own"}
          </button>
        </div>
      </div>

      {open && (
        <div className="rounded-xl p-3 mb-3 space-y-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <input type="text" placeholder="Dish name (required) — e.g. Frikadeller med kartofler" value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm px-2 py-1.5 rounded-md w-full" style={inputStyle} />
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="url" placeholder="Recipe link (optional)" value={recipeUrl} onChange={(e) => setRecipeUrl(e.target.value)} className="text-sm px-2 py-1.5 rounded-md flex-1" style={inputStyle} />
            <input type="url" placeholder="Image URL (optional)" value={thumb} onChange={(e) => setThumb(e.target.value)} className="text-sm px-2 py-1.5 rounded-md flex-1" style={inputStyle} />
          </div>
          <input type="text" placeholder="Ingredients (optional) — comma separated" value={ingredients} onChange={(e) => setIngredients(e.target.value)} className="text-sm px-2 py-1.5 rounded-md w-full" style={inputStyle} />
          <textarea placeholder="Recipe / steps (optional)" value={recipe} onChange={(e) => setRecipe(e.target.value)} rows={4} className="text-sm px-2 py-1.5 rounded-md w-full resize-y" style={inputStyle} />
          {error && <div className="text-xs" style={{ color: "var(--accent-red)" }}>{error}</div>}
          <div className="flex justify-end">
            <button onClick={add} disabled={busy || !title.trim()} className="text-sm px-4 py-1.5 rounded-md disabled:opacity-40 font-medium" style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}` }}>{busy ? "Saving…" : "Save dish"}</button>
          </div>
        </div>
      )}

      {dishes.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No dishes yet — add your favourites (they work in any language and don&apos;t need a recipe).</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {dishes.map((d) => (
            <div key={d.id} className="rounded-xl overflow-hidden flex flex-col" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              {d.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <button onClick={() => onView(d.id)}><img src={d.thumb} alt="" className="w-full h-24 object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /></button>
              )}
              <div className="p-2 flex flex-col gap-1 flex-1">
                <div className="flex items-start gap-1">
                  <span className="text-sm font-semibold leading-tight flex-1">{d.title}</span>
                  <button onClick={() => onDelete(d.id)} className="text-xs shrink-0" style={{ color: "var(--accent-red)" }} title="Delete">✕</button>
                </div>
                {(d.recipe || d.recipeUrl || (d.ingredients && d.ingredients.length > 0)) && (
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{d.recipeUrl ? "Has a recipe link" : d.recipe ? "Has a recipe" : `${d.ingredients?.length} ingredients`}</div>
                )}
                <div className="flex gap-2 mt-auto pt-1">
                  {(d.recipe || d.recipeUrl || (d.ingredients && d.ingredients.length > 0)) && (
                    <button onClick={() => onView(d.id)} className="text-xs px-2 py-1 rounded" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>Recipe</button>
                  )}
                  <button onClick={() => onAssign({ id: d.id, title: d.title, thumb: d.thumb })} className="text-xs px-2 py-1 rounded font-medium" style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}` }}>+ {planningLabel}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({ thumb, title, sub, badge, footer, onView, onAdd, planningLabel, accent }: {
  thumb?: string; title: string; sub?: string;
  badge?: { text: string; color: string }; footer?: string;
  onView: () => void; onAdd: () => void; planningLabel: string; accent: string;
}) {
  return (
    <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <button onClick={onView} className="block"><img src={thumb} alt="" className="w-full h-28 object-cover" /></button>
      )}
      <div className="p-2 flex flex-col gap-1 flex-1">
        <div className="flex items-start gap-1">
          <span className="text-sm font-semibold leading-tight flex-1">{title}</span>
          {badge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${badge.color}22`, color: badge.color }}>{badge.text}</span>}
        </div>
        {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
        {footer && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{footer}</div>}
        <div className="flex gap-2 mt-auto pt-1">
          <button onClick={onView} className="text-xs px-2 py-1 rounded" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>Recipe</button>
          <button onClick={onAdd} className="text-xs px-2 py-1 rounded font-medium" style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}` }}>+ {planningLabel}</button>
        </div>
      </div>
    </div>
  );
}

function RecipeModal({ meal, onClose, onAdd, planningLabel, accent }: { meal: Meal; onClose: () => void; onAdd: () => void; planningLabel: string; accent: string }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onEsc); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", paddingTop: 40 }} onClick={onClose}>
      <div className="rounded-2xl overflow-hidden flex flex-col max-w-2xl w-full" style={{ background: "var(--surface)", border: "1px solid var(--border)", maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="font-semibold flex-1 truncate">{meal.title}</span>
          <button onClick={onAdd} className="text-xs px-2 py-1 rounded font-medium" style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}` }}>+ {planningLabel}</button>
          <button onClick={onClose} className="text-lg leading-none px-1" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          <div className="flex gap-3">
            {meal.thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={meal.thumb} alt="" className="w-32 h-32 rounded-lg object-cover shrink-0" />
            )}
            <div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{[meal.category, meal.area].filter(Boolean).join(" · ")}</div>
              <ul className="text-sm mt-1 space-y-0.5">
                {meal.ingredients.map((ing, i) => (
                  <li key={i}><span className="font-medium">{ing.name}</span>{ing.measure && <span style={{ color: "var(--text-muted)" }}> — {ing.measure}</span>}</li>
                ))}
              </ul>
            </div>
          </div>
          {meal.instructions && (
            <div>
              <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Instructions</div>
              <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: "var(--text)" }}>{meal.instructions}</p>
            </div>
          )}
          {(meal.source || meal.youtube) && (
            <div className="flex gap-3 text-xs">
              {meal.source && <a href={meal.source} target="_blank" rel="noreferrer" className="underline" style={{ color: accent }}>Source</a>}
              {meal.youtube && <a href={meal.youtube} target="_blank" rel="noreferrer" className="underline" style={{ color: accent }}>▶ Video</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
