"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";
import { SkeletonList } from "@/components/Skeleton";
import { useRefreshMs } from "@/lib/useRefreshMs";
import { formatDkk } from "@/lib/payday";
import { useCurrency } from "@/lib/dashboard-settings";
import { daysUntil, type Subscription } from "@/lib/subscriptions";

const ACCENT = "var(--accent-cyan)";

interface ApiPayload { subscriptions: Subscription[]; monthlyTotal: number; next: Subscription | null }

function whenLabel(dateStr: string): string {
  const d = daysUntil(dateStr);
  if (isNaN(d)) return dateStr;
  if (d <= 0) return "due";
  if (d === 1) return "tomorrow";
  if (d <= 7) return `in ${d}d`;
  return dateStr.slice(5); // MM-DD
}

export default function SubscriptionsWidget() {
  useCurrency(); // re-render money on currency change
  const [data, setData] = useState<ApiPayload | null>(null);
  const refreshMs = useRefreshMs("subscriptions", 60);

  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/subscriptions").then((r) => r.json()).then((d) => { if (alive) setData(d); }).catch(() => {});
    load();
    if (refreshMs === 0) return () => { alive = false; };
    const iv = setInterval(load, refreshMs);
    return () => { alive = false; clearInterval(iv); };
  }, [refreshMs]);

  const subs = data?.subscriptions ?? [];
  const upcoming = subs.slice(0, 4);

  return (
    <Card accentColor={ACCENT}>
      <CardHeader icon="💳" title="Subscriptions" accentColor={ACCENT} />
      {data === null ? (
        <SkeletonList rows={3} />
      ) : subs.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No subscriptions tracked — open to add your recurring spend.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-bold" style={{ color: ACCENT }}>{formatDkk(data.monthlyTotal)}</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>/ month · {subs.length} active</span>
          </div>
          <ul className="space-y-1.5">
            {upcoming.map((s) => {
              const soon = (() => { const d = daysUntil(s.nextCharge); return !isNaN(d) && d <= 7; })();
              return (
                <li key={s.id} className="flex items-baseline gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text)" }}>{s.name}</span>
                  <span className="shrink-0" style={{ color: "var(--text-muted)" }}>{formatDkk(s.amount)}</span>
                  <span className="shrink-0 text-xs w-16 text-right" style={{ color: soon ? "var(--accent-orange)" : "var(--text-muted)" }}>{whenLabel(s.nextCharge)}</span>
                </li>
              );
            })}
          </ul>
          {subs.length > upcoming.length && (
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>+{subs.length - upcoming.length} more</p>
          )}
        </>
      )}
    </Card>
  );
}
