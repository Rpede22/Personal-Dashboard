/**
 * Payday helpers. Payday can be:
 *   - a day-of-month (1..31), clamped to the target month's length
 *   - "last-weekday": the last Mon–Fri of the target month
 *   - null: no payday configured
 */

export type Payday = number | "last-weekday" | null;

/** Last weekday (Mon–Fri) of the given year/month (0-indexed month). */
export function lastWeekdayOfMonth(year: number, monthIdx: number): number {
  // Start at the last day of the month, walk back to Mon–Fri.
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  for (let d = lastDay; d >= 1; d--) {
    const dow = new Date(year, monthIdx, d).getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) return d;
  }
  return lastDay;
}

/** Resolve the payday for a given (year, monthIdx) to an actual date at 00:00 local. */
export function resolvePayday(payday: Payday, year: number, monthIdx: number): Date | null {
  if (payday == null) return null;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const day = payday === "last-weekday"
    ? lastWeekdayOfMonth(year, monthIdx)
    : Math.min(payday, daysInMonth);
  const d = new Date(year, monthIdx, day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The next payday on or after `now` (local time). */
export function nextPayday(payday: Payday, now: Date = new Date()): Date | null {
  if (payday == null) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const thisMonth = resolvePayday(payday, today.getFullYear(), today.getMonth());
  if (thisMonth && thisMonth >= today) return thisMonth;
  return resolvePayday(payday, today.getFullYear(), today.getMonth() + 1);
}

/** Days until the next payday, inclusive of today (0 = today). */
export function daysUntilPayday(payday: Payday, now: Date = new Date()): number | null {
  const next = nextPayday(payday, now);
  if (!next) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

/**
 * The pay-term is the window that ends at the next payday and begins the
 * day after the previous payday (exclusive of the previous, inclusive of
 * the current). Returns { start, end } — both local midnight; `end` is the
 * payday itself (inclusive on the day, so we compare with `date <= end`).
 */
export function currentPayTerm(payday: Payday, now: Date = new Date()): { start: Date; end: Date } | null {
  if (payday == null) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const end = nextPayday(payday, now);
  if (!end) return null;
  // Previous payday = the payday of the month before `end`'s month
  // (or same month if end is >1 payday per month — not the case here).
  const prev = resolvePayday(payday, end.getFullYear(), end.getMonth() - 1);
  if (!prev) return null;
  const start = new Date(prev);
  start.setDate(start.getDate() + 1); // exclusive of previous payday
  return { start, end };
}

/**
 * The most-recently-completed pay term: end = previous payday (today or earlier),
 * start = one day after the payday before that. Returns null if the payday isn't
 * set or the previous term can't be resolved yet.
 */
export function previousPayTerm(payday: Payday, now: Date = new Date()): { start: Date; end: Date } | null {
  if (payday == null) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const next = nextPayday(payday, now);
  if (!next) return null;
  // Previous payday = last month's payday (or same month if next is next month's)
  const prev = resolvePayday(payday, next.getFullYear(), next.getMonth() - 1);
  if (!prev) return null;
  const prevPrev = resolvePayday(payday, prev.getFullYear(), prev.getMonth() - 1);
  if (!prevPrev) return null;
  const start = new Date(prevPrev);
  start.setDate(start.getDate() + 1);
  return { start, end: prev };
}

/** Sum session hours whose `date` (YYYY-MM-DD) falls within [start, end] inclusive on both ends. */
export function sumHoursInTerm(
  sessions: Array<{ date: string; hours: number }>,
  term: { start: Date; end: Date }
): number {
  const startKey = dateKey(term.start);
  const endKey = dateKey(term.end);
  let total = 0;
  for (const s of sessions) {
    if (s.date >= startKey && s.date <= endKey) total += s.hours;
  }
  return total;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Danish take-home for a gross amount. Fixed-percentage model matching the
 * user's setup: 8% AM-bidrag off the top, then 38% A-skat on what remains.
 * Not a full tax calc (no fradrag, no deductions) — but honest enough for a
 * paycheck-preview widget.
 */
export const AM_BIDRAG_PCT = 0.08;
export const A_SKAT_PCT = 0.38;

export interface Earnings {
  gross: number;
  amBidrag: number;
  aSkat: number;
  net: number;
}

export function computeEarnings(gross: number): Earnings {
  const amBidrag = gross * AM_BIDRAG_PCT;
  const afterAm = gross - amBidrag;
  const aSkat = afterAm * A_SKAT_PCT;
  return { gross, amBidrag, aSkat, net: afterAm - aSkat };
}

/**
 * Sum gross earnings from every session in the given term. Sessions without
 * an `hourlyRate` contribute 0 kr (they still count for hours totals via
 * `sumHoursInTerm`); the UI can flag them so old data isn't silently
 * miscounted.
 */
export function sumEarningsInTerm(
  sessions: Array<{ date: string; hours: number; hourlyRate?: number }>,
  term: { start: Date; end: Date }
): number {
  const startKey = dateKey(term.start);
  const endKey = dateKey(term.end);
  let gross = 0;
  for (const s of sessions) {
    if (s.date >= startKey && s.date <= endKey && typeof s.hourlyRate === "number") {
      gross += s.hours * s.hourlyRate;
    }
  }
  return gross;
}

/** Format a kr amount in Danish locale, no decimals for whole kr. */
export function formatDkk(amount: number): string {
  const rounded = Math.round(amount);
  return `${rounded.toLocaleString("da-DK")} kr`;
}

export function formatPaydayLabel(payday: Payday): string {
  if (payday == null) return "not set";
  if (payday === "last-weekday") return "last weekday";
  return `day ${payday}`;
}
