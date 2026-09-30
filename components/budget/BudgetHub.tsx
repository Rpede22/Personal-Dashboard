"use client";

import { useEffect, useMemo, useState } from "react";
import HubShell from "@/components/HubShell";
import { formatDkk } from "@/lib/payday";
import { useCurrency } from "@/lib/dashboard-settings";
import {
  budgetForPeriod, categoryTotalsForPeriod, totalPlannedForPeriod, plansForPeriod,
  buildPieSlices, colorFor, MONTHS_DA, MONTHS_SHORT_DA, COLOR_PALETTE, STANDARD_CATEGORIES,
  yearlyCategoryTotals, yearStats, goalProjection, monthlyGoalContributions, carriedInto,
  type BudgetConfig, type PlanFrequency, type SavingsGoal,
} from "@/lib/budget";

const ACCENT = "var(--accent-green)";
type Tab = "overview" | "plan" | "goals" | "year" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan" },
  { id: "goals", label: "Goals" },
  { id: "year", label: "Year" },
  { id: "settings", label: "Settings" },
];

const monthLabel = (y: number, m: number) => `${MONTHS_DA[m]} ${y}`.replace(/^./, (c) => c.toUpperCase());
const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

export default function BudgetHub() {
  useCurrency(); // re-render money on currency change
  const [cfg, setCfg] = useState<BudgetConfig | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [status, setStatus] = useState("");

  async function load() {
    try { setCfg(await (await fetch("/api/budget")).json()); } catch {}
  }
  useEffect(() => { load(); }, []);

  async function mutate(body: Record<string, unknown>) {
    setStatus("");
    const res = await fetch("/api/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (res.ok) { setCfg(d); return true; }
    setStatus(d.error || "Failed"); return false;
  }

  function stepMonth(delta: number) {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  }

  if (!cfg) return <HubShell title="Budget" emoji="📊" color={ACCENT}><div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div></HubShell>;

  const budget = budgetForPeriod(cfg, year, month);
  const totals = categoryTotalsForPeriod(cfg, year, month);
  const allocated = totalPlannedForPeriod(cfg, year, month);
  const remaining = budget - allocated;
  const exceeded = allocated > budget && budget > 0;

  return (
    <HubShell
      title="Budget"
      emoji="📊"
      color={ACCENT}
      tabs={
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className="text-xs px-3 py-1.5 rounded-lg"
              style={{ background: tab === t.id ? `${ACCENT}22` : "var(--surface)", color: tab === t.id ? ACCENT : "var(--text-muted)", border: `1px solid ${tab === t.id ? ACCENT : "var(--border)"}` }}>
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {status && <p className="text-xs mb-3" style={{ color: "var(--accent-red)" }}>{status}</p>}

      {/* Month navigator (Overview + Plan) */}
      {(tab === "overview" || tab === "plan") && (
        <div className="flex items-center justify-center gap-4 mb-5">
          <button onClick={() => stepMonth(-1)} className="text-sm px-3 py-1 rounded-lg" style={inputStyle}>←</button>
          <span className="text-lg font-semibold" style={{ color: "var(--text)" }}>{monthLabel(year, month)}</span>
          <button onClick={() => stepMonth(1)} className="text-sm px-3 py-1 rounded-lg" style={inputStyle}>→</button>
        </div>
      )}

      {tab === "overview" && <Overview cfg={cfg} year={year} month={month} budget={budget} allocated={allocated} remaining={remaining} exceeded={exceeded} totals={totals} />}
      {tab === "plan" && <PlanTab cfg={cfg} year={year} month={month} budget={budget} allocated={allocated} remaining={remaining} mutate={mutate} />}
      {tab === "goals" && <GoalsTab cfg={cfg} mutate={mutate} />}
      {tab === "year" && <YearTab cfg={cfg} year={year} setYear={setYear} onOpenMonth={(m) => { setMonth(m); setTab("overview"); }} />}
      {tab === "settings" && <SettingsTab cfg={cfg} mutate={mutate} />}
    </HubShell>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────
function Overview({ cfg, year, month, budget, allocated, remaining, exceeded, totals }: {
  cfg: BudgetConfig; year: number; month: number; budget: number; allocated: number; remaining: number; exceeded: boolean;
  totals: { category: string; amount: number }[];
}) {
  const slices = useMemo(() => buildPieSlices(cfg, year, month), [cfg, year, month]);
  const goalContrib = monthlyGoalContributions(cfg);
  // Income → Expenses → Left over. "Left over" is what's not allocated to
  // planned expenses; of that, `goalContrib` is earmarked for savings goals.
  // With rollover on, earlier months' leftover adds to what's available.
  const carried = carriedInto(cfg, year, month);
  const income = budget + carried;
  const leftover = income - allocated;
  const freeAfterGoals = leftover - goalContrib;
  const expensesPct = income > 0 ? Math.min(100, (allocated / income) * 100) : 0;
  const goalsPct = income > 0 ? Math.min(100 - expensesPct, (goalContrib / income) * 100) : 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Income" value={formatDkk(income)} />
        <Stat label="Planned expenses" value={formatDkk(allocated)} accent={exceeded ? "var(--accent-red)" : ACCENT} />
        <Stat label="Left to save" value={formatDkk(leftover)} accent={leftover < 0 ? "var(--accent-red)" : "var(--accent-green)"} />
      </div>

      {/* Income allocation bar — expenses · goals · free */}
      {income > 0 && (
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Where your income goes</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {carried !== 0 && <span title="Carried over from earlier months (rollover)">{formatDkk(budget)} + {carried > 0 ? "" : "−"}{formatDkk(Math.abs(carried))} carried = </span>}
              {formatDkk(income)} available
            </span>
          </div>
          <div className="flex h-4 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }} title={`Expenses ${formatDkk(allocated)} · Goals ${formatDkk(goalContrib)} · Free ${formatDkk(freeAfterGoals)}`}>
            <div style={{ width: `${expensesPct}%`, background: exceeded ? "var(--accent-red)" : ACCENT }} />
            {goalContrib > 0 && <div style={{ width: `${goalsPct}%`, background: "var(--accent-cyan)" }} />}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: exceeded ? "var(--accent-red)" : ACCENT }} /> Expenses {formatDkk(allocated)} ({Math.round(expensesPct)}%)</span>
            {goalContrib > 0 && <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--accent-cyan)" }} /> To goals {formatDkk(goalContrib)}</span>}
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }} /> Free {formatDkk(freeAfterGoals)}</span>
          </div>
        </div>
      )}

      {exceeded && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--accent-red)15", border: "1px solid var(--accent-red)55", color: "var(--accent-red)" }}>
          ⚠ Your planned expenses exceed your income by {formatDkk(allocated - budget)} for {MONTHS_DA[month]}.
        </div>
      )}

      {slices.length === 0 ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          {budget <= 0 ? "Set a monthly budget on the Plan tab to see the distribution." : "Add budget items on the Plan tab to see the distribution."}
        </div>
      ) : (
        <div className="rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <svg viewBox="0 0 280 280" width="220" height="220" className="shrink-0">
            {slices.map((s) => <path key={s.category} d={s.path} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
          </svg>
          <ul className="flex-1 w-full space-y-1.5">
            {totals.map((t, i) => (
              <li key={t.category} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorFor(cfg, t.category, i) }} />
                <span className="flex-1" style={{ color: "var(--text)" }}>{t.category}</span>
                <span style={{ color: "var(--text-muted)" }}>{formatDkk(t.amount)}</span>
                <span className="w-12 text-right text-xs" style={{ color: "var(--text-muted)" }}>{budget > 0 ? `${Math.round((t.amount / budget) * 100)}%` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent = "var(--text)" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: `1px solid ${accent === ACCENT ? `${ACCENT}44` : "var(--border)"}` }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-xl font-bold" style={{ color: accent }}>{value}</div>
    </div>
  );
}

// ── Plan tab ────────────────────────────────────────────────────────────────
function PlanTab({ cfg, year, month, budget, allocated, remaining, mutate }: {
  cfg: BudgetConfig; year: number; month: number; budget: number; allocated: number; remaining: number;
  mutate: (b: Record<string, unknown>) => Promise<boolean>;
}) {
  const currency = useCurrency();
  const [defaultInput, setDefaultInput] = useState("");
  const [overrideInput, setOverrideInput] = useState("");
  const [category, setCategory] = useState(cfg.categories[0] ?? "");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<PlanFrequency>("monthly");
  // Finance integrations: pull income from Work + the subscriptions total.
  const [workIncome, setWorkIncome] = useState<number | null>(null);
  const [subsTotal, setSubsTotal] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/work").then((r) => r.json()).then((d) => setWorkIncome(typeof d.monthlyNetIncome === "number" ? d.monthlyNetIncome : null)).catch(() => {});
    fetch("/api/subscriptions").then((r) => r.json()).then((d) => setSubsTotal(typeof d.monthlyTotal === "number" ? d.monthlyTotal : null)).catch(() => {});
  }, [cfg]);
  const subsSynced = cfg.plans.some((p) => p.frequency === "monthly" && p.category === "Abonnementer");
  useEffect(() => { setDefaultInput(cfg.defaultBudget ? String(cfg.defaultBudget) : ""); }, [cfg.defaultBudget]);
  useEffect(() => {
    const o = cfg.overrides[`${year}-${month}`];
    setOverrideInput(o !== undefined ? String(o) : "");
  }, [cfg.overrides, year, month]);

  const plans = plansForPeriod(cfg, year, month);

  return (
    <div className="space-y-5">
      {/* Budget setters */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Default monthly budget</div>
          <div className="flex gap-2">
            <input type="number" min="0" value={defaultInput} onChange={(e) => setDefaultInput(e.target.value)} placeholder={currency} className="flex-1 rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
            <button onClick={() => mutate({ action: "setDefaultBudget", amount: Number(defaultInput) || 0 })} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>Save</button>
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Applied to every month without an override.</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Budget for {MONTHS_DA[month]} {year}</div>
          <div className="flex gap-2">
            <input type="number" min="0" value={overrideInput} onChange={(e) => setOverrideInput(e.target.value)} placeholder={`Default (${formatDkk(cfg.defaultBudget)})`} className="flex-1 rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
            <button onClick={() => mutate({ action: "setOverride", year, monthIndex: month, amount: overrideInput === "" ? null : Number(overrideInput) })} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>Save</button>
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Blank = use the default. Now: <strong>{formatDkk(budget)}</strong></p>
        </div>
      </div>

      {/* Finance integrations */}
      {((workIncome ?? 0) > 0 || (subsTotal ?? 0) > 0) && (
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: `1px solid ${ACCENT}44` }}>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>From your other hubs</div>
          <div className="flex flex-col gap-2">
            {(workIncome ?? 0) > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm" style={{ color: "var(--text)" }}>💼 Work income this month ≈ <strong>{formatDkk(workIncome!)}</strong> <span style={{ color: "var(--text-muted)" }}>(net)</span></span>
                <button onClick={() => mutate({ action: "setOverride", year, monthIndex: month, amount: Math.round(workIncome!) })} className="text-xs px-3 py-1 rounded-lg" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>Use as this month&apos;s budget</button>
              </div>
            )}
            {(subsTotal ?? 0) > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm" style={{ color: "var(--text)" }}>💳 Subscriptions ≈ <strong>{formatDkk(subsTotal!)}</strong>/mo</span>
                <button onClick={() => mutate({ action: "syncSubscriptions" })} className="text-xs px-3 py-1 rounded-lg" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>
                  {subsSynced ? "Re-sync into budget" : "Add as a budget line"}
                </button>
                {subsSynced && <span className="text-xs" style={{ color: "var(--accent-green)" }}>✓ synced as “Abonnementer”</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary row */}
      <div className="flex flex-wrap gap-4 text-sm px-1">
        <span style={{ color: "var(--text-muted)" }}>Allocated <strong style={{ color: "var(--text)" }}>{formatDkk(allocated)}</strong></span>
        <span style={{ color: "var(--text-muted)" }}>Remaining <strong style={{ color: remaining < 0 ? "var(--accent-red)" : ACCENT }}>{formatDkk(remaining)}</strong></span>
      </div>

      {/* Add plan */}
      <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Add budget item</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle}>
            {cfg.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Amount (${currency})`} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as PlanFrequency)} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle}>
            <option value="monthly">Every month</option>
            <option value="selected">This month only</option>
          </select>
          <button
            onClick={async () => {
              const amt = Number(amount);
              if (!(amt > 0)) return;
              const ok = await mutate({ action: "addPlan", category, amount: amt, frequency, ...(frequency === "selected" ? { year, monthIndex: month } : {}) });
              if (ok) setAmount("");
            }}
            className="text-sm px-4 py-2 rounded-lg font-medium" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}
          >+ Add</button>
        </div>
      </div>

      {/* Variable / month-by-month expenses (fuel, power, …) */}
      <VariableExpenses cfg={cfg} year={year} month={month} mutate={mutate} />

      {/* Plans for this period */}
      {plans.length === 0 ? (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          No budget items for {MONTHS_DA[month]} yet.
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <ul>
            {plans.map((p, i) => (
              <li key={p.id} className="px-4 py-2.5 flex items-center gap-3 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorFor(cfg, p.category, i) }} />
                <span className="flex-1 text-sm" style={{ color: "var(--text)" }}>{p.category}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{p.frequency === "monthly" ? "Monthly" : `${MONTHS_SHORT_DA[p.monthIndex ?? month]} only`}</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{formatDkk(p.amount)}</span>
                <button onClick={() => mutate({ action: "removePlan", id: p.id })} className="text-xs px-2 py-1" style={{ color: "var(--accent-red)" }} title="Remove">✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Variable expenses (set each month) ───────────────────────────────────────
function VariableExpenses({ cfg, year, month, mutate }: {
  cfg: BudgetConfig; year: number; month: number; mutate: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const currency = useCurrency();
  const [newCat, setNewCat] = useState("");
  const variable = cfg.variableCategories ?? [];
  // Categories you could add as variable = existing ones not already variable.
  const addable = cfg.categories.filter((c) => !variable.some((v) => v.toLowerCase() === c.toLowerCase()));

  function amountFor(cat: string): number | null {
    const p = cfg.plans.find((x) => x.frequency === "selected" && x.year === year && x.monthIndex === month && x.category.toLowerCase() === cat.toLowerCase());
    return p ? p.amount : null;
  }

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>Variable expenses <span className="font-normal text-xs" style={{ color: "var(--text-muted)" }}>· set for {MONTHS_DA[month]} {year}</span></div>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        For costs that change every month — fuel, power, groceries. Enter this month&apos;s amount; it counts toward the month&apos;s
        allocation and resets each month so you&apos;re prompted to set it again.
      </p>

      {variable.length > 0 && (
        <div className="space-y-2 mb-3">
          {variable.map((cat) => (
            <VariableRow key={cat} cat={cat} value={amountFor(cat)} currency={currency}
              onSave={(amt) => mutate({ action: "setMonthlyAmount", category: cat, year, monthIndex: month, amount: amt })}
              onUntrack={() => mutate({ action: "toggleVariable", category: cat })}
            />
          ))}
        </div>
      )}

      {/* Add a variable category — pick an existing one or type a new name */}
      <div className="flex flex-wrap items-center gap-2">
        {addable.length > 0 && (
          <select value="" onChange={(e) => { if (e.target.value) mutate({ action: "toggleVariable", category: e.target.value }); }}
            className="rounded-lg px-2 py-1.5 text-sm" style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}>
            <option value="">+ Track an existing category…</option>
            {addable.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="…or a new one (e.g. Fuel)"
          onKeyDown={(e) => { if (e.key === "Enter" && newCat.trim()) { mutate({ action: "toggleVariable", category: newCat.trim() }); setNewCat(""); } }}
          className="rounded-lg px-2 py-1.5 text-sm" style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }} />
        <button onClick={() => { if (newCat.trim()) { mutate({ action: "toggleVariable", category: newCat.trim() }); setNewCat(""); } }}
          className="text-sm px-3 py-1.5 rounded-lg" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>+ Add</button>
      </div>
    </div>
  );
}

function VariableRow({ cat, value, currency, onSave, onUntrack }: {
  cat: string; value: number | null; currency: string; onSave: (amt: number | null) => void; onUntrack: () => void;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  useEffect(() => { setDraft(value != null ? String(value) : ""); }, [value]);
  const unset = value == null;
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm flex items-center gap-2" style={{ color: "var(--text)" }}>
        {cat}
        {unset && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--accent-orange)22", color: "var(--accent-orange)" }}>not set</span>}
      </span>
      <input type="number" min="0" value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { const n = draft.trim() === "" ? null : Number(draft); if (n === null || (Number.isFinite(n) && n >= 0)) onSave(n); }}
        placeholder={`Amount (${currency})`} className="w-32 rounded-lg px-2 py-1.5 text-sm text-right"
        style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }} />
      <button onClick={onUntrack} className="text-xs px-2 py-1" style={{ color: "var(--accent-red)" }} title="Stop tracking as variable">✕</button>
    </div>
  );
}

// ── Goals tab ─────────────────────────────────────────────────────────────────
function GoalsTab({ cfg, mutate }: { cfg: BudgetConfig; mutate: (b: Record<string, unknown>) => Promise<boolean> }) {
  const currency = useCurrency();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [monthly, setMonthly] = useState("");
  const goals = cfg.savingsGoals ?? [];
  const totalMonthly = monthlyGoalContributions(cfg);

  async function add() {
    const t = Number(target), m = Number(monthly);
    if (!name.trim() || !(t > 0)) return;
    const ok = await mutate({ action: "addGoal", name: name.trim(), target: t, monthly: m > 0 ? m : 0 });
    if (ok) { setName(""); setTarget(""); setMonthly(""); }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Plan what you&apos;re saving toward. Set a target and a monthly amount, and each goal shows its progress and when you&apos;ll reach it — no spend logging, just the plan.
      </p>

      {/* Add goal */}
      <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>New savings goal</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Emergency fund)" className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
          <input type="number" min="0" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`Target (${currency})`} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
          <input type="number" min="0" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder={`Monthly (${currency})`} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
          <button onClick={add} className="text-sm px-4 py-2 rounded-lg font-medium" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>+ Add goal</button>
        </div>
      </div>

      {goals.length > 0 && totalMonthly > 0 && (
        <div className="text-sm px-1" style={{ color: "var(--text-muted)" }}>
          Planned monthly savings across all goals: <strong style={{ color: "var(--accent-cyan)" }}>{formatDkk(totalMonthly)}</strong>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
          No goals yet — add one above. Common ones: an emergency fund, a trip, a new PC.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => <GoalCard key={g.id} g={g} currency={currency} mutate={mutate} />)}
        </div>
      )}
    </div>
  );
}

function GoalCard({ g, currency, mutate }: { g: SavingsGoal; currency: string; mutate: (b: Record<string, unknown>) => Promise<boolean> }) {
  const proj = goalProjection(g);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(g.name);
  const [target, setTarget] = useState(String(g.target));
  const [monthly, setMonthly] = useState(String(g.monthly));
  const [contrib, setContrib] = useState("");
  const color = g.color || ACCENT;

  const reachLabel = proj.done ? "Reached 🎉"
    : proj.reachedBy ? `≈ ${proj.reachedBy.toLocaleDateString("en-GB", { month: "short", year: "numeric" })} (${proj.monthsLeft} mo)`
    : "Set a monthly amount to project";

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: `1px solid ${proj.done ? "var(--accent-green)55" : "var(--border)"}` }}>
      {editing ? (
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
          <div className="flex gap-2">
            <input type="number" min="0" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`Target (${currency})`} className="flex-1 rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
            <input type="number" min="0" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder={`Monthly (${currency})`} className="flex-1 rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {COLOR_PALETTE.slice(0, 8).map((hex) => (
              <button key={hex} onClick={() => mutate({ action: "updateGoal", id: g.id, color: hex })} className="w-5 h-5 rounded-sm" style={{ background: hex, outline: color.toUpperCase() === hex ? "2px solid var(--text)" : "none" }} title={hex} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={async () => { if (await mutate({ action: "updateGoal", id: g.id, name, target: Number(target), monthly: Number(monthly) })) setEditing(false); }} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>Save</button>
            <button onClick={() => setEditing(false)} className="text-sm px-3 py-1.5 rounded-lg" style={inputStyle}>Cancel</button>
            <button onClick={() => { if (window.confirm(`Delete goal "${g.name}"?`)) mutate({ action: "removeGoal", id: g.id }); }} className="text-sm px-3 py-1.5 rounded-lg ml-auto" style={{ color: "var(--accent-red)" }}>Delete</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="font-semibold flex items-center gap-2"><span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />{g.name}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{formatDkk(g.saved)} of {formatDkk(g.target)}{g.monthly > 0 ? ` · ${formatDkk(g.monthly)}/mo` : ""}</div>
            </div>
            <button onClick={() => setEditing(true)} className="text-xs shrink-0" style={{ color: "var(--text-muted)" }} title="Edit">✎</button>
          </div>
          {/* Progress bar */}
          <div className="h-2.5 rounded-full overflow-hidden mb-1" style={{ background: "var(--surface-2)" }}>
            <div className="h-full rounded-full" style={{ width: `${proj.pct}%`, background: color }} />
          </div>
          <div className="flex items-baseline justify-between text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            <span>{Math.round(proj.pct)}%{!proj.done && ` · ${formatDkk(proj.remaining)} to go`}</span>
            <span style={{ color: proj.done ? "var(--accent-green)" : "var(--text-muted)" }}>{reachLabel}</span>
          </div>
          {/* Contribute */}
          {!proj.done && (
            <div className="flex gap-2">
              {g.monthly > 0 && (
                <button onClick={() => mutate({ action: "contributeGoal", id: g.id, amount: g.monthly })} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>+ {formatDkk(g.monthly)} (month)</button>
              )}
              <input type="number" value={contrib} onChange={(e) => setContrib(e.target.value)} placeholder="Amount" className="w-24 rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
              <button onClick={async () => { const n = Number(contrib); if (n) { if (await mutate({ action: "contributeGoal", id: g.id, amount: n })) setContrib(""); } }} className="text-xs px-2.5 py-1.5 rounded-lg" style={inputStyle}>Add</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Year tab ────────────────────────────────────────────────────────────────
function YearTab({ cfg, year, setYear, onOpenMonth }: { cfg: BudgetConfig; year: number; setYear: (y: number) => void; onOpenMonth: (m: number) => void }) {
  const months = useMemo(() => Array.from({ length: 12 }, (_, m) => {
    const totals = categoryTotalsForPeriod(cfg, year, m);
    const allocated = totals.reduce((s, x) => s + x.amount, 0);
    return { m, totals, allocated, budget: budgetForPeriod(cfg, year, m) };
  }), [cfg, year]);
  const maxAllocated = Math.max(1, ...months.map((x) => x.allocated));
  const stats = useMemo(() => yearStats(cfg, year), [cfg, year]);
  const catTotals = useMemo(() => yearlyCategoryTotals(cfg, year), [cfg, year]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setYear(year - 1)} className="text-sm px-3 py-1 rounded-lg" style={inputStyle}>←</button>
        <span className="text-lg font-semibold" style={{ color: "var(--text)" }}>{year}</span>
        <button onClick={() => setYear(year + 1)} className="text-sm px-3 py-1 rounded-lg" style={inputStyle}>→</button>
      </div>

      {/* Info strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <YearStat label="Year budget" value={formatDkk(stats.budgetTotal)} />
        <YearStat label="Allocated" value={formatDkk(stats.allocatedTotal)} color={stats.allocatedTotal > stats.budgetTotal ? "var(--accent-red)" : ACCENT} />
        <YearStat label="Avg / month" value={formatDkk(Math.round(stats.avgAllocatedPerMonth))} />
        <YearStat label="Biggest category" value={stats.biggest ? stats.biggest.category : "—"} sub={stats.biggest ? formatDkk(stats.biggest.amount) : undefined} />
        <YearStat label="Most over" value={stats.mostOver ? MONTHS_SHORT_DA[stats.mostOver.monthIndex] : "none"} sub={stats.mostOver ? `+${formatDkk(stats.mostOver.over)}` : "on budget"} color={stats.mostOver ? "var(--accent-red)" : "var(--accent-green)"} />
      </div>

      {/* Bar chart — click a month to open it */}
      <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>Allocated per month — click a bar to open that month</div>
        <div className="flex items-end justify-between gap-2" style={{ height: 220 }}>
          {months.map(({ m, totals, allocated, budget }) => {
            const barH = allocated <= 0 ? 4 : Math.max(6, (allocated / maxAllocated) * 180);
            const over = allocated > budget && budget > 0;
            return (
              <button key={m} onClick={() => onOpenMonth(m)} className="flex-1 flex flex-col items-center justify-end gap-1 group" title={`${MONTHS_DA[m]}: ${formatDkk(allocated)} of ${formatDkk(budget)}${over ? " · over budget" : ""} — open`}>
                <div className="w-full flex flex-col-reverse rounded-t overflow-hidden group-hover:brightness-125 transition" style={{ height: barH, background: "var(--surface-2)", outline: over ? "1.5px solid var(--accent-red)" : "none" }}>
                  {totals.map((t, i) => (
                    <div key={t.category} style={{ height: allocated > 0 ? `${(t.amount / allocated) * 100}%` : "0%", background: colorFor(cfg, t.category, i) }} />
                  ))}
                </div>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{MONTHS_SHORT_DA[m]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Per-category yearly table */}
      {catTotals.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>By category · {year}</div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-xs">
                <th className="text-left font-medium py-1">Category</th>
                <th className="text-right font-medium py-1">Year total</th>
                <th className="text-right font-medium py-1">Avg / mo</th>
                <th className="text-right font-medium py-1">% of budget</th>
              </tr>
            </thead>
            <tbody>
              {catTotals.map((c, i) => (
                <tr key={c.category} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="py-1.5 flex items-center gap-2"><span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorFor(cfg, c.category, i) }} />{c.category}</td>
                  <td className="text-right py-1.5 font-semibold">{formatDkk(c.amount)}</td>
                  <td className="text-right py-1.5" style={{ color: "var(--text-muted)" }}>{formatDkk(Math.round(c.amount / 12))}</td>
                  <td className="text-right py-1.5" style={{ color: "var(--text-muted)" }}>{stats.budgetTotal > 0 ? `${Math.round((c.amount / stats.budgetTotal) * 100)}%` : "—"}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid var(--border)" }}>
                <td className="py-1.5 font-semibold">Total</td>
                <td className="text-right py-1.5 font-bold" style={{ color: stats.allocatedTotal > stats.budgetTotal ? "var(--accent-red)" : ACCENT }}>{formatDkk(stats.allocatedTotal)}</td>
                <td className="text-right py-1.5" style={{ color: "var(--text-muted)" }}>{formatDkk(Math.round(stats.allocatedTotal / 12))}</td>
                <td className="text-right py-1.5" style={{ color: "var(--text-muted)" }}>{stats.budgetTotal > 0 ? `${Math.round((stats.allocatedTotal / stats.budgetTotal) * 100)}%` : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function YearStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-sm font-bold truncate" style={{ color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────
function SettingsTab({ cfg, mutate }: { cfg: BudgetConfig; mutate: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [newCat, setNewCat] = useState("");
  const isStandard = (c: string) => (STANDARD_CATEGORIES as readonly string[]).some((s) => s.toLowerCase() === c.toLowerCase());
  return (
    <div className="space-y-5">
      {/* Rollover — explicit Yes / No buttons (not a single toggling button). */}
      <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>Roll over leftover budget</div>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Carry each month&apos;s unspent income into the next month&apos;s available budget (within the year).</p>
          </div>
          <div className="inline-flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--border)" }}>
            {([["Yes", true], ["No", false]] as const).map(([label, val]) => {
              const on = cfg.rollover === val;
              return (
                <button key={label} onClick={() => { if (!on) mutate({ action: "setRollover", value: val }); }} className="text-xs px-4 py-1.5"
                  style={{ background: on ? `${ACCENT}22` : "var(--surface-2)", color: on ? ACCENT : "var(--text-muted)", fontWeight: on ? 600 : 400 }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Categories</div>
        <ul className="space-y-2 mb-3">
          {cfg.categories.map((c, i) => (
            <li key={c} className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-sm shrink-0" style={{ background: colorFor(cfg, c, i) }} />
              <span className="flex-1 text-sm" style={{ color: "var(--text)" }}>{c} {isStandard(c) && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>· standard</span>}</span>
              <div className="flex gap-1">
                {COLOR_PALETTE.slice(0, 10).map((hex) => (
                  <button key={hex} onClick={() => mutate({ action: "setColor", category: c, hex })} className="w-4 h-4 rounded-sm" style={{ background: hex, outline: colorFor(cfg, c, i).toUpperCase() === hex ? "2px solid var(--text)" : "none" }} title={hex} />
                ))}
              </div>
              {!isStandard(c) && <button onClick={() => mutate({ action: "removeCategory", name: c })} className="text-xs px-1.5" style={{ color: "var(--accent-red)" }} title="Remove">✕</button>}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" className="flex-1 rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
          <button onClick={async () => { if (await mutate({ action: "addCategory", name: newCat })) setNewCat(""); }} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>Add</button>
        </div>
      </div>
      <button onClick={() => { if (window.confirm("Reset the entire budget to defaults?")) mutate({ action: "reset" }); }} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--accent-red)", border: "1px solid var(--border)" }}>Reset budget</button>
    </div>
  );
}
