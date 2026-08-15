/**
 * Payday helpers.
 *
 * The **pay-term** and **payday** are two separate concepts:
 *   - `PayTermEnd` (day-of-month, 1..31) defines the boundary of the accounting
 *     window. Default 23. A term runs `(prevEnd + 1) → thisEnd`, so with
 *     payTermEnd=23 the current window is "24th of last month → 23rd of this
 *     month". Everything worked inside the window rolls up to one payslip.
 *   - `Payday` is when that payslip actually pays out. Common Danish shape:
 *     work-period ends on the 23rd, kroner arrive on the last banking day of
 *     the month — several days after the term has already flipped to the next
 *     window.
 *
 * `Payday` can be:
 *   - a day-of-month (1..31), clamped to the target month's length
 *   - "last-weekday": the last Mon–Fri of the target month
 *   - null: no payday configured
 */

export type Payday = number | "last-weekday" | null;

/** Day-of-month (1..31) — the end of one pay-term / start of the next. */
export type PayTermEnd = number;
export const DEFAULT_PAY_TERM_END: PayTermEnd = 23;

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
 * Resolve a pay-term-end day for (year, monthIdx) to a local-midnight Date.
 * Day is clamped to the month's length (Feb 30 → Feb 28/29).
 */
function resolvePayTermEnd(payTermEnd: PayTermEnd, year: number, monthIdx: number): Date {
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const day = Math.max(1, Math.min(payTermEnd, daysInMonth));
  const d = new Date(year, monthIdx, day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * The pay-term that contains `now`. Term ends on `payTermEnd` and begins the
 * day after the previous month's `payTermEnd`. With payTermEnd=23:
 *   - Aug 10 → term Jul 24 → Aug 23
 *   - Aug 23 → term Jul 24 → Aug 23 (last day of term)
 *   - Aug 24 → term Aug 24 → Sep 23 (first day of next term)
 */
export function currentPayTerm(payTermEnd: PayTermEnd, now: Date = new Date()): { start: Date; end: Date } {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const thisMonthEnd = resolvePayTermEnd(payTermEnd, today.getFullYear(), today.getMonth());
  const end = today <= thisMonthEnd
    ? thisMonthEnd
    : resolvePayTermEnd(payTermEnd, today.getFullYear(), today.getMonth() + 1);
  const prev = resolvePayTermEnd(payTermEnd, end.getFullYear(), end.getMonth() - 1);
  const start = new Date(prev); start.setDate(start.getDate() + 1);
  return { start, end };
}

/** The pay-term immediately preceding the current one. */
export function previousPayTerm(payTermEnd: PayTermEnd, now: Date = new Date()): { start: Date; end: Date } {
  const cur = currentPayTerm(payTermEnd, now);
  const prevEnd = new Date(cur.start); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevPrev = resolvePayTermEnd(payTermEnd, prevEnd.getFullYear(), prevEnd.getMonth() - 1);
  const start = new Date(prevPrev); start.setDate(start.getDate() + 1);
  return { start, end: prevEnd };
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
