import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import {
  Podcast,
  PodcastEpisode,
  PodcastWithEpisodes,
  parseItunesDuration,
  isNewEpisode,
} from "@/lib/podcasts";

/**
 * Podcast tracker — file-based (no DB), keyless. Podcast RSS is public.
 *   GET    /api/podcasts          → podcasts + recent episodes + new-episode counts
 *   POST   /api/podcasts          → add { feedUrl } (title/artwork auto-filled from the feed)
 *   PATCH  /api/podcasts          → { id, action:"markSeen" } (clears the new badge)
 *   DELETE /api/podcasts?id=X     → remove a podcast
 */

const FILE = configPath("podcasts.json");
const MAX_PODCASTS = 30;
const EPISODES_PER_FEED = 15;

function readPodcasts(): Podcast[] {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(parsed?.podcasts) ? (parsed.podcasts as Podcast[]) : [];
  } catch {
    return [];
  }
}

function writePodcasts(podcasts: Podcast[]): void {
  writeFileSync(FILE, JSON.stringify({ podcasts }, null, 2));
}

// ── minimal RSS parsing (same shape as lib/news-config fetchRss) ─────────────
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagText(block: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decodeEntities(m[1]) : null;
}

function attr(block: string, tag: string, name: string): string | null {
  const m = new RegExp(`<${tag}[^>]*\\b${name}="([^"]+)"`, "i").exec(block);
  return m ? m[1] : null;
}

interface ParsedFeed {
  title: string;
  imageUrl?: string;
  episodes: PodcastEpisode[];
}

async function fetchFeed(feedUrl: string): Promise<ParsedFeed | null> {
  let res: Response;
  try {
    res = await fetch(feedUrl, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 900 } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const xml = await res.text();

  // Channel block = everything before the first <item>, so item-level tags
  // (title/image) don't get mistaken for channel metadata.
  const firstItem = xml.search(/<item[\s>]/i);
  const channelBlock = firstItem >= 0 ? xml.slice(0, firstItem) : xml;
  const title = tagText(channelBlock, "title") || feedUrl;
  const imageUrl =
    attr(channelBlock, "itunes:image", "href") ||
    tagText(channelBlock, "url") || // <image><url>…</url></image>
    undefined;

  const episodes: PodcastEpisode[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const t = tagText(block, "title");
    if (!t) continue;
    const pub = tagText(block, "pubDate") ?? tagText(block, "dc:date");
    const iso = pub && isFinite(new Date(pub).getTime()) ? new Date(pub).toISOString() : null;
    if (!iso) continue;
    const audioUrl = attr(block, "enclosure", "url") ?? undefined;
    let link = tagText(block, "link") ?? undefined;
    if (link && !/^https?:/i.test(link)) link = undefined;
    const durationSec = parseItunesDuration(tagText(block, "itunes:duration"));
    episodes.push({ title: t, published: iso, audioUrl, link, durationSec });
    if (episodes.length >= EPISODES_PER_FEED) break;
  }
  episodes.sort((a, b) => b.published.localeCompare(a.published));
  return { title, imageUrl, episodes };
}

export async function GET() {
  const podcasts = readPodcasts();
  const enriched: PodcastWithEpisodes[] = await Promise.all(
    podcasts.map(async (p) => {
      const feed = await fetchFeed(p.feedUrl);
      const episodes = feed?.episodes ?? [];
      const newCount = episodes.filter((e) => isNewEpisode(e.published, p.lastSeenAt)).length;
      return { ...p, episodes, newCount };
    }),
  );
  const totalNew = enriched.reduce((sum, p) => sum + p.newCount, 0);
  return NextResponse.json({ podcasts: enriched, totalNew });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const feedUrl = String(body.feedUrl ?? "").trim();
  if (!/^https?:\/\//i.test(feedUrl)) {
    return NextResponse.json({ error: "A valid http(s) feed URL is required." }, { status: 400 });
  }
  const podcasts = readPodcasts();
  if (podcasts.length >= MAX_PODCASTS) {
    return NextResponse.json({ error: `Max ${MAX_PODCASTS} podcasts.` }, { status: 400 });
  }
  if (podcasts.some((p) => p.feedUrl === feedUrl)) {
    return NextResponse.json({ error: "That feed is already followed." }, { status: 400 });
  }
  const feed = await fetchFeed(feedUrl);
  if (!feed) {
    return NextResponse.json({ error: "Couldn't read that feed — check the URL points to a podcast RSS." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const entry: Podcast = {
    id: `pod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: feed.title,
    feedUrl,
    imageUrl: feed.imageUrl,
    addedAt: now,
    // Seed lastSeenAt to the newest existing episode so the back-catalogue
    // isn't flagged new — only episodes that drop from now on light up.
    lastSeenAt: feed.episodes[0]?.published ?? now,
  };
  podcasts.push(entry);
  writePodcasts(podcasts);
  return NextResponse.json({ ok: true, podcast: entry });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const podcasts = readPodcasts();
  const idx = podcasts.findIndex((p) => p.id === id);
  if (idx < 0) return NextResponse.json({ error: "Unknown podcast." }, { status: 404 });
  if (body.action === "markSeen") {
    podcasts[idx].lastSeenAt = new Date().toISOString();
  }
  writePodcasts(podcasts);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const podcasts = readPodcasts().filter((p) => p.id !== id);
  writePodcasts(podcasts);
  return NextResponse.json({ ok: true });
}
