"use client";

import { useCallback, useEffect, useState } from "react";
import type { TftAccount, TftSummary, TftRank } from "@/lib/tft";
import { tftRankedEmblem, placementColor } from "@/lib/tft";

const ACCENT = "var(--accent-cyan)";

const REGIONS = ["euw1", "eun1", "na1", "kr", "br1", "jp1", "oc1", "la1", "la2", "tr1", "ru"];

const QUEUE_LABEL: Record<string, string> = {
  RANKED_TFT: "Ranked", RANKED_TFT_DOUBLE_UP: "Double Up", RANKED_TFT_TURBO: "Hyper Roll",
};

/** TFT tab body — rendered inside GameHub's shared header. `hideHeader` kept as a
 *  no-op for callsite parity with the other game hubs. */
export default function TFTHub({ hideHeader: _hideHeader }: { hideHeader?: boolean }) {
  const [accounts, setAccounts] = useState<TftAccount[] | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [summaries, setSummaries] = useState<Record<string, TftSummary>>({});
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [region, setRegion] = useState("euw1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tft/summary?id=${encodeURIComponent(id)}`);
      const j = (await res.json()) as TftSummary;
      setSummaries((prev) => ({ ...prev, [id]: j }));
    } catch { /* ignore */ }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/tft/accounts");
      const j = await res.json();
      setAccounts(j.accounts ?? []);
      setHasKey(j.hasKey ?? false);
      for (const a of j.accounts ?? []) loadSummary(a.id);
    } catch { setAccounts([]); }
  }, [loadSummary]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  async function add() {
    const gn = gameName.trim();
    const tl = tagLine.trim().replace(/^#/, "");
    if (!gn || !tl) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/tft/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameName: gn, tagLine: tl, region }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't add that account."); return; }
      setGameName(""); setTagLine("");
      await loadAccounts();
    } catch { setError("Network error."); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Remove this TFT account?")) return;
    await fetch(`/api/tft/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setSummaries((prev) => { const n = { ...prev }; delete n[id]; return n; });
    loadAccounts();
  }

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {!hasKey && (
        <div className="rounded-2xl p-4 text-sm" style={{ background: `${ACCENT}14`, border: `1px solid ${ACCENT}` }}>
          <div className="font-semibold mb-1" style={{ color: ACCENT }}>⚠️ TFT stats need a Riot API key</div>
          <div style={{ color: "var(--text-muted)" }}>
            Add <code>RIOT_API_KEY</code> to <code>.env.local</code> (the same key the LoL hub uses). You can still add Riot IDs now — they&apos;ll light up once the key is set.
          </div>
        </div>
      )}

      {/* Add account */}
      <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Add a TFT account</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="text" placeholder="Game name" value={gameName}
            onChange={(e) => setGameName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="text-sm px-2 py-1.5 rounded-md flex-1" style={inputStyle} />
          <input type="text" placeholder="#tag" value={tagLine}
            onChange={(e) => setTagLine(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="text-sm px-2 py-1.5 rounded-md w-24" style={inputStyle} />
          <select value={region} onChange={(e) => setRegion(e.target.value)}
            className="text-sm px-2 py-1.5 rounded-md" style={inputStyle}>
            {REGIONS.map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
          </select>
          <button onClick={add} disabled={busy || !gameName.trim() || !tagLine.trim()}
            className="text-sm px-3 py-1.5 rounded-md disabled:opacity-40"
            style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>Add</button>
        </div>
        {error && <div className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>{error}</div>}
      </div>

      {/* Accounts */}
      {accounts === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
          🎲 No TFT accounts yet — add a Riot ID above.
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} summary={summaries[a.id]} onRemove={() => remove(a.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function shortTier(r: TftRank): string {
  if (!r.tier) return "Unranked";
  const t = r.tier[0] + r.tier.slice(1).toLowerCase();
  const master = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(r.tier);
  return master ? `${t} ${r.lp} LP` : `${t} ${r.rank} · ${r.lp} LP`;
}

function AccountCard({ account, summary, onRemove }: { account: TftAccount; summary?: TftSummary; onRemove: () => void }) {
  const loading = !summary;
  const rank = summary?.ranks?.find((r) => r.queueType === "RANKED_TFT") ?? summary?.ranks?.[0];

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: `1px solid ${rank?.tier ? ACCENT : "var(--border)"}` }}>
      <div className="flex items-center gap-3">
        {rank?.tier ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tftRankedEmblem(rank.tier)} alt="" width={44} height={44} className="shrink-0" style={{ objectFit: "contain" }} />
        ) : (
          <div className="w-11 h-11 rounded-lg shrink-0 grid place-items-center text-lg" style={{ background: "var(--surface-2)" }}>🎲</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold truncate">{account.gameName}<span style={{ color: "var(--text-muted)" }}>#{account.tagLine}</span></span>
            <span className="text-[11px] uppercase" style={{ color: "var(--text-muted)" }}>{account.region}</span>
          </div>
          {rank && (
            <div className="text-xs mt-0.5" style={{ color: "var(--text)" }}>
              {QUEUE_LABEL[rank.queueType] ?? "Ranked"}: <span style={{ color: ACCENT }}>{shortTier(rank)}</span>
              {(rank.wins + rank.losses) > 0 && <span style={{ color: "var(--text-muted)" }}> · {rank.wins}W {rank.losses}L</span>}
            </div>
          )}
        </div>
        <button onClick={onRemove} className="text-xs shrink-0 self-start" style={{ color: "var(--accent-red)" }} title="Remove">✕</button>
      </div>

      {loading ? (
        <div className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>Loading stats…</div>
      ) : summary?.needsAccess ? (
        <div className="text-xs mt-3 rounded-lg p-2" style={{ background: "var(--surface-2)", color: "var(--accent-orange)" }}>
          🔒 This Riot key can&apos;t see TFT (403). A production key scoped to LoL only doesn&apos;t include TFT — you need <strong>TFT product access</strong> on the Riot app, or a 24-hour dev key (which grants all products). The Riot ID is saved and will light up once the key can read TFT.
        </div>
      ) : summary?.error && !summary?.recent?.length ? (
        <div className="text-xs mt-3" style={{ color: summary.needsKey ? "var(--text-muted)" : "var(--accent-orange)" }}>{summary.error}</div>
      ) : (
        <>
          {/* Recent placements */}
          {summary && summary.recent.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {summary.recent.map((m) => (
                <span key={m.matchId} title={`Placement ${m.placement}`}
                  className="w-6 h-6 rounded text-xs font-bold grid place-items-center"
                  style={{ background: `${placementColor(m.placement)}22`, color: placementColor(m.placement), border: `1px solid ${placementColor(m.placement)}` }}>
                  {m.placement}
                </span>
              ))}
            </div>
          )}
          {/* Aggregates */}
          {summary && summary.avgPlacement != null && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <StatTile label="Avg place" value={summary.avgPlacement.toFixed(1)} />
              <StatTile label="Top 4" value={summary.top4Rate != null ? `${Math.round(summary.top4Rate * 100)}%` : "—"} />
              <StatTile label="Firsts" value={String(summary.firsts)} />
            </div>
          )}
          {summary && summary.recent.length === 0 && summary.ranks.length === 0 && !summary.error && (
            <div className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>No recent TFT games.</div>
          )}
        </>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-2 py-1.5 text-center" style={{ background: "var(--surface-2)" }}>
      <div className="text-sm font-bold" style={{ color: "var(--text)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}
