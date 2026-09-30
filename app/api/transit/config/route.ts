import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { hasTransitKey } from "@/lib/transit";

/**
 * Transit config — file-based. The user's home stop + favourite lines.
 *   GET  /api/transit/config → { stopId, stopName, favoriteLines, hasKey }
 *   POST /api/transit/config → { stopId?, stopName?, favoriteLines? }
 * `favoriteLines` = a few lines the user rides often (e.g. "2A", "Bus 5") so
 * the departure board can pin/highlight them without looking them up. Max 3.
 */

const FILE = configPath("transit.json");
const MAX_LINES = 3;

interface TransitConfig { stopId: string; stopName: string; favoriteLines: string[] }

function read(): TransitConfig {
  try {
    const p = JSON.parse(readFileSync(FILE, "utf8"));
    return {
      stopId: typeof p.stopId === "string" ? p.stopId : "",
      stopName: typeof p.stopName === "string" ? p.stopName : "",
      favoriteLines: Array.isArray(p.favoriteLines) ? p.favoriteLines.filter((l: unknown) => typeof l === "string").slice(0, MAX_LINES) : [],
    };
  } catch {
    return { stopId: "", stopName: "", favoriteLines: [] };
  }
}
function write(cfg: TransitConfig): void {
  writeFileSync(FILE, JSON.stringify(cfg, null, 2));
}

export function GET() {
  return NextResponse.json({ ...read(), hasKey: hasTransitKey() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const cfg = read();
  if ("stopId" in body) cfg.stopId = String(body.stopId ?? "").trim();
  if ("stopName" in body) cfg.stopName = String(body.stopName ?? "").trim();
  if ("favoriteLines" in body && Array.isArray(body.favoriteLines)) {
    cfg.favoriteLines = body.favoriteLines
      .filter((l: unknown) => typeof l === "string")
      .map((l: string) => l.trim())
      .filter((l: string, i: number, a: string[]) => l && a.indexOf(l) === i)
      .slice(0, MAX_LINES);
  }
  write(cfg);
  return NextResponse.json(cfg);
}
