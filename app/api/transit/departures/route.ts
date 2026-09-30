import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { fetchDepartures, hasTransitKey } from "@/lib/transit";

/**
 * Live departures from the saved home stop (keyed).
 *   GET /api/transit/departures?max=12 → TransitBoard
 *     → 503 { needsKey } when no Rejseplanen key
 *     → { needsStop: true } when no home stop is saved
 */

const FILE = configPath("transit.json");

function readConfig(): { stopId: string; stopName: string } {
  try {
    const p = JSON.parse(readFileSync(FILE, "utf8"));
    return { stopId: typeof p.stopId === "string" ? p.stopId : "", stopName: typeof p.stopName === "string" ? p.stopName : "" };
  } catch {
    return { stopId: "", stopName: "" };
  }
}

export async function GET(request: Request) {
  const { stopId, stopName } = readConfig();
  if (!hasTransitKey()) {
    return NextResponse.json({ stopId, stopName, departures: [], needsKey: true, error: "No Rejseplanen API key configured." }, { status: 503 });
  }
  if (!stopId) {
    return NextResponse.json({ stopId: "", stopName: "", departures: [], needsStop: true });
  }
  const maxRaw = Number(new URL(request.url).searchParams.get("max") ?? "12");
  const max = Number.isFinite(maxRaw) ? Math.min(Math.max(Math.trunc(maxRaw), 1), 30) : 12;
  const departures = await fetchDepartures(stopId, max);
  return NextResponse.json({ stopId, stopName, departures });
}
