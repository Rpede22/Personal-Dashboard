/**
 * Budget planner — types + pure calc helpers (client-safe, no `fs`).
 * A faithful port of the Avalonia BudgetProgram's model:
 *
 *  - A **default monthly budget** (the income/cap) applies to every month,
 *    with optional **per-month overrides**.
 *  - **Plans** allocate an amount to a category, either every month
 *    ("monthly") or only in a specific month ("selected"). Same-category
 *    monthly plans stack.
 *  - Per month: budget vs. total allocated vs. remaining, plus a per-category
 *    breakdown (drives the pie + the year bar chart).
 *
 * Persisted (server-side) to `budget.json`; both the API route and the hub/
 * widget use these helpers so the numbers can't drift.
 */

export type PlanFrequency = "monthly" | "selected";

export interface BudgetPlan {
  id: string;
  category: string;
  amount: number;
  frequency: PlanFrequency;
  year?: number;       // "selected" only
  monthIndex?: number; // "selected" only (0–11)
}

/** A savings goal — pure planning (no spend logging). `saved` is what you've put
 *  aside so far; `monthly` is what you plan to add each month, which drives the
 *  "reach it by" projection. */
export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
  monthly: number;
  color?: string;
}

export interface BudgetConfig {
  defaultBudget: number;                  // monthly budget applied to every month
  overrides: Record<string, number>;      // "YYYY-M" (monthIndex 0–11) → budget for that month
  categories: string[];
  colors: Record<string, string>;         // category → hex
  plans: BudgetPlan[];
  /** Categories that vary month-to-month (fuel, power, …) — you set the amount
   *  for each month, stored as a per-month `selected` plan. The UI prompts for
   *  the current month's value; empty means not-yet-set for that month. */
  variableCategories: string[];
  /** Savings goals (target + monthly contribution + progress). */
  savingsGoals: SavingsGoal[];
  /** Carry each month's leftover (income − allocated) into the next month's
   *  available budget. Off by default. */
  rollover: boolean;
}

/** Projection for a savings goal: months + target date to reach it at the
 *  current monthly contribution. `null` reachedBy when there's no monthly plan
 *  (or already reached). */
export interface GoalProjection {
  remaining: number;
  pct: number;                 // 0..100 saved / target
  monthsLeft: number | null;   // null = no monthly contribution set (never, at this rate)
  reachedBy: Date | null;
  done: boolean;
}
export function goalProjection(g: SavingsGoal, from: Date = new Date()): GoalProjection {
  const target = Math.max(0, g.target);
  const saved = Math.max(0, g.saved);
  const remaining = Math.max(0, target - saved);
  const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
  const done = remaining <= 0 && target > 0;
  if (done) return { remaining: 0, pct: 100, monthsLeft: 0, reachedBy: from, done: true };
  if (g.monthly <= 0) return { remaining, pct, monthsLeft: null, reachedBy: null, done: false };
  const monthsLeft = Math.ceil(remaining / g.monthly);
  const reachedBy = new Date(from.getFullYear(), from.getMonth() + monthsLeft, 1);
  return { remaining, pct, monthsLeft, reachedBy, done: false };
}
/** Total planned monthly savings contributions across all goals. */
export function monthlyGoalContributions(cfg: BudgetConfig): number {
  return (cfg.savingsGoals ?? []).reduce((s, g) => s + Math.max(0, g.monthly), 0);
}

// The 6 standard Danish categories + their colours, from the original app.
export const STANDARD_CATEGORIES = ["Bolig", "Mad", "Transport", "Øvrige Faste", "Diverse", "Opsparing"] as const;
export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  "Bolig": "#4E79A7",
  "Mad": "#F28E2B",
  "Transport": "#E15759",
  "Øvrige Faste": "#76B7B2",
  "Diverse": "#59A14F",
  "Opsparing": "#EDC948",
};
// Palette offered for custom categories / recolouring.
export const COLOR_PALETTE = [
  "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
  "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC",
  "#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD",
  "#8C564B", "#E377C2", "#7F7F7F", "#BCBD22", "#17BECF",
];

export const MONTHS_DA = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
export const MONTHS_SHORT_DA = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function defaultBudgetConfig(): BudgetConfig {
  const colors: Record<string, string> = {};
  for (const c of STANDARD_CATEGORIES) colors[c] = DEFAULT_CATEGORY_COLORS[c];
  return { defaultBudget: 0, overrides: {}, categories: [...STANDARD_CATEGORIES], colors, plans: [], variableCategories: [], savingsGoals: [], rollover: false };
}

const periodKey = (year: number, monthIndex: number) => `${year}-${monthIndex}`;

/** Budget (cap) for a given month — the per-month override, else the default. */
export function budgetForPeriod(cfg: BudgetConfig, year: number, monthIndex: number): number {
  const o = cfg.overrides[periodKey(year, monthIndex)];
  return o !== undefined ? o : cfg.defaultBudget;
}

/** Does a plan apply to (year, monthIndex)? Monthly plans always do. */
function planApplies(plan: BudgetPlan, year: number, monthIndex: number): boolean {
  if (plan.frequency === "monthly") return true;
  return plan.year === year && plan.monthIndex === monthIndex;
}

/** Per-category allocated totals for a month, sorted desc, zero-rows dropped. */
export function categoryTotalsForPeriod(cfg: BudgetConfig, year: number, monthIndex: number): { category: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const p of cfg.plans) {
    if (!planApplies(p, year, monthIndex)) continue;
    map.set(p.category, (map.get(p.category) ?? 0) + p.amount);
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function totalPlannedForPeriod(cfg: BudgetConfig, year: number, monthIndex: number): number {
  return categoryTotalsForPeriod(cfg, year, monthIndex).reduce((s, x) => s + x.amount, 0);
}

/** Signed leftover (budget − planned) carried into (year, monthIndex) from the
 *  earlier months of the same year, when rollover is on. A positive carry adds
 *  to what's available this month; an over-plan month carries a negative. Off
 *  (or January) → 0. */
export function carriedInto(cfg: BudgetConfig, year: number, monthIndex: number): number {
  if (!cfg.rollover) return 0;
  let carry = 0;
  for (let m = 0; m < monthIndex; m++) {
    carry += budgetForPeriod(cfg, year, m) - totalPlannedForPeriod(cfg, year, m);
  }
  return carry;
}

/** Per-category totals across all 12 months of a year, sorted desc. */
export function yearlyCategoryTotals(cfg: BudgetConfig, year: number): { category: string; amount: number }[] {
  const map = new Map<string, number>();
  for (let m = 0; m < 12; m++) {
    for (const { category, amount } of categoryTotalsForPeriod(cfg, year, m)) {
      map.set(category, (map.get(category) ?? 0) + amount);
    }
  }
  return [...map.entries()].map(([category, amount]) => ({ category, amount })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
}

export interface YearStats {
  budgetTotal: number;                       // Σ each month's budget cap
  allocatedTotal: number;                    // Σ each month's planned
  avgAllocatedPerMonth: number;
  biggest: { category: string; amount: number } | null;   // top category across the year
  mostOver: { monthIndex: number; over: number } | null;  // month with the largest allocated − budget
}

/** Roll-up stats for a whole year, for the Budget Year tab's info strip. */
export function yearStats(cfg: BudgetConfig, year: number): YearStats {
  let budgetTotal = 0;
  let allocatedTotal = 0;
  let mostOver: { monthIndex: number; over: number } | null = null;
  for (let m = 0; m < 12; m++) {
    const budget = budgetForPeriod(cfg, year, m);
    const planned = totalPlannedForPeriod(cfg, year, m);
    budgetTotal += budget;
    allocatedTotal += planned;
    const over = planned - budget;
    if (over > 0 && (!mostOver || over > mostOver.over)) mostOver = { monthIndex: m, over };
  }
  const cats = yearlyCategoryTotals(cfg, year);
  return {
    budgetTotal,
    allocatedTotal,
    avgAllocatedPerMonth: allocatedTotal / 12,
    biggest: cats[0] ?? null,
    mostOver,
  };
}

export function colorFor(cfg: BudgetConfig, category: string, fallbackIndex = 0): string {
  return cfg.colors[category] || DEFAULT_CATEGORY_COLORS[category] || COLOR_PALETTE[fallbackIndex % COLOR_PALETTE.length];
}

/** Plans that apply to a specific period (for the Plan-tab list), amount desc. */
export function plansForPeriod(cfg: BudgetConfig, year: number, monthIndex: number): BudgetPlan[] {
  return cfg.plans
    .filter((p) => p.frequency === "monthly" || (p.year === year && p.monthIndex === monthIndex))
    .sort((a, b) => b.amount - a.amount);
}

/** SVG pie slices for a month. Sized against the budget (or the total when the
 *  plan exceeds the budget), matching the original app's geometry. */
export interface PieSlice { category: string; amount: number; percentage: number; path: string; color: string }
export function buildPieSlices(cfg: BudgetConfig, year: number, monthIndex: number, opts?: { cx?: number; cy?: number; r?: number }): PieSlice[] {
  const budget = budgetForPeriod(cfg, year, monthIndex);
  if (budget <= 0) return [];
  const groups = categoryTotalsForPeriod(cfg, year, monthIndex);
  const totalPlanned = groups.reduce((s, x) => s + x.amount, 0);
  if (totalPlanned <= 0) return [];
  const geometryTotal = totalPlanned > budget ? totalPlanned : budget;

  const cx = opts?.cx ?? 140, cy = opts?.cy ?? 140, r = opts?.r ?? 120;
  let startAngle = -90;
  const slices: PieSlice[] = [];
  groups.forEach((g, i) => {
    const sweep = 360 * (g.amount / geometryTotal);
    slices.push({
      category: g.category,
      amount: g.amount,
      percentage: (g.amount / budget) * 100,
      color: colorFor(cfg, g.category, i),
      path: slicePath(cx, cy, r, startAngle, sweep),
    });
    startAngle += sweep;
  });
  return slices;
}

function slicePath(cx: number, cy: number, r: number, startAngle: number, sweep: number): string {
  if (sweep >= 359.99) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const s = (startAngle * Math.PI) / 180;
  const e = ((startAngle + sweep) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
  const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}
