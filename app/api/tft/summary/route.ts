import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { TftAccount, buildTftSummary, hasTftKey } from "@/lib/tft";

/**
 * Live TFT summary for one saved account.
 *   GET /api/tft/summary?id=<accountId>
 *     → TftSummary
 *     → 503 { needsKey } when no Riot key
 *     → 404 when the account id isn't found
 * A resolved puuid is written back into `tft-accounts.json` so later calls skip
 * the Account-v1 round-trip.
 */

const FILE = configPath("tft-accounts.json");

function read(): TftAccount[] {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(parsed?.accounts) ? (parsed.accounts as TftAccount[]) : [];
  } catch {
    return [];
  }
}
function write(accounts: TftAccount[]): void {
  try { writeFileSync(FILE, JSON.stringify({ accounts }, null, 2)); } catch { /* ignore */ }
}

export async function GET(request: Request) {
  if (!hasTftKey()) {
    return NextResponse.json({ needsKey: true, error: "No Riot TFT API key configured." }, { status: 503 });
  }
  const id = new URL(request.url).searchParams.get("id");
  const accounts = read();
  const account = accounts.find((a) => a.id === id);
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const summary = await buildTftSummary(account);

  // Persist a freshly-resolved puuid so we don't re-resolve every call.
  if (summary.account.puuid && summary.account.puuid !== account.puuid) {
    write(accounts.map((a) => (a.id === account.id ? { ...a, puuid: summary.account.puuid } : a)));
  }
  return NextResponse.json(summary);
}
