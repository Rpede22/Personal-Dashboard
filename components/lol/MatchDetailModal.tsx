"use client";

import { useEffect, useState } from "react";

interface DetailParticipant {
  puuid: string;
  championId: number;
  championName: string;
  teamPosition: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
  damage: number;
  visionScore: number;
  win: boolean;
  teamId: number;
}

interface MatchDetail {
  id: string;
  gameCreation: number;
  gameDuration: number;
  queueId: number;
  gameMode: string;
  participants: DetailParticipant[];
  dragonVersion: string;
  championsById: Record<number, string>;
}

const QUEUE_LABELS: Record<number, string> = {
  400: "Draft",
  420: "Ranked Solo",
  430: "Blind Pick",
  440: "Ranked Flex",
  450: "ARAM",
  700: "Clash",
  830: "Bot (Intro)",
  840: "Bot (Beginner)",
  850: "Bot (Intermediate)",
  900: "URF",
  1020: "One For All",
  1400: "Ultimate Spellbook",
  1700: "Arena",
  1900: "URF",
};

function queueLabel(queueId: number): string {
  return QUEUE_LABELS[queueId] ?? `Queue ${queueId}`;
}
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function kda(p: DetailParticipant): string {
  return ((p.kills + p.assists) / (p.deaths || 1)).toFixed(2);
}

export default function MatchDetailModal({
  matchId,
  region,
  focusPuuid,
  onClose,
}: {
  matchId: string;
  region: string;
  focusPuuid: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/lol/match?matchId=${encodeURIComponent(matchId)}&region=${encodeURIComponent(region)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    // Lock body scroll while open + Escape closes
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [matchId, region, onClose]);

  const blue = data?.participants.filter((p) => p.teamId === 100) ?? [];
  const red  = data?.participants.filter((p) => p.teamId === 200) ?? [];
  const blueWin = blue[0]?.win ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-2xl w-full max-w-4xl flex flex-col overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          maxHeight: "88vh",
        }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-5 py-4"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <div className="font-semibold" style={{ color: "var(--accent-blue)" }}>
              Match detail
            </div>
            {data && (
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {queueLabel(data.queueId)} · {formatDuration(data.gameDuration)} ·{" "}
                {new Date(data.gameCreation).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-lg px-2 py-1 rounded-lg"
            style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {loading && (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Loading match…</p>
          )}
          {error && (
            <p className="text-sm text-center py-4" style={{ color: "var(--accent-red)" }}>{error}</p>
          )}
          {data && (
            <>
              {(["blue", "red"] as const).map((side) => {
                const team = side === "blue" ? blue : red;
                const win  = side === "blue" ? blueWin : !blueWin;
                const teamKills   = team.reduce((s, p) => s + p.kills, 0);
                const teamDeaths  = team.reduce((s, p) => s + p.deaths, 0);
                const teamAssists = team.reduce((s, p) => s + p.assists, 0);
                const teamGold    = team.reduce((s, p) => s + p.goldEarned, 0);
                const teamColor   = side === "blue" ? "var(--accent-blue)" : "var(--accent-red)";
                return (
                  <div key={side}>
                    <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: teamColor }}>
                        {side === "blue" ? "Blue side" : "Red side"}
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-bold" style={{
                          background: win ? "var(--accent-green)22" : "var(--surface-2)",
                          color: win ? "var(--accent-green)" : "var(--text-muted)",
                        }}>
                          {win ? "VICTORY" : "DEFEAT"}
                        </span>
                      </h3>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {teamKills} K · {teamDeaths} D · {teamAssists} A · {(teamGold / 1000).toFixed(1)}k gold
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${teamColor}33` }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                            <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}>Player</th>
                            <th className="px-2 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>KDA</th>
                            <th className="px-2 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>CS</th>
                            <th className="px-2 py-2 text-right font-medium hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>Gold</th>
                            <th className="px-2 py-2 text-right font-medium hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>Damage</th>
                            <th className="px-2 py-2 text-right font-medium hidden md:table-cell" style={{ color: "var(--text-muted)" }}>Vision</th>
                          </tr>
                        </thead>
                        <tbody>
                          {team.map((p) => {
                            const isFocus = p.puuid === focusPuuid;
                            return (
                              <tr
                                key={p.puuid}
                                style={{
                                  borderBottom: "1px solid var(--border)",
                                  background: isFocus ? `${teamColor}11` : "transparent",
                                }}
                              >
                                <td className="px-2 py-1.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <img
                                      src={`https://ddragon.leagueoflegends.com/cdn/${data.dragonVersion}/img/champion/${p.championName}.png`}
                                      alt={p.championName}
                                      width={26}
                                      height={26}
                                      className="rounded flex-shrink-0"
                                      style={{ background: "var(--surface-2)" }}
                                    />
                                    <div className="min-w-0">
                                      <div className={`truncate ${isFocus ? "font-semibold" : ""}`} style={{ color: isFocus ? teamColor : "var(--text)" }}>
                                        {p.championName}
                                      </div>
                                      {p.teamPosition && (
                                        <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>
                                          {p.teamPosition.toLowerCase()}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <div>{p.kills}/{p.deaths}/{p.assists}</div>
                                  <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                    {kda(p)}
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 text-right">{p.cs}</td>
                                <td className="px-2 py-1.5 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>
                                  {(p.goldEarned / 1000).toFixed(1)}k
                                </td>
                                <td className="px-2 py-1.5 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>
                                  {(p.damage / 1000).toFixed(1)}k
                                </td>
                                <td className="px-2 py-1.5 text-right hidden md:table-cell" style={{ color: "var(--text-muted)" }}>
                                  {p.visionScore}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
