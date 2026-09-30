import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";

/**
 * News source selection + the source catalogue. Server-only (uses fs) — the
 * settings panel reads the list via `GET /api/news/config`, it does NOT import
 * this module.
 *
 * TV2 has no clean RSS so it's scraped (in the route). DR / BBC / Guardian all
 * publish RSS, which is far simpler — a generic `fetchRss` covers them.
 */

export interface NewsArticle {
  url: string;
  section: string | null;
  headline: string;
  publishedAt: string; // ISO if resolved, YYYY-MM-DD otherwise
}

export type NewsSourceKind = "tv2" | "rss";
/** One RSS feed. `section` (optional) labels every article from this feed —
 *  used when the feed itself is section-specific but the items carry no
 *  `<category>` tag (DR's per-section feeds are the case that needs this). */
export interface NewsFeed { url: string; section?: string }
export interface NewsSource {
  id: string;
  label: string;
  kind: NewsSourceKind;
  /** RSS feeds (kind === "rss"). Multiple = merged. */
  feeds?: NewsFeed[];
  /** Homepage, for the hub footer link. */
  home: string;
}

const DR = "https://www.dr.dk/nyheder/service/feeds";

export const NEWS_SOURCES: NewsSource[] = [
  { id: "tv2", label: "TV2 (Danish)", kind: "tv2", home: "https://nyheder.tv2.dk/" },
  // DR's "all news" feed carries no <category>, so pull its per-section feeds and
  // label each — that restores the section chips the hub builds from `section`.
  { id: "dr", label: "DR (Danish)", kind: "rss", home: "https://www.dr.dk/nyheder", feeds: [
    { url: `${DR}/indland`, section: "Indland" },
    { url: `${DR}/udland`, section: "Udland" },
    { url: `${DR}/penge`, section: "Penge" },
    { url: `${DR}/kultur`, section: "Kultur" },
    { url: `${DR}/viden`, section: "Viden" },
  ] },
  { id: "bbc", label: "BBC News", kind: "rss", home: "https://www.bbc.com/news", feeds: [
    { url: "https://feeds.bbci.co.uk/news/rss.xml" },
    { url: "https://feeds.bbci.co.uk/news/world/rss.xml", section: "World" },
    { url: "https://feeds.bbci.co.uk/news/business/rss.xml", section: "Business" },
    { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", section: "Technology" },
  ] },
  { id: "guardian", label: "The Guardian", kind: "rss", home: "https://www.theguardian.com/international", feeds: [
    { url: "https://www.theguardian.com/international/rss" },
  ] },
];

export const DEFAULT_SOURCE = "tv2";

export function getSource(id: string): NewsSource {
  return NEWS_SOURCES.find((s) => s.id === id) ?? NEWS_SOURCES[0];
}

const CONFIG_PATH = configPath("news-config.json");

export function readNewsSource(): string {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as { source?: string };
    return NEWS_SOURCES.some((s) => s.id === parsed.source) ? parsed.source! : DEFAULT_SOURCE;
  } catch {
    return DEFAULT_SOURCE;
  }
}

export function writeNewsSource(source: string): void {
  const id = NEWS_SOURCES.some((s) => s.id === source) ? source : DEFAULT_SOURCE;
  writeFileSync(CONFIG_PATH, JSON.stringify({ source: id }, null, 2));
}

// ── Generic RSS fetcher ─────────────────────────────────────────────────────
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

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decodeEntities(m[1]) : null;
}

/** Fetch + parse one or more RSS feeds into NewsArticles, newest first. Each
 *  article's `section` is the feed's declared section, else its `<category>`. */
export async function fetchRss(feeds: NewsFeed[]): Promise<NewsArticle[]> {
  const perFeed = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 900 } });
        if (!res.ok) return [];
        const xml = await res.text();
        const items: NewsArticle[] = [];
        for (const m of xml.matchAll(/<item[\s\S]*?<\/item>/gi)) {
          const block = m[0];
          const headline = tag(block, "title");
          // <link> can be an element body or an atom <link href="…"/>.
          let url = tag(block, "link");
          if (!url) {
            const href = /<link[^>]*href="([^"]+)"/i.exec(block);
            url = href ? href[1] : null;
          }
          if (!headline || !url || headline.length < 8) continue;
          const pub = tag(block, "pubDate") ?? tag(block, "dc:date");
          const iso = pub && isFinite(new Date(pub).getTime()) ? new Date(pub).toISOString() : new Date().toISOString();
          const section = feed.section ?? tag(block, "category");
          items.push({ url: url.trim(), section: section || null, headline, publishedAt: iso });
        }
        return items;
      } catch {
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  const merged: NewsArticle[] = [];
  for (const a of perFeed.flat()) {
    if (seen.has(a.url)) continue;
    seen.add(a.url);
    merged.push(a);
  }
  merged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return merged;
}
