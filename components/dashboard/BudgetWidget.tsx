"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";
import { SkeletonList } from "@/components/Skeleton";
import { useRefreshMs } from "@/lib/useRefreshMs";
import { formatDkk } from "@/lib/payday";
import { useCurrency } from "@/lib/dashboard-settings";
import {
  budgetForPeriod, categoryTotalsForPeriod, totalPlannedForPeriod, colorFor, type BudgetConfig,
} from "@/lib/budget";

const ACCENT = "var(--accent-green)";

export default function BudgetWidget() {
  useCurrency(); // re-render money on currency change
  const [cfg, setCfg] = useState<BudgetConfig | null>(null);
  const refreshMs = useRefreshMs("budget", 30);

  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/budget").then((r) => r.json()).then((d) => { if (alive) setCfg(d); }).catch(() => {});
    load();
    if (refreshMs === 0) return () => { alive = false; };
    const iv = setInterval(load, refreshMs);
    return () => { alive = false; clearInterval(iv); };
  }, [refreshMs]);

  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const budget = cfg ? budgetForPeriod(cfg, year, month) : 0;
  const allocated = cfg ? totalPlannedForPeriod(cfg, year, month) : 0;
  const remaining = budget - allocated;
  const totals = cfg ? categoryTotalsForPeriod(cfg, year, month) : [];
  const pct = budget > 0 ? Math.min(100, (allocated / budget) * 100) : 0;
  const configured = budget > 0 || allocated > 0;

  return (
    <Card accentColor={ACCENT}>
      <CardHeader icon="📊" title="Budget" accentColor={ACCENT} />
      {cfg === null ? (
        <SkeletonList rows={3} />
      ) : !configured ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No budget set — open to plan this month.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-bold" style={{ color: remaining < 0 ? "var(--accent-red)" : ACCENT }}>{formatDkk(remaining)}</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{remaining < 0 ? "over budget" : "left this month"}</span>
          </div>
          <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{formatDkk(allocated)} of {formatDkk(budget)} allocated</div>

          {/* Segmented allocation bar */}
          <div className="w-full h-3 rounded-full overflow-hidden flex mb-3" style={{ background: "var(--surface-2)" }}>
            {budget > 0 && totals.map((t, i) => (
              <div key={t.category} style={{ width: `${(t.amount / budget) * 100}%`, background: colorFor(cfg, t.category, i) }} title={`${t.category}: ${formatDkk(t.amount)}`} />
            ))}
          </div>

          <ul className="space-y-1">
            {totals.slice(0, 4).map((t, i) => (
              <li key={t.category} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorFor(cfg, t.category, i) }} />
                <span className="flex-1 truncate" style={{ color: "var(--text)" }}>{t.category}</span>
                <span style={{ color: "var(--text-muted)" }}>{formatDkk(t.amount)}</span>
              </li>
            ))}
          </ul>
          {pct >= 100 && <p className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>Fully allocated</p>}
        </>
      )}
    </Card>
  );
}
