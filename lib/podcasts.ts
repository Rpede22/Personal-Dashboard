/**
 * Podcast tracker — shared types + pure helpers (client-safe, no `fs`).
 *
 * A podcast is just an RSS feed URL. The route fetches each feed, parses the
 * channel metadata + recent `<item>` episodes, and marks anything published
 * after the stored `lastSeenAt` timestamp as "new" — that's the whole
 * "a new episode dropped" story, no push, just something you glance at.
 *
 * File-based (config-dir `podcasts.json`) so it works for anyone with zero
 * keys — podcast RSS is fully public.
 */

export interface Podcast {
  id: string;
  title: string;        // channel title (auto-filled from the feed on add)
  feedUrl: string;
  imageUrl?: string;    // channel artwork, auto-filled
  addedAt: string;      // ISO
  /** Newest episode date the user has acknowledged. Episodes published after
   *  this count as "new". Seeded to `addedAt` so the back-catalogue isn't new. */
  lastSeenAt: string;   // ISO
}

export interface PodcastEpisode {
  title: string;
  published: string;    // ISO
  audioUrl?: string;    // enclosure href
  link?: string;        // episode web page
  durationSec?: number; // parsed from <itunes:duration>
}

/** A podcast enriched with its recently-parsed episodes + a new-episode count. */
export interface PodcastWithEpisodes extends Podcast {
  episodes: PodcastEpisode[];
  newCount: number;
}

/** Turn "1:02:33" / "45:10" / "3600" into seconds. Null when unparseable. */
export function parseItunesDuration(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return undefined;
}

/** "1h 02m" / "45m" / "" for a duration in seconds. */
export function formatDuration(sec: number | undefined): string {
  if (!sec || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec - h * 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

/** Relative "today" / "yesterday" / "3d ago" / "Mar 4" for an ISO date. */
export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "";
  const midNow = new Date(now); midNow.setHours(0, 0, 0, 0);
  const midThen = new Date(d); midThen.setHours(0, 0, 0, 0);
  const days = Math.round((midNow.getTime() - midThen.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Is `episodeIso` newer than the acknowledged `lastSeenAt`? */
export function isNewEpisode(episodeIso: string, lastSeenAt: string): boolean {
  const e = new Date(episodeIso).getTime();
  const seen = new Date(lastSeenAt).getTime();
  return isFinite(e) && isFinite(seen) && e > seen;
}
