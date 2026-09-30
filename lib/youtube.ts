/**
 * YouTube uploads tracker — shared types + helpers (client-safe, no `fs`).
 *
 * Fully keyless: every channel exposes a public RSS feed at
 * `youtube.com/feeds/videos.xml?channel_id=UC…` (latest ~15 uploads), so
 * "who just uploaded" needs no API key — only the channel's UC id.
 *
 * Handle (@name) resolution is unreliable server-side (YouTube blocks bot
 * fetches), so we key on the UC id and extract it from whatever the user
 * pastes (a raw UC id, or any `/channel/UC…` URL). The feed itself supplies
 * the channel title + thumbnails.
 */

export interface YouTubeChannel {
  id: string;          // UC… channel id
  title: string;       // filled from the feed on add
  thumb?: string;      // latest video thumb, as a stand-in avatar
  addedAt: string;     // ISO
  lastSeenAt: string;  // newest video the user has acknowledged
}

export interface YouTubeVideo {
  videoId: string;
  title: string;
  published: string;   // ISO
  thumb?: string;
}

export interface YouTubeChannelWithVideos extends YouTubeChannel {
  videos: YouTubeVideo[];
  newCount: number;
}

/** Pull a UC channel id out of a raw id or any URL containing /channel/UC…. */
export function extractChannelId(input: string): string | null {
  const m = input.match(/UC[A-Za-z0-9_-]{22}/);
  return m ? m[0] : null;
}

/** Pull a handle (@name) out of `@name`, `youtube.com/@name`, or a bare name. */
export function extractHandle(input: string): string | null {
  const s = input.trim();
  const at = s.match(/@([A-Za-z0-9._-]{3,30})/);
  if (at) return at[1];
  if (/^[A-Za-z0-9._-]{3,30}$/.test(s)) return s; // bare handle-ish token
  return null;
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Resolve any input to a UC channel id: a raw id / `/channel/UC…` URL directly,
 * else a handle (`@name`) by fetching the channel page and reading its canonical
 * `externalId`. Keyless — the page loads fine with browser headers (YouTube only
 * blocks bare/no-header fetches). Server-side only (does a page fetch).
 */
export async function resolveChannelId(input: string): Promise<string | null> {
  const direct = extractChannelId(input);
  if (direct) return direct;
  const handle = extractHandle(input);
  if (!handle) return null;
  try {
    const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/) ??
      html.match(/rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Is `videoIso` newer than the acknowledged `lastSeenAt`? */
export function isNewVideo(videoIso: string, lastSeenAt: string): boolean {
  const v = new Date(videoIso).getTime();
  const seen = new Date(lastSeenAt).getTime();
  return isFinite(v) && isFinite(seen) && v > seen;
}
