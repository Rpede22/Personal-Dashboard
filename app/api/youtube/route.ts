import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import {
  YouTubeChannel, YouTubeVideo, YouTubeChannelWithVideos,
  resolveChannelId, isNewVideo,
} from "@/lib/youtube";

/**
 * YouTube uploads tracker — file-based (no DB), keyless (channel RSS).
 *   GET    /api/youtube            → channels + recent videos + new-upload counts
 *   POST   /api/youtube            → add { input } (UC id or /channel/UC… URL)
 *   PATCH  /api/youtube            → { id, action:"markSeen" }
 *   DELETE /api/youtube?id=UC…     → remove a channel
 */

const FILE = configPath("youtube-channels.json");
const MAX_CHANNELS = 40;
const VIDEOS_PER_FEED = 12;

function read(): YouTubeChannel[] {
  try {
    const p = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(p?.channels) ? (p.channels as YouTubeChannel[]) : [];
  } catch { return []; }
}
function write(channels: YouTubeChannel[]): void {
  writeFileSync(FILE, JSON.stringify({ channels }, null, 2));
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x27;|&#39;/gi, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}

interface Feed { title: string; thumb?: string; videos: YouTubeVideo[] }

async function fetchFeed(channelId: string): Promise<Feed | null> {
  let xml: string;
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
      headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    xml = await res.text();
  } catch { return null; }

  const firstEntry = xml.search(/<entry>/i);
  const channelBlock = firstEntry >= 0 ? xml.slice(0, firstEntry) : xml;
  const title = decode((channelBlock.match(/<title>([\s\S]*?)<\/title>/i) ?? [])[1] ?? channelId);

  const videos: YouTubeVideo[] = [];
  for (const m of xml.matchAll(/<entry>[\s\S]*?<\/entry>/gi)) {
    const block = m[0];
    const videoId = (block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i) ?? [])[1];
    const vtitle = (block.match(/<title>([\s\S]*?)<\/title>/i) ?? [])[1];
    const published = (block.match(/<published>([^<]+)<\/published>/i) ?? [])[1];
    const thumb = (block.match(/<media:thumbnail\s+url="([^"]+)"/i) ?? [])[1];
    if (!videoId || !vtitle || !published) continue;
    videos.push({ videoId, title: decode(vtitle), published: new Date(published).toISOString(), thumb });
    if (videos.length >= VIDEOS_PER_FEED) break;
  }
  videos.sort((a, b) => b.published.localeCompare(a.published));
  return { title, thumb: videos[0]?.thumb, videos };
}

export async function GET() {
  const channels = read();
  const enriched: YouTubeChannelWithVideos[] = await Promise.all(
    channels.map(async (c) => {
      const feed = await fetchFeed(c.id);
      const videos = feed?.videos ?? [];
      const newCount = videos.filter((v) => isNewVideo(v.published, c.lastSeenAt)).length;
      return { ...c, thumb: feed?.thumb ?? c.thumb, videos, newCount };
    }),
  );
  const totalNew = enriched.reduce((s, c) => s + c.newCount, 0);
  return NextResponse.json({ channels: enriched, totalNew });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = String(body.input ?? "").trim();
  const id = await resolveChannelId(input);
  if (!id) {
    return NextResponse.json({ error: "Couldn't resolve that — use a @handle, a channel URL, or the UC… channel id." }, { status: 400 });
  }
  const channels = read();
  if (channels.length >= MAX_CHANNELS) return NextResponse.json({ error: `Max ${MAX_CHANNELS} channels.` }, { status: 400 });
  if (channels.some((c) => c.id === id)) return NextResponse.json({ error: "That channel is already followed." }, { status: 400 });

  const feed = await fetchFeed(id);
  if (!feed) return NextResponse.json({ error: "Couldn't read that channel's feed — check the ID." }, { status: 400 });

  const now = new Date().toISOString();
  const channel: YouTubeChannel = {
    id, title: feed.title, thumb: feed.thumb, addedAt: now,
    lastSeenAt: feed.videos[0]?.published ?? now, // don't flag the back-catalogue
  };
  channels.push(channel);
  write(channels);
  return NextResponse.json({ ok: true, channel });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const channels = read();
  const idx = channels.findIndex((c) => c.id === id);
  if (idx < 0) return NextResponse.json({ error: "Unknown channel." }, { status: 404 });
  if (body.action === "markSeen") channels[idx].lastSeenAt = new Date().toISOString();
  write(channels);
  return NextResponse.json({ ok: true });
}

export function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  write(read().filter((c) => c.id !== id));
  return NextResponse.json({ ok: true });
}
