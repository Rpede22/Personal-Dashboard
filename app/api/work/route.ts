import { NextResponse } from "next/server";
import fs from "fs";
import { configPath } from "@/lib/config-dir";
import { computeEarnings } from "@/lib/payday";

/**
 * Simple JSON-file config for the Work widget. No Cand API exists, so this
 * powers the manual work-log + payday countdown + pay-term totals.
 *
 * Shape of `.work-config.json`:
 *   {
 *     "payday": 25 | "last-weekday" | null,   // day-of-month (1..31), sentinel, or disabled
 *     "hoursByWeek": {                        // legacy — key = Monday YYYY-MM-DD, kept for reads only
 *       "2026-08-04": 18.5
 *     },
 *     "sessions": [                           // new — per-day work entries
 *       { "date": "2026-08-08", "hours": 4.5, "note": "morning shift" }
 *     ]
 *   }
 */

export type Payday = number | "last-weekday" | null;
export type PayTermEnd = number; // day-of-month 1..31

const DEFAULT_PAY_TERM_END: PayTermEnd = 23;

interface WorkSession { date: string; hours: number; hourlyRate?: number; note?: string }

/**
 * A fixed/recurring monthly income beyond the hourly job — e.g. Danish SU (a
 * fixed monthly student grant). `taxed:false` means the amount is already net
 * (SU is paid net) so it flows straight to the net total; `taxed:true` means
 * it's a gross amount run through the same AM-bidrag/A-skat model as job pay.
 */
interface FixedIncome { id: string; label: string; amountPerMonth: number; taxed: boolean }

const DEFAULT_MONTHLY_HOURS = 160;
const DEFAULT_REGISTER_URL = "https://profil.cand.dk/work/register";
const DEFAULT_PAYSLIP_URL = "https://intect.app/selfservice/payslip";

interface WorkConfig {
  /**
   * Whether hour-tracking is on. When false, the Work hub/widget collapse to a
   * disabled state and any consumer that needs a monthly-hours figure uses
   * `monthlyHoursFallback` instead of summing logged sessions. For people on a
   * fixed salary who don't log hours.
   */
  enabled: boolean;
  /** Flat monthly hours assumed when `enabled` is false (default 160). */
  monthlyHoursFallback: number;
  /** External links (editable; empty string hides the button). */
  registerUrl: string;
  payslipUrl: string;
  /** When you get paid (display / countdown). Default: last weekday of month. */
  payday: Payday;
  /**
   * Day-of-month the pay-term flips. Default 23, so a term runs 24th → 23rd.
   * Independent of `payday` — Danish shape: work-period ends on the 23rd,
   * kroner arrive on the last banking day of the same month.
   */
  payTermEnd: PayTermEnd;
  /** "Do you have more than one income?" — when false, `incomes` is ignored and
   *  the monthly figures come from the hourly job alone (single-job default). */
  multipleIncomes: boolean;
  /** Fixed monthly incomes (SU, a stipend, etc.) added on top of job earnings. */
  incomes: FixedIncome[];
  hoursByWeek: Record<string, number>;
  sessions: WorkSession[];
}

function sanitizeIncomes(raw: unknown): FixedIncome[] {
  if (!Array.isArray(raw)) return [];
  const out: FixedIncome[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const amount = Number(o.amountPerMonth);
    if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) continue;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : Math.random().toString(36).slice(2, 10),
      label: String(o.label ?? "").slice(0, 60) || "Income",
      amountPerMonth: amount,
      taxed: Boolean(o.taxed),
    });
  }
  return out;
}

const CONFIG_PATH = configPath(".work-config.json");

function readConfig(): WorkConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkConfig>;
    const p = parsed.payday;
    const payday: Payday =
      p === "last-weekday" ? "last-weekday"
      : typeof p === "number" ? p
      : "last-weekday";
    const pt = parsed.payTermEnd;
    const payTermEnd: PayTermEnd =
      typeof pt === "number" && Number.isFinite(pt) && pt >= 1 && pt <= 31
        ? Math.floor(pt)
        : DEFAULT_PAY_TERM_END;
    const mh = parsed.monthlyHoursFallback;
    return {
      enabled: parsed.enabled === undefined ? true : Boolean(parsed.enabled),
      monthlyHoursFallback: typeof mh === "number" && mh >= 0 && mh <= 744 ? mh : DEFAULT_MONTHLY_HOURS,
      registerUrl: typeof parsed.registerUrl === "string" ? parsed.registerUrl : DEFAULT_REGISTER_URL,
      payslipUrl: typeof parsed.payslipUrl === "string" ? parsed.payslipUrl : DEFAULT_PAYSLIP_URL,
      payday,
      payTermEnd,
      multipleIncomes: Boolean(parsed.multipleIncomes),
      incomes: sanitizeIncomes(parsed.incomes),
      hoursByWeek: parsed.hoursByWeek ?? {},
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return {
      enabled: true,
      monthlyHoursFallback: DEFAULT_MONTHLY_HOURS,
      registerUrl: DEFAULT_REGISTER_URL,
      payslipUrl: DEFAULT_PAYSLIP_URL,
      payday: "last-weekday",
      payTermEnd: DEFAULT_PAY_TERM_END,
      multipleIncomes: false,
      incomes: [],
      hoursByWeek: {},
      sessions: [],
    };
  }
}

function writeConfig(cfg: WorkConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function isDateStr(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Accept an optional hourly-rate value; return `undefined` if omitted, a
 *  number if it validates, or the sentinel string `"invalid"` so the caller
 *  can respond with 400. Keeps legacy sessions (no rate) working. */
function parseRate(v: unknown): number | undefined | "invalid" {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10000) return "invalid";
  return n;
}

export async function GET() {
  const cfg = readConfig();
  // Current calendar month's income, for the Budget hub's "use Work income"
  // integration. Gross = this month's rated sessions (hours × rate); net via
  // the same AM-bidrag/A-skat model the Work hub uses.
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const jobGross = cfg.sessions.reduce((sum, s) => {
    if (typeof s.hourlyRate === "number" && s.date.startsWith(prefix)) return sum + s.hours * s.hourlyRate;
    return sum;
  }, 0);

  // Fold in fixed incomes (SU, etc.) only when the user has opted into
  // multiple income sources. `computeEarnings` is linear in this fixed-percent
  // model, so taxed job + taxed fixed incomes can be taxed together in one call;
  // untaxed incomes (already net, like SU) add straight to net.
  const useIncomes = cfg.multipleIncomes && cfg.incomes.length > 0;
  const taxedExtra = useIncomes ? cfg.incomes.filter((i) => i.taxed).reduce((s, i) => s + i.amountPerMonth, 0) : 0;
  const untaxedExtra = useIncomes ? cfg.incomes.filter((i) => !i.taxed).reduce((s, i) => s + i.amountPerMonth, 0) : 0;

  const taxed = computeEarnings(jobGross + taxedExtra);
  const monthlyGrossIncome = taxed.gross + untaxedExtra; // untaxed has no "gross" — count it at face value
  const monthlyNetIncome = taxed.net + untaxedExtra;

  // Breakdown so the UI can show "Job Xkr + SU Ykr = Zkr net".
  const incomeBreakdown = {
    jobNet: computeEarnings(jobGross).net,
    fixed: useIncomes
      ? cfg.incomes.map((i) => ({ label: i.label, taxed: i.taxed, net: i.taxed ? computeEarnings(i.amountPerMonth).net : i.amountPerMonth }))
      : [],
  };

  return NextResponse.json({ ...cfg, monthlyGrossIncome, monthlyNetIncome, incomeBreakdown });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const cfg = readConfig();

  if ("payday" in body) {
    const p = body.payday;
    if (p === null || p === "" || p === undefined) cfg.payday = null;
    else if (p === "last-weekday") cfg.payday = "last-weekday";
    else {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 1 || n > 31) {
        return NextResponse.json({ error: "payday must be 1..31, 'last-weekday', or null" }, { status: 400 });
      }
      cfg.payday = Math.floor(n);
    }
  }

  if ("payTermEnd" in body) {
    const n = Number(body.payTermEnd);
    if (!Number.isFinite(n) || n < 1 || n > 31) {
      return NextResponse.json({ error: "payTermEnd must be 1..31" }, { status: 400 });
    }
    cfg.payTermEnd = Math.floor(n);
  }

  if ("enabled" in body) cfg.enabled = Boolean(body.enabled);

  // Multiple income sources (job + SU, etc.).
  if ("multipleIncomes" in body) cfg.multipleIncomes = Boolean(body.multipleIncomes);
  if ("incomes" in body) cfg.incomes = sanitizeIncomes(body.incomes);

  if ("monthlyHoursFallback" in body) {
    const n = Number(body.monthlyHoursFallback);
    if (!Number.isFinite(n) || n < 0 || n > 744) {
      return NextResponse.json({ error: "monthlyHoursFallback must be 0..744" }, { status: 400 });
    }
    cfg.monthlyHoursFallback = n;
  }

  // Links: accept http(s) or empty string (empty = hide the button).
  for (const key of ["registerUrl", "payslipUrl"] as const) {
    if (key in body) {
      const u = String(body[key] ?? "").trim();
      if (u !== "" && !/^https?:\/\//i.test(u)) {
        return NextResponse.json({ error: `${key} must be http(s) or empty` }, { status: 400 });
      }
      cfg[key] = u;
    }
  }

  // Legacy weekly hours (kept for read-through so old data isn't lost).
  if ("weekStart" in body && "hours" in body) {
    const week = String(body.weekStart);
    if (!isDateStr(week)) {
      return NextResponse.json({ error: "weekStart must be YYYY-MM-DD" }, { status: 400 });
    }
    const h = Number(body.hours);
    if (body.hours === null || body.hours === "") {
      delete cfg.hoursByWeek[week];
    } else if (!Number.isFinite(h) || h < 0 || h > 168) {
      return NextResponse.json({ error: "hours must be 0..168" }, { status: 400 });
    } else {
      cfg.hoursByWeek[week] = h;
    }
  }

  // New session-based logging. Actions:
  //   { session: { date, hours, note? } }              → add a session
  //   { deleteSessionIndex: 0 }                        → remove by index
  //   { updateSessionIndex: 0, session: { ... } }      → replace at index
  if ("session" in body && !("updateSessionIndex" in body)) {
    const s = body.session ?? {};
    if (!isDateStr(s.date)) return NextResponse.json({ error: "session.date must be YYYY-MM-DD" }, { status: 400 });
    const h = Number(s.hours);
    if (!Number.isFinite(h) || h < 0 || h > 24) return NextResponse.json({ error: "session.hours must be 0..24" }, { status: 400 });
    const rate = parseRate(s.hourlyRate);
    if (rate === "invalid") return NextResponse.json({ error: "session.hourlyRate must be 0..10000" }, { status: 400 });
    cfg.sessions.push({ date: s.date, hours: h, hourlyRate: rate, note: typeof s.note === "string" ? s.note : undefined });
  }

  if ("updateSessionIndex" in body) {
    const idx = Number(body.updateSessionIndex);
    const s = body.session ?? {};
    if (!Number.isInteger(idx) || idx < 0 || idx >= cfg.sessions.length) {
      return NextResponse.json({ error: "invalid updateSessionIndex" }, { status: 400 });
    }
    if (!isDateStr(s.date)) return NextResponse.json({ error: "session.date must be YYYY-MM-DD" }, { status: 400 });
    const h = Number(s.hours);
    if (!Number.isFinite(h) || h < 0 || h > 24) return NextResponse.json({ error: "session.hours must be 0..24" }, { status: 400 });
    const rate = parseRate(s.hourlyRate);
    if (rate === "invalid") return NextResponse.json({ error: "session.hourlyRate must be 0..10000" }, { status: 400 });
    cfg.sessions[idx] = { date: s.date, hours: h, hourlyRate: rate, note: typeof s.note === "string" ? s.note : undefined };
  }

  if ("deleteSessionIndex" in body) {
    const idx = Number(body.deleteSessionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= cfg.sessions.length) {
      return NextResponse.json({ error: "invalid deleteSessionIndex" }, { status: 400 });
    }
    cfg.sessions.splice(idx, 1);
  }

  writeConfig(cfg);
  return NextResponse.json(cfg);
}
