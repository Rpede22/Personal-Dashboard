"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card, { CardHeader } from "@/components/Card";
import type { FaceitAccount, FaceitSummary, FaceitMatchRow, Faceit30Stats } from "@/lib/faceit";
import { levelColor } from "@/lib/faceit";
import { useRefreshMs } from "@/lib/useRefreshMs";

const STORAGE_KEY = "dashboard.cs2.expanded";

/** "de_anubis" → "Anubis". */
function prettyMap(map: string): string {
  return map.replace(/^de_/, "").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface MatchData { matches: FaceitMatchRow[]; stats: Faceit30Stats | null }

/** CS2/FACEIT dashboard body — LoL-style expandable cards (rank/elo collapsed;
 *  recent matches when expanded). Rendered inside the Games widget's CS2 tab. */
export default function CS2Widget() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<FaceitAccount[] | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [summaries, setSummaries] = useState<Record<string, FaceitSummary>>({});
  const [matchData, setMatchData] = useState<Record<string, MatchData | "error">>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const refreshMs = useRefreshMs("games", 2);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/faceit/accounts");
      const j = await res.json();
      const accs: FaceitAccount[] = j.accounts ?? [];
      setAccounts(accs);
      setHasKey(j.hasKey ?? false);
      for (const a of accs) {
        fetch(`/api/faceit/summary?id=${encodeURIComponent(a.id)}`).then((r) => r.json())
          .then((s) => setSummaries((prev) => ({ ...prev, [a.id]: s }))).catch(() => {});
      }
      setExpandedId((cur) => {
        if (cur && accs.some((a) => a.id === cur)) return cur;
        try { const raw = localStorage.getItem(STORAGE_KEY); if (raw && accs.some((a) => a.id === raw)) return raw; } catch { /* ignore */ }
        return accs[0]?.id ?? null;
      });
    } catch { setAccounts([]); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (refreshMs === 0) return;
    const iv = setInterval(load, refreshMs);
    return () => clearInterval(iv);
  }, [refreshMs, load]);

  // Fetch matches lazily for the expanded account.
  const loadMatches = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/faceit/matches?id=${encodeURIComponent(id)}&limit=5`);
      const j = await res.json();
      setMatchData((prev) => ({ ...prev, [id]: { matches: j.matches ?? [], stats: j.stats ?? null } }));
    } catch { setMatchData((prev) => ({ ...prev, [id]: "error" })); }
  }, []);

  useEffect(() => {
    if (expandedId && matchData[expandedId] === undefined) loadMatches(expandedId);
  }, [expandedId, matchData, loadMatches]);

  function toggle(id: string) {
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      try { if (next) localStorage.setItem(STORAGE_KEY, next); else localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <Card accentColor="var(--accent-orange)">
      <CardHeader icon="🎯" title="CS2" subtitle="FACEIT · recent matches" accentColor="var(--accent-orange)" />
      {accounts === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {hasKey ? "Add a FACEIT account in the hub." : "Add a FACEIT API key + account in the hub."}
        </p>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => {
            const s = summaries[a.id];
            const level = s?.skillLevel ?? null;
            const lc = levelColor(level);
            const isOpen = expandedId === a.id;
            const md = matchData[a.id];
            return (
              <div key={a.id} className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-1 px-2 py-2">
                  <button type="button" onClick={() => toggle(a.id)} title={isOpen ? "Collapse" : "Expand"}
                    className="text-sm shrink-0 rounded-md flex items-center justify-center" style={{ color: "var(--text-muted)", width: "1.75rem", height: "1.75rem", background: "var(--surface-2)" }}>
                    {isOpen ? "▾" : "▸"}
                  </button>
                  <button type="button" onClick={() => router.push("/cs2")} className="flex-1 flex items-center gap-2 min-w-0 text-left px-1 rounded-md hover:brightness-110" title="Open CS2 hub">
                    <span className="font-semibold text-sm truncate">{s?.nickname ?? a.nickname}</span>
                    {level != null && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${lc}22`, color: lc }}>L{level}</span>}
                    <span className="ml-auto text-xs flex items-center gap-2 shrink-0">
                      {s?.elo != null && <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{s.elo}</span>}
                      {s?.recent && s.recent.length > 0 && (
                        <span className="flex gap-0.5">
                          {s.recent.slice(0, 5).map((w, i) => <span key={i} className="w-2.5 h-2.5 rounded-sm" style={{ background: w ? "var(--accent-green)" : "var(--accent-red)" }} />)}
                        </span>
                      )}
                    </span>
                  </button>
                </div>

                {isOpen && (
                  <div className="px-3 pb-3 space-y-2">
                    {md === undefined ? (
                      <div className="rounded-lg p-2 text-xs" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>Loading matches…</div>
                    ) : md === "error" || md.matches.length === 0 ? (
                      <div className="rounded-lg p-2 text-xs" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>No recent matches.</div>
                    ) : (
                      <>
                        {md.stats && (
                          <div className="rounded-lg p-2 flex items-center justify-around text-center" style={{ background: "var(--surface-2)" }}>
                            <MiniStat label="WR" value={md.stats.winRatePct != null ? `${md.stats.winRatePct}%` : "—"} />
                            <MiniStat label="K/D" value={md.stats.avgKd?.toFixed(2) ?? "—"} />
                            <MiniStat label="ADR" value={md.stats.avgAdr != null ? String(Math.round(md.stats.avgAdr)) : "—"} />
                          </div>
                        )}
                        <div className="space-y-1">
                          {md.matches.slice(0, 5).map((m) => {
                            const color = m.win ? "var(--accent-green)" : "var(--accent-red)";
                            return (
                              <div key={m.matchId} className="rounded-md px-2 py-1 flex items-center gap-2" style={{ background: "var(--surface-2)", borderLeft: `3px solid ${color}` }}>
                                <span className="text-[10px] font-bold w-8 shrink-0" style={{ color }}>{m.win ? "WIN" : "LOSS"}</span>
                                <span className="text-xs font-medium flex-1 min-w-0 truncate">{prettyMap(m.map)}</span>
                                <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{m.kills}/{m.deaths}/{m.assists}</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-bold" style={{ color: "var(--text)" }}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}
