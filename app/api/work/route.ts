import { NextResponse } from "next/server";
import fs from "fs";
import { configPath } from "@/lib/config-dir";

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

interface WorkConfig {
  /** When you get paid (display / countdown). Default: last weekday of month. */
  payday: Payday;
  /**
   * Day-of-month the pay-term flips. Default 23, so a term runs 24th → 23rd.
   * Independent of `payday` — Danish shape: work-period ends on the 23rd,
   * kroner arrive on the last banking day of the same month.
   */
  payTermEnd: PayTermEnd;
  hoursByWeek: Record<string, number>;
  sessions: WorkSession[];
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
    return {
      payday,
      payTermEnd,
      hoursByWeek: parsed.hoursByWeek ?? {},
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { payday: "last-weekday", payTermEnd: DEFAULT_PAY_TERM_END, hoursByWeek: {}, sessions: [] };
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
  return NextResponse.json(readConfig());
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
