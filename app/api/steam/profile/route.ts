import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { buildSteamProfile, hasSteamKey } from "@/lib/steam";

/**
 * Steam profile — recently-played + playtime stats. **Keyed** (needs
 * `STEAM_API_KEY`). Reads the saved SteamID64 (same `steam.json` as the wishlist).
 *   GET /api/steam/profile
 *     → SteamProfile
 *     → { needsId: true }  when no SteamID is set
 *     → 503 { needsKey: true } when no Steam Web API key is configured
 */

const FILE = configPath("steam.json");

function readConfig(): { steamId: string } {
  try {
    const p = JSON.parse(readFileSync(FILE, "utf8"));
    return { steamId: typeof p.steamId === "string" ? p.steamId : "" };
  } catch {
    return { steamId: "" };
  }
}

export async function GET() {
  const { steamId } = readConfig();
  if (!steamId) {
    return NextResponse.json({ steamId: "", recentlyPlayed: [], topPlayed: [], gameCount: 0, totalPlaytimeMin: 0, needsId: true });
  }
  if (!hasSteamKey()) {
    return NextResponse.json(
      { steamId, recentlyPlayed: [], topPlayed: [], gameCount: 0, totalPlaytimeMin: 0, needsKey: true, error: "No Steam Web API key configured." },
      { status: 503 },
    );
  }
  const profile = await buildSteamProfile(steamId);
  return NextResponse.json(profile);
}
