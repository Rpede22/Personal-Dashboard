"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";
import { useRefreshMs } from "@/lib/useRefreshMs";

interface Article {
  url: string;
  section: string | null;
  headline: string;
  publishedAt: string;
}

function timeAgo(value: string): string {
  // Accept either an ISO timestamp (top-N articles get one from the API)
  // or a YYYY-MM-DD date-only fallback. Short-form recency for the widget:
  // `12m` / `3h` / `today` / `yesterday` / `Nd` / short date.
  const hasTime = value.length > 10;
  const then = hasTime ? new Date(value) : new Date(value + "T12:00:00");
  if (!isFinite(then.getTime())) return "";
  const diffMs = Date.now() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  if (hasTime) {
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    if (hours < 6) return `${hours}h`;
  }
  const now = new Date();
  const nowMid = new Date(now); nowMid.setHours(0, 0, 0, 0);
  const thenMid = new Date(then); thenMid.setHours(0, 0, 0, 0);
  const calDayDiff = Math.round((nowMid.getTime() - thenMid.getTime()) / 86400000);
  if (calDayDiff <= 0) return "today";
  if (calDayDiff === 1) return "yesterday";
  if (calDayDiff < 7) return `${calDayDiff}d ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NewsWidget() {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const refreshMs = useRefreshMs("news", 15);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/news?limit=10");
        const j = await res.json();
        if (!cancelled) setArticles(j.articles ?? []);
      } catch {
        if (!cancelled) setArticles([]);
      }
    }
    load();
    if (refreshMs === 0) return;
    const iv = setInterval(load, refreshMs);
    return () => { cancelled = true; clearInterval(iv); };
  }, [refreshMs]);

  return (
    <Card accentColor="var(--accent-orange)">
      <CardHeader icon="📰" title="News" subtitle="TV2 headlines" accentColor="var(--accent-orange)" />
      {articles === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : articles.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No headlines available right now.</p>
      ) : (
        <ul className="space-y-2">
          {articles.map((a) => {
            const isLive = a.section === "Live";
            const sectionColor = isLive ? "var(--accent-red)" : "var(--accent-orange)";
            return (
              <li key={a.url} className="text-sm">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="block hover:opacity-80"
                >
                  <div className="flex items-baseline gap-2">
                    {a.section && (
                      <span className="text-[10px] uppercase tracking-wide font-semibold shrink-0 flex items-center gap-1" style={{ color: sectionColor }}>
                        {isLive && <span>🔴</span>}
                        {a.section}
                      </span>
                    )}
                    <span className="flex-1 line-clamp-2">{a.headline}</span>
                    <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{timeAgo(a.publishedAt)}</span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
