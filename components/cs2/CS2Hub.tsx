"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { FaceitAccount, FaceitSummary, FaceitMatchRow, Faceit30Stats } from "@/lib/faceit";
import { levelColor } from "@/lib/faceit";
import { prettyMap } from "./CS2MatchDetailModal";

const CS2MatchDetailModal = dynamic(() => import("./CS2MatchDetailModal"), { ssr: false });

const ACCENT = "var(--accent-orange)";

/** CS2 tab body — LoL-style: accounts sidebar + selected-account detail (rank/elo
 *  header, last-N stats, match history → click a match for the full scoreboard).
 *  Rendered inside GameHub's shared header. `hideHeader` kept as a no-op. */
export default function CS2Hub({ hideHeader: _hideHeader }: { hideHeader?: boolean }) {
  const [accounts, setAccounts] = useState<FaceitAccount[] | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [summaries, setSummaries] = useState<Record<string, FaceitSummary>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [matches, setMatches] = useState<FaceitMatchRow[] | null>(null);
  const [stats, setStats] = useState<Faceit30Stats | null>(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMatch, setOpenMatch] = useState<string | null>(null);

  const loadSummary = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/faceit/summary?id=${encodeURIComponent(id)}`);
      const j = (await res.json()) as FaceitSummary;
      setSummaries((prev) => ({ ...prev, [id]: j }));
    } catch { /* ignore */ }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/faceit/accounts");
      const j = await res.json();
      const accs: FaceitAccount[] = j.accounts ?? [];
      setAccounts(accs);
      setHasKey(j.hasKey ?? false);
      for (const a of accs) loadSummary(a.id);
      setSelected((cur) => cur && accs.some((a) => a.id === cur) ? cur : accs[0]?.id ?? null);
    } catch { setAccounts([]); }
  }, [loadSummary]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const loadMatches = useCallback(async (id: string) => {
    setMatchesLoading(true);
    try {
      const j = await fetch(`/api/faceit/matches?id=${encodeURIComponent(id)}&limit=30`).then((r) => r.json());
      setMatches(j.matches ?? []); setStats(j.stats ?? null);
    } catch { setMatches([]); setStats(null); }
    finally { setMatchesLoading(false); }
  }, []);

  // Load the selected account's matches when the selection changes.
  useEffect(() => {
    if (!selected) { setMatches(null); setStats(null); return; }
    loadMatches(selected);
  }, [selected, loadMatches]);

  // Manual refresh — re-pull the selected account's summary + matches without
  // having to switch accounts.
  async function refresh() {
    if (!selected || matchesLoading) return;
    await Promise.all([loadSummary(selected), loadMatches(selected)]);
  }

  async function add() {
    const nick = nickname.trim();
    if (!nick) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/faceit/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: nick }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't add that account."); return; }
      setNickname("");
      await loadAccounts();
    } catch { setError("Network error."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Remove this FACEIT account?")) return;
    await fetch(`/api/faceit/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setSummaries((prev) => { const n = { ...prev }; delete n[id]; return n; });
    if (selected === id) setSelected(null);
    loadAccounts();
  }

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;
  const sel = selected ? summaries[selected] : undefined;
  const selAccount = accounts?.find((a) => a.id === selected);

  return (
    <div className="max-w-5xl mx-auto">
      {!hasKey && (
        <div className="rounded-2xl p-4 text-sm mb-4" style={{ background: `${ACCENT}14`, border: `1px solid ${ACCENT}` }}>
          <div className="font-semibold mb-1" style={{ color: ACCENT }}>⚠️ CS2 stats need a FACEIT API key</div>
          <div style={{ color: "var(--text-muted)" }}>
            Add a free key from <a href="https://developers.faceit.com/" target="_blank" rel="noreferrer" className="underline" style={{ color: ACCENT }}>developers.faceit.com</a>. You can still add nicknames now — they light up once the key is set.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
        {/* Sidebar */}
        <aside className="space-y-3">
          <div className="rounded-xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Add account</div>
            <div className="flex gap-1.5">
              <input type="text" placeholder="FACEIT nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} className="text-sm px-2 py-1.5 rounded-md flex-1 min-w-0" style={inputStyle} />
              <button onClick={add} disabled={busy || !nickname.trim()} className="text-sm px-2.5 py-1.5 rounded-md disabled:opacity-40 shrink-0" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>Add</button>
            </div>
            {error && <div className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>{error}</div>}
          </div>

          {accounts === null ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm px-1" style={{ color: "var(--text-muted)" }}>No accounts yet — add a nickname above.</p>
          ) : (
            <div className="space-y-1.5">
              {accounts.map((a) => {
                const s = summaries[a.id];
                const level = s?.skillLevel ?? null;
                const lc = levelColor(level);
                const on = a.id === selected;
                return (
                  <button key={a.id} onClick={() => setSelected(a.id)} className="w-full text-left rounded-xl p-2 flex items-center gap-2"
                    style={{ background: on ? `${ACCENT}18` : "var(--surface)", border: `1px solid ${on ? ACCENT : "var(--border)"}` }}>
                    {s?.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.avatar} alt="" width={32} height={32} className="rounded-lg shrink-0" style={{ objectFit: "cover" }} />
                    ) : (
                      <div className="w-8 h-8 rounded-lg shrink-0 grid place-items-center" style={{ background: "var(--surface-2)" }}>🎯</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{s?.nickname ?? a.nickname}</div>
                      <div className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                        {level != null && <span className="font-bold" style={{ color: lc }}>LVL {level}</span>}
                        {s?.elo != null && <span>{s.elo}</span>}
                      </div>
                    </div>
                    <span onClick={(e) => { e.stopPropagation(); remove(a.id); }} className="text-xs shrink-0" style={{ color: "var(--accent-red)" }} title="Remove">✕</span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Detail */}
        <section>
          {!selAccount ? (
            <div className="rounded-2xl p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
              Select an account to see its match history.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                {sel?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sel.avatar} alt="" width={56} height={56} className="rounded-xl shrink-0" style={{ objectFit: "cover" }} />
                ) : (
                  <div className="w-14 h-14 rounded-xl shrink-0 grid place-items-center text-2xl" style={{ background: "var(--surface-2)" }}>🎯</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-bold truncate">{sel?.nickname ?? selAccount.nickname}</span>
                    {sel?.skillLevel != null && (
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${levelColor(sel.skillLevel)}22`, color: levelColor(sel.skillLevel), border: `1px solid ${levelColor(sel.skillLevel)}` }}>LVL {sel.skillLevel}</span>
                    )}
                    {sel?.region && <span className="text-[11px] uppercase" style={{ color: "var(--text-muted)" }}>{sel.region}</span>}
                  </div>
                  {sel?.elo != null && <div className="text-sm" style={{ color: ACCENT }}>{sel.elo} elo</div>}
                </div>
                <button
                  onClick={refresh}
                  disabled={matchesLoading}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-lg self-start disabled:opacity-50"
                  style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}
                  title="Refresh this account's stats + matches"
                >{matchesLoading ? "Updating…" : "↻ Update"}</button>
              </div>

              {/* Last-30 stats */}
              {stats && stats.matches > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Last {stats.matches} matches</div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    <StatTile label="Win %" value={stats.winRatePct != null ? `${stats.winRatePct}%` : "—"} color={stats.winRatePct != null && stats.winRatePct >= 50 ? "var(--accent-green)" : "var(--accent-red)"} />
                    <StatTile label="W-L" value={`${stats.wins}-${stats.losses}`} />
                    <StatTile label="K/D" value={stats.avgKd?.toFixed(2) ?? "—"} color={(stats.avgKd ?? 0) >= 1 ? "var(--accent-green)" : "var(--text)"} />
                    <StatTile label="ADR" value={stats.avgAdr != null ? String(Math.round(stats.avgAdr)) : "—"} />
                    <StatTile label="HS %" value={stats.hsPct != null ? `${Math.round(stats.hsPct)}%` : "—"} />
                  </div>
                </div>
              )}

              {/* Match history */}
              <div>
                <div className="text-xs uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Match history</div>
                {matchesLoading && !matches ? (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading matches…</p>
                ) : !matches || matches.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>No recent matches.</p>
                ) : (
                  <div className="space-y-1.5">
                    {matches.map((m) => <MatchRow key={m.matchId} m={m} onOpen={() => setOpenMatch(m.matchId)} />)}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {openMatch && (
        <CS2MatchDetailModal matchId={openMatch} focusNickname={sel?.nickname ?? selAccount?.nickname} onClose={() => setOpenMatch(null)} />
      )}
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg px-2 py-1.5 text-center" style={{ background: "var(--surface-2)" }}>
      <div className="text-sm font-bold" style={{ color: color ?? "var(--text)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function MatchRow({ m, onOpen }: { m: FaceitMatchRow; onOpen: () => void }) {
  const color = m.win ? "var(--accent-green)" : "var(--accent-red)";
  const kda = m.deaths > 0 ? ((m.kills + m.assists) / m.deaths).toFixed(2) : "∞";
  const when = m.createdAt ? relDay(m.createdAt) : "";
  return (
    <button onClick={onOpen} className="w-full text-left rounded-lg p-2 flex items-center gap-3 hover:brightness-110"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${color}` }}>
      <div className="w-14 shrink-0">
        <div className="text-xs font-bold" style={{ color }}>{m.win ? "WIN" : "LOSS"}</div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{m.score}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{prettyMap(m.map)}</div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{when}{m.mode && ` · ${m.mode}`}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums">{m.kills}/{m.deaths}/{m.assists}</div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{kda} KDA · {m.adr != null ? `${Math.round(m.adr)} ADR` : ""}</div>
      </div>
    </button>
  );
}

function relDay(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
