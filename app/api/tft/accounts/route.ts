import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { TftAccount, hasTftKey, resolveTftAccount } from "@/lib/tft";

/**
 * TFT account list — file-based (no DB). Accounts are Riot IDs (gameName#tagLine)
 * + a platform region; the summary route does the live TFT lookups.
 *   GET    /api/tft/accounts        → { accounts, hasKey }
 *   POST   /api/tft/accounts        → add { gameName, tagLine, region? }
 *   DELETE /api/tft/accounts?id=X   → remove one
 */

const FILE = configPath("tft-accounts.json");
const MAX_ACCOUNTS = 10;
const DEFAULT_REGION = "euw1";

function read(): TftAccount[] {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(parsed?.accounts) ? (parsed.accounts as TftAccount[]) : [];
  } catch {
    return [];
  }
}
function write(accounts: TftAccount[]): void {
  writeFileSync(FILE, JSON.stringify({ accounts }, null, 2));
}

export function GET() {
  return NextResponse.json({ accounts: read(), hasKey: hasTftKey() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const gameName = String(body.gameName ?? "").trim();
  const tagLine = String(body.tagLine ?? "").trim().replace(/^#/, "");
  const region = String(body.region ?? DEFAULT_REGION).trim().toLowerCase() || DEFAULT_REGION;
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "A Riot ID (name + tag) is required, e.g. Faker#KR1." }, { status: 400 });
  }

  const accounts = read();
  if (accounts.length >= MAX_ACCOUNTS) return NextResponse.json({ error: `Max ${MAX_ACCOUNTS} accounts.` }, { status: 400 });
  if (accounts.some((a) => a.gameName.toLowerCase() === gameName.toLowerCase() && a.tagLine.toLowerCase() === tagLine.toLowerCase())) {
    return NextResponse.json({ error: "That Riot ID is already added." }, { status: 400 });
  }

  // Validate the Riot ID via Account-v1 (product-agnostic) + capture puuid.
  let puuid: string | undefined;
  if (hasTftKey()) {
    const acc = await resolveTftAccount(gameName, tagLine, region);
    if (!acc.ok || !acc.data) {
      if (acc.status === 404) return NextResponse.json({ error: `No Riot account "${gameName}#${tagLine}" found.` }, { status: 400 });
      // 403/429/etc — still allow adding; the summary route surfaces the reason.
    } else {
      puuid = acc.data.puuid;
    }
  }

  const account: TftAccount = {
    id: `tft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    gameName, tagLine, region, puuid,
    addedAt: new Date().toISOString(),
  };
  accounts.push(account);
  write(accounts);
  return NextResponse.json({ ok: true, account, hasKey: hasTftKey() });
}

export function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  write(read().filter((a) => a.id !== id));
  return NextResponse.json({ ok: true });
}
