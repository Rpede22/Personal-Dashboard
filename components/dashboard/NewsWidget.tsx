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

function timeAgo(dateStr: string): string {
  const then = new Date(dateStr + "T12:00:00");
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NewsWidget() {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const refreshMs = useRefreshMs("news", 15);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/news?limit=5");
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
          {articles.map((a) => (
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
                    <span className="text-[10px] uppercase tracking-wide font-semibold shrink-0" style={{ color: "var(--accent-orange)" }}>
                      {a.section}
                    </span>
                  )}
                  <span className="flex-1 line-clamp-2">{a.headline}</span>
                  <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{timeAgo(a.publishedAt)}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
