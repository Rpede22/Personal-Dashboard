import { NextResponse } from "next/server";

/**
 * TV2 news feed — front-page scraper across two hosts:
 *   nyheder.tv2.dk  (general news · politik · samfund · udland · business · live · …)
 *   sport.tv2.dk    (football · håndbold · cykling · badminton · …)
 *
 * TV2 doesn't publish a public RSS/Atom feed, but both hosts link every
 * article with a URL of the form:
 *   https://<host>/[<section>[/<subsection>]]/YYYY-MM-DD-<kebab-slug>[-<uuid>]
 * and the anchor's inner text is the actual headline (often prefixed with
 * the section label). We extract every matching link, dedupe, and return
 * the newest N sorted by publish timestamp.
 *
 * ── Timestamps ─────────────────────────────────────────────────────────
 * The URL slug gives us the date but not the time. For the top N (default
 * 20) articles we fetch the article page in parallel and parse the
 * `datePublished` field from its JSON-LD block. That timestamp is cached
 * per URL indefinitely — TV2 doesn't rewrite it after publish. Front-page
 * hits are still cached 15 min in aggregate.
 */

interface Article {
  url: string;
  section: string | null;
  headline: string;
  publishedAt: string; // ISO if we resolved a time, YYYY-MM-DD otherwise
}

let cache: { articles: Article[]; ts: number } | null = null;
const TTL = 15 * 60 * 1000;

// Long-lived map: article URL → precise publish timestamp (ISO). Populated
// on demand from the article page's JSON-LD. Once set, never invalidated —
// TV2 doesn't backdate.
const publishTimeCache = new Map<string, string>();
const MAX_TIMESTAMP_FETCHES = 20;

const KNOWN_SECTIONS = new Set([
  // nyheder.tv2.dk
  "nyheder", "politik", "samfund", "udland", "business", "krimi",
  "live", "underholdning", "forbrug", "vejr", "sport", "tech",
  "sundhed", "klima", "danmark", "krigen-i-ukraine",
  "folketingsvalg", "trump-i-det-hvide-hus",
  // sport.tv2.dk — normalised to "Sport" via SPORT_HOST_LABEL
  "amerikansk-fodbold", "atletik", "badminton", "basketball", "boksning",
  "cykling", "fodbold", "formel-1", "golf", "haandbold", "haandball",
  "ishockey", "kampsport", "motorsport", "svoemning", "tennis", "esport",
  "os", "vm", "em",
]);

/**
 * URL pattern: allow one or two path segments before the date-prefixed
 * slug so `live/krimi/YYYY-MM-DD-…` articles surface (previously the
 * regex only matched a single segment).
 */
const ARTICLE_URL = /^https:\/\/(nyheder|sport)\.tv2\.dk\/(?:([a-z-]+(?:\/[a-z-]+)?)\/)?(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)$/;

const ANCHOR_RE = /<a[^>]+href="(https:\/\/(?:nyheder|sport)\.tv2\.dk\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

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

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Sport host normalises every article's section label to `Sport`. */
const SPORT_HOST_LABEL = "Sport";

/** Drop a leading section label from the anchor text. Multi-segment sections
 *  (e.g. `live/krimi`) match against just the last segment first, then the
 *  full path — TV2 usually prefixes with only the deepest name. Also strips
 *  the root `Nyheder` prefix on section-less articles. */
function trimSectionPrefix(text: string, sectionSlug: string | null, host: string): { section: string | null; headline: string } {
  if (host === "sport") {
    // Sport articles: section is always just "Sport" regardless of sub-section.
    const stripped = text.replace(/^\s*Sport\s+/i, "").trim();
    return { section: SPORT_HOST_LABEL, headline: stripped };
  }
  if (!sectionSlug) {
    return { section: null, headline: text.replace(/^\s*Nyheder\s+/i, "").trim() };
  }
  const parts = sectionSlug.split("/");
  const deepLabel = parts[parts.length - 1].replace(/-/g, " ");
  const fullLabel = sectionSlug.replace(/[-/]/g, " ");
  const deepRe = new RegExp(`^\\s*${deepLabel}\\s+`, "i");
  const fullRe = new RegExp(`^\\s*${fullLabel}\\s+`, "i");
  const cleaned = text.replace(fullRe, "").replace(deepRe, "").trim();
  // Live-blog articles (path starts with `live/`) get a dedicated "Live"
  // section label so they can be pinned to the top of the hub and widget
  // — the deepest segment ("krimi", "politik") would otherwise scatter
  // them across normal section groups.
  if (parts[0] === "live") {
    return { section: "Live", headline: cleaned };
  }
  // Use the deepest segment as the display label — reads better than
  // "Live krimi" would.
  return { section: capitalize(deepLabel), headline: cleaned };
}

/**
 * Parse `datePublished` from an article page's JSON-LD block. Returns null
 * on any failure — caller keeps the URL date as the fallback.
 */
async function fetchPublishTime(url: string): Promise<string | null> {
  if (publishTimeCache.has(url)) return publishTimeCache.get(url)!;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 24 * 60 * 60 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = /"datePublished"\s*:\s*"([^"]+)"/.exec(html);
    if (!m) return null;
    const iso = m[1];
    if (!isFinite(new Date(iso).getTime())) return null;
    publishTimeCache.set(url, iso);
    return iso;
  } catch {
    return null;
  }
}

async function scrapeHost(host: "nyheder" | "sport"): Promise<Article[]> {
  const res = await fetch(`https://${host}.tv2.dk/`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`TV2 ${host} front page ${res.status}`);
  const html = await res.text();

  const seen = new Set<string>();
  const out: Article[] = [];
  for (const match of html.matchAll(ANCHOR_RE)) {
    const [, url, inner] = match;
    if (seen.has(url)) continue;
    seen.add(url);
    const parsed = ARTICLE_URL.exec(url);
    if (!parsed) continue;
    const [, urlHost, section, date] = parsed;
    if (urlHost !== host) continue;
    // Section validation: for nyheder we require known sections (the root
    // is a no-section slug). Sport articles use categories we don't
    // whitelist — accept anything on sport.tv2.dk.
    if (host === "nyheder" && section) {
      const rootSection = section.split("/")[0];
      if (!KNOWN_SECTIONS.has(rootSection)) continue;
    }
    const rawText = decodeEntities(stripTags(inner));
    if (rawText.length < 10) continue;
    const { section: sectionLabel, headline } = trimSectionPrefix(rawText, section ?? null, host);
    if (headline.length < 10) continue;
    out.push({ url, section: sectionLabel, headline, publishedAt: date });
  }
  return out;
}

async function scrape(): Promise<Article[]> {
  // Pull both hosts in parallel; merge on URL (they don't collide).
  const [nyheder, sport] = await Promise.all([
    scrapeHost("nyheder").catch(() => [] as Article[]),
    scrapeHost("sport").catch(() => [] as Article[]),
  ]);
  const merged = [...nyheder, ...sport];

  // Sort by URL date first so we know which top-N to enrich with timestamps.
  merged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  // Enrich the top N with precise publish times, in parallel. Cheap when
  // the URL is already in `publishTimeCache`.
  const toEnrich = merged.slice(0, MAX_TIMESTAMP_FETCHES);
  const times = await Promise.all(toEnrich.map((a) => fetchPublishTime(a.url)));
  for (let i = 0; i < toEnrich.length; i++) {
    if (times[i]) toEnrich[i].publishedAt = times[i]!;
  }

  // Re-sort with ISO timestamps in the mix. String compare works because
  // ISO 8601 sorts lexicographically identical to chronological order.
  merged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return merged;
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
