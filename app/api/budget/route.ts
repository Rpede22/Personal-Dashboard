import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { configPath } from "@/lib/config-dir";
import {
  defaultBudgetConfig, STANDARD_CATEGORIES, DEFAULT_CATEGORY_COLORS, COLOR_PALETTE,
  type BudgetConfig, type BudgetPlan, type PlanFrequency,
} from "@/lib/budget";
import { monthlyTotal, type Subscription } from "@/lib/subscriptions";

/** Reserved category name for the auto-synced subscriptions total. */
const SUBSCRIPTIONS_CATEGORY = "Abonnementer";

function readSubscriptionsMonthlyTotal(): number {
  try {
    const raw = JSON.parse(readFileSync(configPath("subscriptions.json"), "utf-8"));
    const list: Subscription[] = Array.isArray(raw) ? raw : [];
    return Math.round(monthlyTotal(list));
  } catch {
    return 0;
  }
}

/**
 * Budget planner — file-based config (no DB). One document, mutated by action:
 *   GET  /api/budget                        → the whole BudgetConfig
 *   POST /api/budget { action, ...args }:
 *     setDefaultBudget { amount }
 *     setOverride      { year, monthIndex, amount|null }   (null clears)
 *     addPlan          { category, amount, frequency, year?, monthIndex? }   (merges same cat+freq+period)
 *     removePlan       { id }
 *     toggleVariable   { category }        (mark/unmark a monthly-varying expense)
 *     setMonthlyAmount { category, year, monthIndex, amount|null }  (SET this month's value)
 *     addCategory      { name }
 *     removeCategory   { name }            (custom only, and only if no plans use it)
 *     setColor         { category, hex }
 *     reset            {}
 * Always returns the updated config. Persists to `budget.json`.
 */

const PATH = configPath("budget.json");
const HEX = /^#([0-9A-Fa-f]{6})$/;

function read(): BudgetConfig {
  try {
    const raw = JSON.parse(readFileSync(PATH, "utf-8"));
    // Merge over defaults so a partial/old file still yields a valid config.
    const def = defaultBudgetConfig();
    return {
      defaultBudget: Number.isFinite(raw.defaultBudget) ? raw.defaultBudget : def.defaultBudget,
      overrides: raw.overrides && typeof raw.overrides === "object" ? raw.overrides : {},
      categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : def.categories,
      colors: raw.colors && typeof raw.colors === "object" ? raw.colors : def.colors,
      plans: Array.isArray(raw.plans) ? raw.plans : [],
      variableCategories: Array.isArray(raw.variableCategories) ? raw.variableCategories.filter((c: unknown) => typeof c === "string") : [],
      savingsGoals: Array.isArray(raw.savingsGoals) ? raw.savingsGoals.filter((g: unknown) => g && typeof g === "object") : [],
      rollover: raw.rollover === true,
    };
  } catch {
    return defaultBudgetConfig();
  }
}
function write(cfg: BudgetConfig): void {
  writeFileSync(PATH, JSON.stringify(cfg, null, 2));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const isFreq = (v: unknown): v is PlanFrequency => v === "monthly" || v === "selected";

export async function GET() {
  return NextResponse.json(read());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const cfg = read();

  switch (action) {
    case "setDefaultBudget": {
      const amount = num(body.amount);
      if (isNaN(amount) || amount < 0) return bad("amount must be ≥ 0");
      cfg.defaultBudget = amount;
      break;
    }
    case "setOverride": {
      const year = num(body.year), monthIndex = num(body.monthIndex);
      if (isNaN(year) || isNaN(monthIndex)) return bad("year and monthIndex required");
      const key = `${year}-${monthIndex}`;
      if (body.amount === null || body.amount === undefined || body.amount === "") {
        delete cfg.overrides[key];
      } else {
        const amount = num(body.amount);
        if (isNaN(amount) || amount < 0) return bad("amount must be ≥ 0");
        cfg.overrides[key] = amount;
      }
      break;
    }
    case "addPlan": {
      const category = String(body.category ?? "").trim();
      const amount = num(body.amount);
      const frequency = body.frequency;
      if (!category) return bad("category required");
      if (isNaN(amount) || amount <= 0) return bad("amount must be > 0");
      if (!isFreq(frequency)) return bad("frequency must be monthly|selected");
      let year: number | undefined, monthIndex: number | undefined;
      if (frequency === "selected") {
        year = num(body.year); monthIndex = num(body.monthIndex);
        if (isNaN(year) || isNaN(monthIndex)) return bad("selected plans need year + monthIndex");
      }
      // Merge into an existing same category+frequency+period plan (C# AddOrMergePlan).
      const existing = cfg.plans.find((p) =>
        p.category.toLowerCase() === category.toLowerCase() &&
        p.frequency === frequency &&
        (frequency === "monthly" || (p.year === year && p.monthIndex === monthIndex)),
      );
      if (existing) existing.amount += amount;
      else cfg.plans.push({ id: randomUUID().slice(0, 8), category, amount, frequency, year, monthIndex });
      // Ensure the category exists + has a colour.
      if (!cfg.categories.some((c) => c.toLowerCase() === category.toLowerCase())) cfg.categories.push(category);
      if (!cfg.colors[category]) cfg.colors[category] = DEFAULT_CATEGORY_COLORS[category] ?? COLOR_PALETTE[cfg.categories.length % COLOR_PALETTE.length];
      break;
    }
    case "removePlan": {
      cfg.plans = cfg.plans.filter((p) => p.id !== String(body.id ?? ""));
      break;
    }
    case "toggleVariable": {
      // Mark/unmark a category as a monthly-varying expense (fuel, power, …).
      const category = String(body.category ?? "").trim().slice(0, 40);
      if (!category) return bad("category required");
      const has = cfg.variableCategories.some((c) => c.toLowerCase() === category.toLowerCase());
      if (has) {
        cfg.variableCategories = cfg.variableCategories.filter((c) => c.toLowerCase() !== category.toLowerCase());
      } else {
        cfg.variableCategories.push(category);
        if (!cfg.categories.some((c) => c.toLowerCase() === category.toLowerCase())) cfg.categories.push(category);
        if (!cfg.colors[category]) cfg.colors[category] = DEFAULT_CATEGORY_COLORS[category] ?? COLOR_PALETTE[cfg.categories.length % COLOR_PALETTE.length];
      }
      break;
    }
    case "setMonthlyAmount": {
      // SET (replace, not stack) this month's amount for a variable category —
      // stored as a `selected` plan for the period. `amount` null/0 clears it.
      const category = String(body.category ?? "").trim();
      const year = num(body.year), monthIndex = num(body.monthIndex);
      if (!category) return bad("category required");
      if (isNaN(year) || isNaN(monthIndex)) return bad("year + monthIndex required");
      cfg.plans = cfg.plans.filter((p) => !(
        p.frequency === "selected" && p.year === year && p.monthIndex === monthIndex &&
        p.category.toLowerCase() === category.toLowerCase()
      ));
      const amount = num(body.amount);
      if (!isNaN(amount) && amount > 0) {
        cfg.plans.push({ id: randomUUID().slice(0, 8), category, amount, frequency: "selected", year, monthIndex });
      }
      break;
    }
    case "addCategory": {
      const name = String(body.name ?? "").trim().slice(0, 40);
      if (!name) return bad("name required");
      if (cfg.categories.some((c) => c.toLowerCase() === name.toLowerCase())) return bad("category already exists");
      cfg.categories.push(name);
      cfg.colors[name] = COLOR_PALETTE[cfg.categories.length % COLOR_PALETTE.length];
      break;
    }
    case "removeCategory": {
      const name = String(body.name ?? "").trim();
      if ((STANDARD_CATEGORIES as readonly string[]).some((c) => c.toLowerCase() === name.toLowerCase())) return bad("standard categories can't be removed");
      if (cfg.plans.some((p) => p.category.toLowerCase() === name.toLowerCase())) return bad("remove this category's plans first");
      cfg.categories = cfg.categories.filter((c) => c.toLowerCase() !== name.toLowerCase());
      cfg.variableCategories = cfg.variableCategories.filter((c) => c.toLowerCase() !== name.toLowerCase());
      delete cfg.colors[name];
      break;
    }
    case "setColor": {
      const category = String(body.category ?? "").trim();
      const hex = String(body.hex ?? "").trim();
      if (!HEX.test(hex)) return bad("hex must be #RRGGBB");
      if (!cfg.categories.some((c) => c.toLowerCase() === category.toLowerCase())) return bad("unknown category");
      cfg.colors[category] = hex.toUpperCase();
      break;
    }
    case "syncSubscriptions": {
      // Idempotently keep a monthly "Abonnementer" plan equal to the current
      // subscriptions total — set (not stack), so re-syncing just updates it.
      const total = readSubscriptionsMonthlyTotal();
      const existing = cfg.plans.find((p) => p.frequency === "monthly" && p.category === SUBSCRIPTIONS_CATEGORY);
      if (total <= 0) {
        // Nothing to sync — drop any prior auto line.
        cfg.plans = cfg.plans.filter((p) => !(p.frequency === "monthly" && p.category === SUBSCRIPTIONS_CATEGORY));
      } else if (existing) {
        existing.amount = total;
      } else {
        cfg.plans.push({ id: randomUUID().slice(0, 8), category: SUBSCRIPTIONS_CATEGORY, amount: total, frequency: "monthly" });
      }
      if (total > 0) {
        if (!cfg.categories.includes(SUBSCRIPTIONS_CATEGORY)) cfg.categories.push(SUBSCRIPTIONS_CATEGORY);
        if (!cfg.colors[SUBSCRIPTIONS_CATEGORY]) cfg.colors[SUBSCRIPTIONS_CATEGORY] = "#17BECF";
      }
      break;
    }
    case "setRollover": {
      cfg.rollover = body.value === true;
      break;
    }
    case "addGoal": {
      const name = String(body.name ?? "").trim().slice(0, 60);
      const target = num(body.target);
      const monthly = num(body.monthly);
      if (!name) return bad("name required");
      if (isNaN(target) || target <= 0) return bad("target must be > 0");
      const saved = !isNaN(num(body.saved)) && num(body.saved) >= 0 ? num(body.saved) : 0;
      const color = HEX.test(String(body.color ?? "")) ? String(body.color).toUpperCase() : COLOR_PALETTE[cfg.savingsGoals.length % COLOR_PALETTE.length];
      cfg.savingsGoals.push({ id: randomUUID().slice(0, 8), name, target, saved, monthly: !isNaN(monthly) && monthly > 0 ? monthly : 0, color });
      break;
    }
    case "updateGoal": {
      const id = String(body.id ?? "");
      const g = cfg.savingsGoals.find((x) => x.id === id);
      if (!g) return bad("unknown goal");
      if ("name" in body) { const n = String(body.name ?? "").trim().slice(0, 60); if (n) g.name = n; }
      if ("target" in body) { const t = num(body.target); if (!isNaN(t) && t > 0) g.target = t; }
      if ("monthly" in body) { const m = num(body.monthly); g.monthly = !isNaN(m) && m > 0 ? m : 0; }
      if ("saved" in body) { const s = num(body.saved); if (!isNaN(s) && s >= 0) g.saved = s; }
      if ("color" in body && HEX.test(String(body.color ?? ""))) g.color = String(body.color).toUpperCase();
      break;
    }
    case "contributeGoal": {
      // Add (or subtract) to a goal's saved total — e.g. logging this month's
      // contribution, or a lump sum. Clamped at 0.
      const id = String(body.id ?? "");
      const g = cfg.savingsGoals.find((x) => x.id === id);
      if (!g) return bad("unknown goal");
      const delta = num(body.amount);
      if (isNaN(delta)) return bad("amount required");
      g.saved = Math.max(0, g.saved + delta);
      break;
    }
    case "removeGoal": {
      cfg.savingsGoals = cfg.savingsGoals.filter((g) => g.id !== String(body.id ?? ""));
      break;
    }
    case "reset": {
      write(defaultBudgetConfig());
      return NextResponse.json(defaultBudgetConfig());
    }
    default:
      return bad("unknown action");
  }

  write(cfg);
  return NextResponse.json(cfg);
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
