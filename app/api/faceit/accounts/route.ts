import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { FaceitAccount, hasFaceitKey, fetchPlayerByNickname } from "@/lib/faceit";

/**
 * FACEIT (CS2) account list — file-based (no DB). Accounts are just nicknames;
 * the summary route does the live lookups.
 *   GET    /api/faceit/accounts        → { accounts, hasKey }
 *   POST   /api/faceit/accounts        → add { nickname } (validated against FACEIT when a key is set)
 *   DELETE /api/faceit/accounts?id=X   → remove one
 */

const FILE = configPath("faceit-accounts.json");
const MAX_ACCOUNTS = 10;

function read(): FaceitAccount[] {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(parsed?.accounts) ? (parsed.accounts as FaceitAccount[]) : [];
  } catch {
    return [];
  }
}

function write(accounts: FaceitAccount[]): void {
  writeFileSync(FILE, JSON.stringify({ accounts }, null, 2));
}

export function GET() {
  return NextResponse.json({ accounts: read(), hasKey: hasFaceitKey() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const nickname = String(body.nickname ?? "").trim();
  if (!nickname) return NextResponse.json({ error: "A FACEIT nickname is required." }, { status: 400 });

  const accounts = read();
  if (accounts.length >= MAX_ACCOUNTS) return NextResponse.json({ error: `Max ${MAX_ACCOUNTS} accounts.` }, { status: 400 });
  if (accounts.some((a) => a.nickname.toLowerCase() === nickname.toLowerCase())) {
    return NextResponse.json({ error: "That account is already added." }, { status: 400 });
  }

  // Validate + capture player_id when a key is configured (typo-proofing).
  let playerId: string | undefined;
  if (hasFaceitKey()) {
    const player = await fetchPlayerByNickname(nickname);
    if (!player) {
      return NextResponse.json({ error: `No FACEIT player named "${nickname}" was found.` }, { status: 400 });
    }
    playerId = player.player_id;
  }

  const account: FaceitAccount = {
    id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    nickname,
    playerId,
    addedAt: new Date().toISOString(),
  };
  accounts.push(account);
  write(accounts);
  return NextResponse.json({ ok: true, account, hasKey: hasFaceitKey() });
}

export function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  write(read().filter((a) => a.id !== id));
  return NextResponse.json({ ok: true });
}
