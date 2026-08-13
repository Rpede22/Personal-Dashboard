"use client";

import { useEffect, useMemo, useState } from "react";
import HubShell from "@/components/HubShell";

interface Article {
  url: string;
  section: string | null;
  headline: string;
  publishedAt: string; // YYYY-MM-DD
}

/** Human "N min/hr/days ago" from a YYYY-MM-DD date-only value. Anything
 *  older than a week falls back to a fixed date so the widget doesn't say
 *  "8 days ago" — that reads worse than "12 Aug". */
function timeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr + "T12:00:00");
  const diffMs = now.getTime() - then.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 0) return "just now";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NewsHub() {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

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
              onClick={() => setSectionFilter(s)}
              className="px-3 py-1 rounded-lg text-xs font-medium"
              style={{
                background: sectionFilter === s ? "var(--accent-orange)22" : "var(--surface)",
                color: sectionFilter === s ? "var(--accent-orange)" : "var(--text-muted)",
                border: `1px solid ${sectionFilter === s ? "var(--accent-orange)" : "var(--border)"}`,
              }}
            >{s === "all" ? "All" : s}</button>
          ))}
          <button
            onClick={load}
            disabled={refreshing}
            className="ml-auto text-xs px-2 py-1 rounded-md"
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
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <ul>
            {(filtered ?? []).map((a) => (
              <li key={a.url} className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-baseline gap-3">
                    {a.section && (
                      <span
                        className="text-[10px] uppercase tracking-wide font-semibold shrink-0"
                        style={{ color: "var(--accent-orange)" }}
                      >
                        {a.section}
                      </span>
                    )}
                    <span className="flex-1 text-sm font-medium">{a.headline}</span>
                    <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{timeAgo(a.publishedAt)}</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs mt-3 text-center" style={{ color: "var(--text-muted)" }}>
        Headlines scraped from <a href="https://nyheder.tv2.dk/" target="_blank" rel="noopener noreferrer" className="underline">nyheder.tv2.dk</a> · Refreshes every 15 min.
      </p>
    </HubShell>
  );
}
