import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { buildWishlist } from "@/lib/steam";

/**
 * Steam wishlist + sale alerts (keyless). Reads the saved SteamID64, resolves
 * the wishlist, and prices each item.
 *   GET /api/steam/wishlist → SteamWishlist  (or { needsId } when no SteamID set)
 */

const FILE = configPath("steam.json");

function readConfig(): { steamId: string; countryCode: string } {
  try {
    const p = JSON.parse(readFileSync(FILE, "utf8"));
    return { steamId: typeof p.steamId === "string" ? p.steamId : "", countryCode: typeof p.countryCode === "string" ? p.countryCode : "dk" };
  } catch {
    return { steamId: "", countryCode: "dk" };
  }
}

export async function GET() {
  const { steamId, countryCode } = readConfig();
  if (!steamId) {
    return NextResponse.json({ steamId: "", items: [], onSaleCount: 0, needsId: true, error: "No SteamID configured." });
  }
  const wishlist = await buildWishlist(steamId, countryCode);
  return NextResponse.json(wishlist);
}
