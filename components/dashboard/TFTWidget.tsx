"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Card, { CardHeader } from "@/components/Card";
import type { TftAccount, TftSummary } from "@/lib/tft";
import { placementColor } from "@/lib/tft";
import { useRefreshMs } from "@/lib/useRefreshMs";

/** Compact TFT summary — one row per account (rank · recent placements). */
export default function TFTWidget() {
  const [accounts, setAccounts] = useState<TftAccount[] | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [summaries, setSummaries] = useState<Record<string, TftSummary>>({});
  const refreshMs = useRefreshMs("games", 2); // shares the Games slug refresh

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tft/accounts");
      const j = await res.json();
      setAccounts(j.accounts ?? []);
      setHasKey(j.hasKey ?? false);
      for (const a of (j.accounts ?? []) as TftAccount[]) {
        fetch(`/api/tft/summary?id=${encodeURIComponent(a.id)}`)
          .then((r) => r.json())
          .then((s) => setSummaries((prev) => ({ ...prev, [a.id]: s })))
          .catch(() => {});
      }
    } catch { setAccounts([]); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (refreshMs === 0) return;
    const iv = setInterval(load, refreshMs);
    return () => clearInterval(iv);
  }, [refreshMs, load]);

  return (
    <Card accentColor="var(--accent-cyan)">
      <CardHeader icon="🎲" title="TFT" subtitle="Teamfight Tactics" accentColor="var(--accent-cyan)" />
      {accounts === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {hasKey ? "Add a Riot ID in the hub." : "Add a Riot API key + ID in the hub."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {accounts.slice(0, 4).map((a) => {
            const s = summaries[a.id];
            const rank = s?.ranks?.find((r) => r.queueType === "RANKED_TFT") ?? s?.ranks?.[0];
            return (
              <li key={a.id} className="text-sm flex items-center gap-2 rounded-md px-2 py-1" style={{ background: "var(--surface-2)" }}>
                <span className="flex-1 min-w-0 truncate font-medium">{a.gameName}</span>
                {s?.needsAccess ? (
                  <span className="text-[10px] shrink-0" style={{ color: "var(--accent-orange)" }}>🔒 no TFT access</span>
                ) : rank?.tier ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--accent-cyan)22", color: "var(--accent-cyan)" }}>
                    {rank.tier[0]}{["MASTER", "GRANDMASTER", "CHALLENGER"].includes(rank.tier) ? "" : rank.rank} {rank.lp}
                  </span>
                ) : null}
                {s?.recent && s.recent.length > 0 && (
                  <span className="flex gap-0.5 shrink-0">
                    {s.recent.slice(0, 5).map((m) => (
                      <span key={m.matchId} className="w-3.5 h-3.5 rounded-sm text-[8px] font-bold grid place-items-center"
                        style={{ background: `${placementColor(m.placement)}33`, color: placementColor(m.placement) }}>{m.placement}</span>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/tft" className="block text-[11px] mt-2" style={{ color: "var(--accent-cyan)" }}>Open hub →</Link>
    </Card>
  );
}
