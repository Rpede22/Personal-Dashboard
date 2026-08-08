import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Simple JSON-file config for the Work widget. No Cand API exists, so this
 * powers the manual "hours worked this week" pill and the payday countdown.
 *
 * Shape of `.work-config.json`:
 *   {
 *     "payday": 25,                          // day-of-month (1..31), null = disabled
 *     "hoursByWeek": {                       // key = Monday of the week (YYYY-MM-DD, local)
 *       "2026-08-04": 18.5,
 *       "2026-08-11": 22
 *     }
 *   }
 */

interface WorkConfig {
  payday: number | null;
  hoursByWeek: Record<string, number>;
}

const CONFIG_PATH = path.join(process.cwd(), ".work-config.json");

function readConfig(): WorkConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkConfig>;
    return {
      payday: typeof parsed.payday === "number" ? parsed.payday : null,
      hoursByWeek: parsed.hoursByWeek ?? {},
    };
  } catch {
    return { payday: null, hoursByWeek: {} };
  }
}

function writeConfig(cfg: WorkConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
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
    else {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 1 || n > 31) {
        return NextResponse.json({ error: "payday must be 1..31 or null" }, { status: 400 });
      }
      cfg.payday = Math.floor(n);
    }
  }

  if ("weekStart" in body && "hours" in body) {
    const week = String(body.weekStart);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
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

  writeConfig(cfg);
  return NextResponse.json(cfg);
}
