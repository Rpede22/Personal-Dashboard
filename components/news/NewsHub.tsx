"use client";

import { useEffect, useMemo, useState } from "react";
import HubShell from "@/components/HubShell";

interface Article {
  url: string;
  section: string | null;
  headline: string;
  publishedAt: string; // YYYY-MM-DD
}

/**
 * Format a publish timestamp. Accepts either an ISO string (from the
 * article page's JSON-LD) or a YYYY-MM-DD date-only value (front-page
 * fallback). ISO gets minute-precision recency (`23 min ago`, `3 hr ago`,
 * `today 14:32`); date-only stays at day granularity.
 */
function timeAgo(value: string): string {
  const hasTime = value.length > 10; // ISO strings are longer than "YYYY-MM-DD"
  const then = hasTime ? new Date(value) : new Date(value + "T12:00:00");
  if (!isFinite(then.getTime())) return "";
  const diffMs = Date.now() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (hasTime) {
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    if (hours < 6) return `${hours} hr ago`;
    // Check calendar-day equality, not fractional day count — an article
    // published at 22:00 yesterday sits at `days=0` but reads better as
    // "yesterday 22:00" than "0d ago".
    const now = new Date();
    const nowMid = new Date(now); nowMid.setHours(0, 0, 0, 0);
    const thenMid = new Date(then); thenMid.setHours(0, 0, 0, 0);
    const calDayDiff = Math.round((nowMid.getTime() - thenMid.getTime()) / 86400000);
    if (calDayDiff === 0) return "today " + then.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (calDayDiff === 1) return "yesterday " + then.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (calDayDiff < 7)   return `${calDayDiff}d ago`;
    return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  // Date-only fallback.
  if (days < 0) return "just now";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type View = "flat" | "grouped";

/** Maximum articles per section in the grouped view. Keeps the front page
 *  overskueligt — 5 headlines per section is enough to spot what's new. */
const PER_SECTION_LIMIT = 5;

export default function NewsHub() {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  // Grouped-by-section is the default view — capped at 5 per section with
  // Live pinned at the top, so the hub reads at a glance instead of as one
  // long homogeneous stream.
  const [view, setView] = useState<View>("grouped");

  async function load() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/news?limit=50");
      const j = await res.json();
      setArticles(j.articles ?? []);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // TV2 publishes on the hour; every 15 min matches server cache
    const iv = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const sections = useMemo(() => {
    const s = new Set<string>();
    for (const a of articles ?? []) if (a.section) s.add(a.section);
    return ["all", ...[...s].sort()];
  }, [articles]);

  const filtered = useMemo(() => {
    if (!articles) return null;
    if (sectionFilter === "all") return articles;
    return articles.filter((a) => a.section === sectionFilter);
  }, [articles, sectionFilter]);

  // Group into section buckets when the "grouped" view is active. Live goes
  // first (unfolding events belong at the top); the rest keep the order they
  // appeared on TV2's own front page. Each section is capped at
  // PER_SECTION_LIMIT so the whole hub stays skimmable.
  const grouped = useMemo(() => {
    if (!filtered) return null;
    const map = new Map<string, Article[]>();
    for (const a of filtered) {
      const key = a.section ?? "General";
      if (!map.has(key)) map.set(key, []);
      const bucket = map.get(key)!;
      if (bucket.length < PER_SECTION_LIMIT) bucket.push(a);
    }
    const entries = [...map.entries()];
    entries.sort(([a], [b]) => {
      if (a === "Live" && b !== "Live") return -1;
      if (b === "Live" && a !== "Live") return 1;
      return 0;
    });
    return entries;
  }, [filtered]);

  return (
    <HubShell
      title="News"
      emoji="📰"
      color="var(--accent-orange)"
      tabs={
        <div className="flex flex-wrap gap-2 items-center">
          {sections.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSectionFilter(s);
                // Filtering to All snaps back to the grouped overview; a
                // specific section always uses flat so the reader can drill.
                setView(s === "all" ? "grouped" : "flat");
              }}
              className="px-3 py-1 rounded-lg text-xs font-medium"
              style={{
                background: sectionFilter === s ? "var(--accent-orange)22" : "var(--surface)",
                color: sectionFilter === s ? "var(--accent-orange)" : "var(--text-muted)",
                border: `1px solid ${sectionFilter === s ? "var(--accent-orange)" : "var(--border)"}`,
              }}
            >{s === "all" ? "All" : s}</button>
          ))}
          <div className="ml-auto flex gap-1">
            {(["flat", "grouped"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="text-xs px-2 py-1 rounded-md"
                style={{
                  background: view === v ? "var(--accent-orange)22" : "var(--surface)",
                  color: view === v ? "var(--accent-orange)" : "var(--text-muted)",
                  border: `1px solid ${view === v ? "var(--accent-orange)" : "var(--border)"}`,
                }}
              >{v === "flat" ? "Flat" : "Grouped"}</button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="text-xs px-2 py-1 rounded-md"
            style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            {refreshing ? "↻…" : "↻ Refresh"}
          </button>
        </div>
      }
    >
      {articles === null ? (
        <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>Loading TV2 headlines…</div>
      ) : filtered && filtered.length === 0 ? (
        <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>
          Nothing here yet — TV2 may have blocked the scrape or the section is empty.
        </div>
      ) : view === "flat" ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <ul>
            {(filtered ?? []).map((a) => <ArticleRow key={a.url} article={a} />)}
          </ul>
        </div>
      ) : (
        // Grouped view: section header cards, each with its own capped list.
        // Live gets a red accent + 🔴 so it stands out; the rest use the
        // normal orange section colour.
        <div className="space-y-4">
          {(grouped ?? []).map(([section, items]) => {
            const isLive = section === "Live";
            const accent = isLive ? "var(--accent-red)" : "var(--accent-orange)";
            const totalInSection = (articles ?? []).filter((a) => (a.section ?? "General") === section).length;
            const truncated = totalInSection > items.length;
            return (
              <div key={section} className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: `1px solid ${isLive ? accent + "66" : "var(--border)"}` }}>
                <div className="px-4 py-2 flex items-baseline gap-3" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                  <span className="text-xs uppercase tracking-wide font-semibold flex items-center gap-1" style={{ color: accent }}>
                    {isLive && <span>🔴</span>}
                    {section}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {items.length} of {totalInSection}
                  </span>
                  {truncated && sectionFilter === "all" && (
                    <button
                      onClick={() => {
                        // Drill into that section + flip to the flat list so
                        // the user gets the full stream, not another
                        // 5-headline group.
                        setSectionFilter(section);
                        setView("flat");
                      }}
                      className="text-xs ml-auto"
                      style={{ color: accent }}
                    >
                      See all →
                    </button>
                  )}
                </div>
                <ul>
                  {items.map((a) => <ArticleRow key={a.url} article={a} hideSection />)}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs mt-3 text-center" style={{ color: "var(--text-muted)" }}>
        Headlines scraped from{" "}
        <a href="https://nyheder.tv2.dk/" target="_blank" rel="noopener noreferrer" className="underline">nyheder.tv2.dk</a>{" "}+ {" "}
        <a href="https://sport.tv2.dk/" target="_blank" rel="noopener noreferrer" className="underline">sport.tv2.dk</a>{" "}· Refreshes every 15 min.
      </p>
    </HubShell>
  );
}

function ArticleRow({ article, hideSection = false }: { article: Article; hideSection?: boolean }) {
  return (
    <li className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-baseline gap-3">
          {!hideSection && article.section && (
            <span
              className="text-[10px] uppercase tracking-wide font-semibold shrink-0"
              style={{ color: "var(--accent-orange)" }}
            >
              {article.section}
            </span>
          )}
          <span className="flex-1 text-sm font-medium">{article.headline}</span>
          <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{timeAgo(article.publishedAt)}</span>
        </div>
      </a>
    </li>
  );
}
