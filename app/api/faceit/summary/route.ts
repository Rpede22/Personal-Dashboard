import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { FaceitAccount, hasFaceitKey, buildFaceitSummary } from "@/lib/faceit";

/**
 * Live FACEIT (CS2) summary for one saved account.
 *   GET /api/faceit/summary?id=<accountId>  → FaceitSummary
 * 503 when no `FACEIT_API_KEY` is configured (the hub renders a friendly
 * "add a key" banner in that case).
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
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const account = readAccounts().find((a) => a.id === id);
  if (!account) return NextResponse.json({ error: "Unknown account." }, { status: 404 });

  if (!hasFaceitKey()) {
    return NextResponse.json(
      { error: "No FACEIT API key configured.", needsKey: true, account, nickname: account.nickname },
      { status: 503 },
    );
  }

  const summary = await buildFaceitSummary(account);
  return NextResponse.json(summary);
}
