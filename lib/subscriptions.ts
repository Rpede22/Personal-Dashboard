/**
 * Subscription tracker — shared types + pure helpers (client-safe, no `fs`).
 * The recurring-expense data here feeds the Finance category and (later) the
 * Budget hub, which reads the same monthly total as a fixed expense.
 */

export type Cycle = "weekly" | "monthly" | "quarterly" | "yearly";

export interface Subscription {
  id: string;
  name: string;
  amount: number;        // charge per cycle, in kr
  cycle: Cycle;
  nextCharge: string;    // YYYY-MM-DD (always normalised forward to today-or-later on read)
  category?: string;     // free-text grouping (e.g. "Streaming", "Software")
  note?: string;
}

export const CYCLES: { value: Cycle; label: string; perYear: number }[] = [
  { value: "weekly",    label: "Weekly",    perYear: 52 },
  { value: "monthly",   label: "Monthly",   perYear: 12 },
  { value: "quarterly", label: "Quarterly", perYear: 4 },
  { value: "yearly",    label: "Yearly",    perYear: 1 },
];

export function cycleLabel(cycle: Cycle): string {
  return CYCLES.find((c) => c.value === cycle)?.label ?? cycle;
}

/** Normalise a per-cycle charge to an average monthly cost. */
export function monthlyAmount(amount: number, cycle: Cycle): number {
  const c = CYCLES.find((x) => x.value === cycle);
  return c ? (amount * c.perYear) / 12 : amount;
}

/** Sum of all subscriptions expressed as an average monthly cost. */
export function monthlyTotal(subs: Subscription[]): number {
  return subs.reduce((sum, s) => sum + monthlyAmount(s.amount, s.cycle), 0);
}

/** Days from `today` (local midnight) until a YYYY-MM-DD date. Negative = past. */
export function daysUntil(dateStr: string, now = new Date()): number {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  const target = new Date(y, m - 1, d);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Roll a charge date forward by whole cycles until it's today-or-later.
 *  Keeps the day-of-cycle stable (adds weeks/months/years, not fixed days). */
export function rollForward(dateStr: string, cycle: Cycle, now = new Date()): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const date = new Date(y, m - 1, d);
  let guard = 0;
  while (date.getTime() < today.getTime() && guard < 1000) {
    switch (cycle) {
      case "weekly":    date.setDate(date.getDate() + 7); break;
      case "monthly":   date.setMonth(date.getMonth() + 1); break;
      case "quarterly": date.setMonth(date.getMonth() + 3); break;
      case "yearly":    date.setFullYear(date.getFullYear() + 1); break;
    }
    guard++;
  }
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}
