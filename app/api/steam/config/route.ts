import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { isSteamId64, hasSteamKey, resolveVanityUrl } from "@/lib/steam";

/**
 * Steam config — file-based. Just the user's SteamID64 + store country code.
 *   GET  /api/steam/config          → { steamId, countryCode, hasKey }
 *   POST /api/steam/config          → { steamId?, countryCode? }
 *
 * The `steamId` field accepts a bare SteamID64, a full profile URL
 * (`/profiles/765…` or `/id/<vanity>`), or — when a Steam Web API key is set —
 * a bare vanity/custom-URL name, which is resolved server-side to a SteamID64.
 */

/**
 * Turn user input into a SteamID64. Returns `{ steamId }` on success, or
 * `{ error }` when it can't (bad input, or a vanity name with no key to resolve).
 */
async function resolveInput(raw: string): Promise<{ steamId?: string; error?: string }> {
  const input = raw.trim();
  if (!input) return { steamId: "" }; // clearing the ID
  if (isSteamId64(input)) return { steamId: input };

  // Full profile URL forms.
  const profileMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profileMatch) return { steamId: profileMatch[1] };
  const vanityUrlMatch = input.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  const vanity = vanityUrlMatch ? decodeURIComponent(vanityUrlMatch[1]) : input;

  if (!hasSteamKey()) {
    return { error: "That doesn't look like a SteamID64 (a 17-digit number starting 7656…). Custom-URL names need a Steam Web API key — until one is added, paste your SteamID64." };
  }
  const resolved = await resolveVanityUrl(vanity);
  if (!resolved) return { error: `Couldn't resolve "${vanity}" to a Steam account — check the custom URL name.` };
  return { steamId: resolved };
}

const FILE = configPath("steam.json");

interface SteamConfig { steamId: string; countryCode: string }

function read(): SteamConfig {
  try {
    const p = JSON.parse(readFileSync(FILE, "utf8"));
    return { steamId: typeof p.steamId === "string" ? p.steamId : "", countryCode: typeof p.countryCode === "string" ? p.countryCode : "dk" };
  } catch {
    return { steamId: "", countryCode: "dk" };
  }
}
function write(cfg: SteamConfig): void {
  writeFileSync(FILE, JSON.stringify(cfg, null, 2));
}

export function GET() {
  return NextResponse.json({ ...read(), hasKey: hasSteamKey() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const cfg = read();
  if ("steamId" in body) {
    const { steamId, error } = await resolveInput(String(body.steamId ?? ""));
    if (error) return NextResponse.json({ error }, { status: 400 });
    cfg.steamId = steamId ?? "";
  }
  if ("countryCode" in body) {
    const cc = String(body.countryCode ?? "").trim().toLowerCase();
    if (/^[a-z]{2}$/.test(cc)) cfg.countryCode = cc;
  }
  write(cfg);
  return NextResponse.json(cfg);
}
