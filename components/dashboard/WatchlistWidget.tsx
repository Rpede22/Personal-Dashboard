"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";
import { SkeletonList } from "@/components/Skeleton";
import { useRefreshMs } from "@/lib/useRefreshMs";
import { formatPrice, formatPct, sparkPath, type WatchQuote } from "@/lib/watchlist";

const ACCENT = "var(--accent-indigo)";

function MiniSpark({ values, up }: { values: number[]; up: boolean }) {
  const w = 56, h = 20;
  const pts = sparkPath(values, w, h);
  if (!pts) return <div style={{ width: w, height: h }} />;
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={pts} fill="none" stroke={up ? "var(--accent-green)" : "var(--accent-red)"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function WatchlistWidget() {
  const [items, setItems] = useState<WatchQuote[] | null>(null);
  const refreshMs = useRefreshMs("watchlist", 5);

  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/watchlist").then((r) => r.json()).then((d) => { if (alive) setItems(d.items ?? []); }).catch(() => {});
    load();
    if (refreshMs === 0) return () => { alive = false; };
    const iv = setInterval(load, refreshMs);
    return () => { alive = false; clearInterval(iv); };
  }, [refreshMs]);

  const shown = (items ?? []).slice(0, 5);

  return (
    <Card accentColor={ACCENT}>
      <CardHeader icon="📈" title="Watchlist" accentColor={ACCENT} />
      {items === null ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No tickers tracked — open to add stocks or crypto.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((q) => {
            const up = (q.changePct ?? 0) >= 0;
            const chgColor = q.changePct === null ? "var(--text-muted)" : up ? "var(--accent-green)" : "var(--accent-red)";
            return (
              <li key={q.symbol} className="flex items-center gap-2">
                <span className="text-sm font-semibold w-20 shrink-0 truncate" style={{ color: "var(--text)" }}>{q.symbol}</span>
                <MiniSpark values={q.spark} up={up} />
                <span className="text-sm tabular-nums ml-auto shrink-0" style={{ color: "var(--text)" }}>{formatPrice(q.price, q.currency)}</span>
                <span className="text-xs tabular-nums w-16 text-right shrink-0" style={{ color: chgColor }}>{q.changePct === null ? "—" : formatPct(q.changePct)}</span>
              </li>
            );
          })}
          {items.length > shown.length && <li className="text-xs" style={{ color: "var(--text-muted)" }}>+{items.length - shown.length} more</li>}
        </ul>
      )}
    </Card>
  );
}
