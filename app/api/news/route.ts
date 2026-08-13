import { NextResponse } from "next/server";

/**
 * TV2 news feed — front-page scraper.
 *
 * TV2 doesn't publish a public RSS/Atom feed, but the front page HTML at
 * `https://nyheder.tv2.dk/` links every article with a URL of the form
 *   https://nyheder.tv2.dk/[<section>/]YYYY-MM-DD-<kebab-slug>[-<uuid>]
 * and the anchor's inner text is the actual headline (often prefixed with
 * the section label). This route pulls that page, extracts every article
 * link, and returns the newest N sorted by date.
 *
 * 15 min cache — matches TV2's typical publish cadence without hammering
 * their edge (they've locked down bot access, so we go easy).
 */

interface Article {
  url: string;
  section: string | null;
  headline: string;
  publishedAt: string; // YYYY-MM-DD from the URL slug
}

let cache: { articles: Article[]; ts: number } | null = null;
const TTL = 15 * 60 * 1000;

const KNOWN_SECTIONS = new Set([
  "nyheder", "politik", "samfund", "udland", "business", "krimi",
  "live", "underholdning", "forbrug", "vejr", "sport", "tech",
  "sundhed", "klima", "danmark", "krigen-i-ukraine",
  "folketingsvalg", "trump-i-det-hvide-hus",
]);

// URL matches article pages only: date-prefixed slugs (optionally under a
// section). Rejects section landings like `/business` or `/krigen-i-ukraine`
// which lack the date fragment.
const ARTICLE_URL = /^https:\/\/nyheder\.tv2\.dk\/(?:([a-z-]+)\/)?(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)$/;

const ANCHOR_RE = /<a[^>]+href="(https:\/\/nyheder\.tv2\.dk\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Decode the handful of HTML entities TV2 uses in anchor text. Full
 *  entity table isn't needed — the page is Danish text, no math or nordic
 *  runes to worry about. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/** Drop a leading section label (e.g. `Udland Sverige sænker…` →
 *  `Sverige sænker…`) so the headline reads clean in the widget. Also
 *  strips the "Nyheder " prefix on section-less articles — TV2 uses that
 *  as the site's own root label. */
function trimSectionPrefix(text: string, sectionSlug: string | null): { section: string | null; headline: string } {
  if (!sectionSlug) {
    return { section: null, headline: text.replace(/^\s*Nyheder\s+/i, "").trim() };
  }
  const sectionLabel = sectionSlug.replace(/-/g, " ");
  const re = new RegExp(`^\\s*${sectionLabel}\\s+`, "i");
  return { section: capitalize(sectionLabel), headline: text.replace(re, "").trim() };
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

async function scrape(): Promise<Article[]> {
  const res = await fetch("https://nyheder.tv2.dk/", {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`TV2 front page ${res.status}`);
  const html = await res.text();

  const seen = new Set<string>();
  const out: Article[] = [];
  for (const match of html.matchAll(ANCHOR_RE)) {
    const [, url, inner] = match;
    if (seen.has(url)) continue;
    seen.add(url);
    const parsed = ARTICLE_URL.exec(url);
    if (!parsed) continue;
    const [, section, date] = parsed;
    if (section && !KNOWN_SECTIONS.has(section)) continue;
    const rawText = decodeEntities(stripTags(inner));
    if (rawText.length < 10) continue;
    const { section: sectionLabel, headline } = trimSectionPrefix(rawText, section ?? null);
    if (headline.length < 10) continue;
    out.push({ url, section: sectionLabel, headline, publishedAt: date });
  }

  // Newest date first; anchor extraction order breaks ties which roughly
  // matches TV2's own placement (top of the page is most prominent).
  out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 100);

  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json({ articles: cache.articles.slice(0, limit) });
  }
  try {
    const articles = await scrape();
    cache = { articles, ts: Date.now() };
    return NextResponse.json({ articles: articles.slice(0, limit) });
  } catch (err) {
    return NextResponse.json({ error: String(err), articles: [] }, { status: 500 });
  }
}
