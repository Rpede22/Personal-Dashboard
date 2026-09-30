import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import { TwitchChannel, TwitchLive, extractLogin, fetchOne, fetchLiveStatuses } from "@/lib/twitch";

/**
 * Twitch "who's live" tracker — file-based (no DB), keyless (public GQL).
 *   GET    /api/twitch            → { channels: (meta + live)[], liveCount }
 *   POST   /api/twitch            → add { input } (login or twitch.tv/NAME)
 *   DELETE /api/twitch?login=X    → unfollow
 */

const FILE = configPath("twitch-channels.json");
const MAX_CHANNELS = 40;

function read(): TwitchChannel[] {
  try {
    const p = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(p?.channels) ? (p.channels as TwitchChannel[]) : [];
  } catch { return []; }
}
function write(channels: TwitchChannel[]): void {
  writeFileSync(FILE, JSON.stringify({ channels }, null, 2));
}

export async function GET() {
  const channels = read();
  const statuses = await fetchLiveStatuses(channels.map((c) => c.login));
  const enriched: (TwitchChannel & Partial<TwitchLive>)[] = channels.map((c) => {
    const s = statuses[c.login];
    return s ? { ...c, ...s } : { ...c, live: false };
  });
  // Live first, then by viewers desc; offline keep insertion order after.
  enriched.sort((a, b) => Number(!!b.live) - Number(!!a.live) || (b.viewers ?? 0) - (a.viewers ?? 0));
  const liveCount = enriched.filter((c) => c.live).length;
  return NextResponse.json({ channels: enriched, liveCount });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const login = extractLogin(String(body.input ?? ""));
  if (!login) return NextResponse.json({ error: "Enter a Twitch channel name or twitch.tv/name URL." }, { status: 400 });

  const channels = read();
  if (channels.length >= MAX_CHANNELS) return NextResponse.json({ error: `Max ${MAX_CHANNELS} channels.` }, { status: 400 });
  if (channels.some((c) => c.login === login)) return NextResponse.json({ error: "That channel is already followed." }, { status: 400 });

  const info = await fetchOne(login);
  if (!info) return NextResponse.json({ error: `Couldn't find the Twitch channel "${login}".` }, { status: 400 });

  const channel: TwitchChannel = { login, displayName: info.displayName, addedAt: new Date().toISOString() };
  channels.push(channel);
  write(channels);
  return NextResponse.json({ ok: true, channel });
}

export function DELETE(request: Request) {
  const login = new URL(request.url).searchParams.get("login");
  write(read().filter((c) => c.login !== login));
  return NextResponse.json({ ok: true });
}
