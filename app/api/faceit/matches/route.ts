import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { FaceitAccount, fetchPlayerMatches, computeRecentStats, hasFaceitKey } from "@/lib/faceit";

/**
 * Recent CS2 match history + last-N aggregate for one saved account.
 *   GET /api/faceit/matches?id=<accountId>&limit=30
 *     → { matches, stats }
 *     → 503 { needsKey } when no FACEIT_API_KEY
 *     → 404 when the account id isn't found
 */

const FILE = configPath("faceit-accounts.json");

function readAccounts(): FaceitAccount[] {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(parsed?.accounts) ? (parsed.accounts as FaceitAccount[]) : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  if (!hasFaceitKey()) {
    return NextResponse.json({ needsKey: true, error: "No FACEIT API key configured." }, { status: 503 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "30") || 30, 1), 100);
  const account = readAccounts().find((a) => a.id === id);
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const matches = await fetchPlayerMatches(account, limit);
  if (matches === null) {
    return NextResponse.json({ matches: [], stats: null, error: `Couldn't load matches for "${account.nickname}".` });
  }
  return NextResponse.json({ matches, stats: computeRecentStats(matches) });
}
