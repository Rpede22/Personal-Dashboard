"use client";

import { useEffect, useMemo, useState } from "react";
import Card, { CardHeader } from "@/components/Card";
import type { PlannedMeal } from "@/lib/meals";
import { useRefreshMs } from "@/lib/useRefreshMs";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function relLabel(dateStr: string, today: string): string {
  if (dateStr === today) return "Tonight";
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const target = new Date(y, m - 1, d);
  const days = Math.round((target.getTime() - t.getTime()) / 86_400_000);
  if (days === 1) return "Tomorrow";
  return target.toLocaleDateString("en-GB", { weekday: "short" });
}

/** Tonight's planned dinner + the next couple of upcoming days. Links to /meals. */
export default function MealWidget() {
  const [plan, setPlan] = useState<PlannedMeal[] | null>(null);
  const refreshMs = useRefreshMs("meals", 0);

  async function load() {
    try {
      const res = await fetch("/api/meals/plan");
      const j = await res.json();
      setPlan(j.plan ?? []);
    } catch { setPlan([]); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (refreshMs === 0) return;
    const iv = setInterval(load, refreshMs);
    return () => clearInterval(iv);
  }, [refreshMs]);

  const today = dateKey(new Date());
  const upcoming = useMemo(() => (plan ?? []).filter((p) => p.date >= today).slice(0, 3), [plan, today]);

  return (
    <Card accentColor="var(--accent-orange)">
      <CardHeader icon="🍽️" title="Meals" subtitle="What's for dinner" accentColor="var(--accent-orange)" />
      {plan === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing planned — pick meals in the hub.</p>
      ) : (
        <ul className="space-y-1.5">
          {upcoming.map((p) => {
            const tonight = p.date === today;
            return (
              <li key={p.date} className="text-sm flex items-center gap-2 rounded-md px-2 py-1" style={{ background: tonight ? "var(--accent-orange)22" : "var(--surface-2)" }}>
                {p.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                )}
                <span className="flex-1 min-w-0 truncate">{p.title}</span>
                <span className="text-[11px] font-semibold shrink-0" style={{ color: tonight ? "var(--accent-orange)" : "var(--text-muted)" }}>{relLabel(p.date, today)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
