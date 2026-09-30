"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";
import type { TransitBoard } from "@/lib/transit";
import { TRANSIT_ICON, departureLabel, minutesUntil } from "@/lib/transit";
import { useRefreshMs } from "@/lib/useRefreshMs";

/** Next departures from the saved home stop. Links to /transit (via the grid wrapper). */
export default function TransitWidget() {
  const [board, setBoard] = useState<TransitBoard | null>(null);
  const refreshMs = useRefreshMs("transit", 2);

  async function load() {
    try {
      const res = await fetch("/api/transit/departures?max=5");
      setBoard(await res.json());
    } catch { setBoard(null); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (refreshMs === 0) return;
    const iv = setInterval(load, refreshMs);
    return () => clearInterval(iv);
  }, [refreshMs]);

  const deps = board?.departures ?? [];

  return (
    <Card accentColor="var(--accent-green)">
      <CardHeader
        icon="🚌"
        title="Transit"
        subtitle={board?.stopName && !board.needsStop ? board.stopName : "Departures"}
        accentColor="var(--accent-green)"
      />
      {board === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : board.needsKey ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Add a Rejseplanen API key in the hub to see departures.</p>
      ) : board.needsStop ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Pick your home stop in the hub.</p>
      ) : deps.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No upcoming departures.</p>
      ) : (
        <ul className="space-y-1.5">
          {deps.map((d, i) => {
            const soon = minutesUntil(d.realISO ?? d.plannedISO);
            return (
              <li key={i} className="text-sm flex items-center gap-2 rounded-md px-2 py-1" style={{ background: "var(--surface-2)", opacity: d.cancelled ? 0.5 : 1 }}>
                <span className="shrink-0">{TRANSIT_ICON[d.kind]}</span>
                <span className="flex-1 min-w-0 truncate">
                  <span style={{ color: "var(--text)" }}>{d.line}</span>
                  {d.direction && <span style={{ color: "var(--text-muted)" }}> → {d.direction}</span>}
                </span>
                {d.delayMin > 0 && !d.cancelled && <span className="text-[10px] font-bold shrink-0" style={{ color: "var(--accent-red)" }}>+{d.delayMin}</span>}
                <span className="text-xs shrink-0 tabular-nums" style={{ color: d.cancelled ? "var(--accent-red)" : soon <= 2 ? "var(--accent-orange)" : "var(--text-muted)" }}>
                  {d.cancelled ? "canx" : departureLabel(d.realISO ?? d.plannedISO)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
