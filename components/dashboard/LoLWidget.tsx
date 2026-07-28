"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card, { CardHeader } from "@/components/Card";

interface LolAccount {
  id: number;
  gameName: string;
  tagLine: string;
  region: string;
}

interface RankEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

interface MatchParticipant {
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  championName: string;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  gameEndedInEarlySurrender?: boolean;
}

interface MatchSummary {
  id: string;
  queueId: number;
  gameDuration: number;
  me: MatchParticipant | null;
}

interface LoLSummary {
  ranks: RankEntry[];
  matches: MatchSummary[];
  dragonVersion: string;
}

// Tier palette (kept in sync with LoLHub — small enough to duplicate)
function tierColor(tier: string): string {
  const t = tier.toUpperCase();
  if (t === "IRON")        return "#7c7c7c";
  if (t === "BRONZE")      return "#b57543";
  if (t === "SILVER")      return "#c0c0c0";
  if (t === "GOLD")        return "#f0b400";
  if (t === "PLATINUM")    return "#4dc0b3";
  if (t === "EMERALD")     return "#26d17c";
  if (t === "DIAMOND")     return "#5aa4ff";
  if (t === "MASTER")      return "#c66aff";
  if (t === "GRANDMASTER") return "#e15060";
  if (t === "CHALLENGER")  return "#f4c962";
  return "var(--text-muted)";
}

/** Short rank abbreviation for the collapsed header, e.g. "E IV". */
function shortTier(tier: string, rank: string): string {
  const t = tier.toUpperCase();
  const initial =
    t === "GRANDMASTER" ? "GM" :
    t === "MASTER"      ? "M"  :
    t === "CHALLENGER"  ? "C"  :
    t.slice(0, 1);
  return `${initial}${rank ? " " + rank : ""}`;
}

const STORAGE_KEY = "dashboard.lol.expanded";

export default function LoLWidget() {
  const [accounts, setAccounts] = useState<LolAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<Record<number, LoLSummary | "error">>({});
  // Accordion: at most one open at a time. null = all collapsed.
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Extracted so the interval below can call it without re-declaring the whole
  // fetch chain. Accounts list is fetched on the first run; subsequent ticks
  // only re-fetch the per-account summaries.
  async function loadAll(refreshOnly = false) {
    try {
      let accts = accounts;
      if (!refreshOnly) {
        const res = await fetch("/api/lol/account");
        const data = await res.json();
        accts = data.accounts ?? [];
        setAccounts(accts);

        // Hydrate the expanded account from localStorage; default = first account.
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const id = raw ? parseInt(raw) : NaN;
          if (!isNaN(id) && accts.some((a) => a.id === id)) {
            setExpandedId(id);
          } else if (accts[0]) {
            setExpandedId(accts[0].id);
          }
        } catch {
          if (accts[0]) setExpandedId(accts[0].id);
        }
      }

      const results = await Promise.all(
        accts.map(async (a) => {
          try {
            const sRes = await fetch(`/api/lol/summary?accountId=${a.id}`);
            if (!sRes.ok) return { id: a.id, summary: "error" as const };
            const s = await sRes.json();
            return {
              id: a.id,
              summary: {
                ranks: s.ranks ?? [],
                matches: s.matches ?? [],
                dragonVersion: s.dragonVersion ?? "15.1.1",
              } as LoLSummary,
            };
          } catch {
            return { id: a.id, summary: "error" as const };
          }
        })
      );
      const map: Record<number, LoLSummary | "error"> = {};
      for (const { id, summary } of results) map[id] = summary;
      setSummaries(map);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => {
    loadAll(false);
    // Poll every 2 min while the dashboard is open. Riot's cache is 60s on the
    // volatile endpoints so this only actually hits Riot roughly every other
    // tick — the intermediate ticks are absorbed by Next.js.
    const iv = setInterval(() => loadAll(true), 2 * 60 * 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleExpanded(id: number) {
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      try {
        if (next === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, String(next));
      } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <Card accentColor="var(--accent-blue)">
      <CardHeader icon="⚔️" title="League of Legends" subtitle="Rank · recent matches" accentColor="var(--accent-blue)" />

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No accounts yet — click through to add your Riot ID.
        </p>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => {
            const s = summaries[a.id];
            const isOpen = expandedId === a.id;
            const soloRank = s !== "error" && s ? s.ranks.find((r) => r.queueType === "RANKED_SOLO_5x5") ?? null : null;
            const totalGames = soloRank ? soloRank.wins + soloRank.losses : 0;
            const wr = totalGames > 0 ? Math.round((soloRank!.wins / totalGames) * 100) : 0;
            const wrColor = wr >= 55 ? "var(--accent-green)" : wr < 45 ? "var(--accent-red)" : "var(--text-muted)";

            return (
              <Link
                key={a.id}
                href={`/lol?account=${a.id}`}
                className="block rounded-xl overflow-hidden hover:brightness-110"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                {/* Header — chevron toggles expand (stopPropagation keeps the
                    outer Link from navigating); every other click inside the
                    card falls through to the Link and opens the hub. */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleExpanded(a.id); }}
                    title={isOpen ? "Collapse" : "Expand"}
                    className="text-xs shrink-0 rounded-sm px-1"
                    style={{ color: "var(--text-muted)", width: "1.1rem" }}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-sm truncate">
                      {a.gameName}
                      <span style={{ color: "var(--text-muted)" }}>#{a.tagLine}</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: "var(--accent-blue)22", color: "var(--accent-blue)" }}>
                      {a.region}
                    </span>
                    <span className="ml-auto text-xs flex items-center gap-2 flex-shrink-0">
                      {!s ? (
                        <span style={{ color: "var(--text-muted)" }}>…</span>
                      ) : s === "error" ? (
                        <span style={{ color: "var(--accent-red)" }}>no data</span>
                      ) : soloRank ? (
                        <>
                          <span className="font-semibold capitalize" style={{ color: tierColor(soloRank.tier) }}>
                            {shortTier(soloRank.tier, soloRank.rank)}
                          </span>
                          <span style={{ color: "var(--text-muted)" }}>
                            {soloRank.wins}W {soloRank.losses}L
                          </span>
                          <span style={{ color: wrColor, minWidth: "2.5rem", textAlign: "right" }}>
                            {wr}%
                          </span>
                        </>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Unranked</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Expanded body */}
                {isOpen && s && s !== "error" && (
                  <div className="px-3 pb-3 space-y-2">
                    {/* Rank card with emblem */}
                    {soloRank ? (
                      <div
                        className="rounded-lg p-2 flex items-center gap-3"
                        style={{ background: "var(--surface-2)", border: `1px solid ${tierColor(soloRank.tier)}55` }}
                      >
                        <img
                          src={`https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${soloRank.tier.toLowerCase()}.png`}
                          alt=""
                          width={44}
                          height={44}
                          className="flex-shrink-0"
                          style={{ objectFit: "contain" }}
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                            Ranked Solo
                          </div>
                          <div className="text-base font-bold capitalize" style={{ color: tierColor(soloRank.tier) }}>
                            {soloRank.tier.toLowerCase()} {soloRank.rank}
                          </div>
                          <div className="text-xs" style={{ color: "var(--text)" }}>
                            {soloRank.leaguePoints} LP · {soloRank.wins}W {soloRank.losses}L ·{" "}
                            <span style={{ color: wrColor }}>{wr}% WR</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg p-2 text-xs" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                        Unranked this split
                      </div>
                    )}

                    {/* Last 5 games — champion icons + KDA + W/L */}
                    {(() => {
                      const last5 = s.matches.slice(0, 5);
                      if (last5.length === 0) {
                        return (
                          <div className="rounded-lg p-2 text-xs" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                            No matches on record
                          </div>
                        );
                      }
                      return (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
                            Last {last5.length} game{last5.length === 1 ? "" : "s"}
                          </div>
                          <div className="space-y-1">
                            {last5.map((m) => {
                              if (!m.me) return null;
                              const remake = m.me.gameEndedInEarlySurrender === true;
                              const win = m.me.win;
                              const cs = m.me.totalMinionsKilled + m.me.neutralMinionsKilled;
                              const kdaVal = ((m.me.kills + m.me.assists) / (m.me.deaths || 1)).toFixed(2);
                              const badgeColor = remake ? "var(--text-muted)" : win ? "var(--accent-green)" : "var(--accent-red)";
                              const badgeLabel = remake ? "R" : win ? "W" : "L";
                              return (
                                <div
                                  key={m.id}
                                  className="rounded-md px-2 py-1 flex items-center gap-2"
                                  style={{
                                    background: "var(--surface-2)",
                                    borderLeft: `3px solid ${badgeColor}`,
                                  }}
                                >
                                  <img
                                    src={`https://ddragon.leagueoflegends.com/cdn/${s.dragonVersion}/img/champion/${m.me.championName}.png`}
                                    alt={m.me.championName}
                                    width={26}
                                    height={26}
                                    className="rounded flex-shrink-0"
                                    style={{ background: "var(--surface)" }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium truncate">{m.me.championName}</div>
                                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                      {m.me.kills}/{m.me.deaths}/{m.me.assists} · {kdaVal} KDA · {cs} CS
                                    </div>
                                  </div>
                                  <span
                                    className="text-[10px] font-bold flex-shrink-0"
                                    style={{ color: badgeColor }}
                                  >
                                    {badgeLabel}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Expanded but data errored */}
                {isOpen && s === "error" && (
                  <div className="px-3 pb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                    Riot data unavailable. Check <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>RIOT_API_KEY</code> in the hub.
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
