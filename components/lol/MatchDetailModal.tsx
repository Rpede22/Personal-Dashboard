"use client";

import { useEffect, useRef, useState } from "react";
import { ddragonChampionIcon } from "@/lib/riot";

interface TimelineFrame { timestampMs: number; blueGold: number; redGold: number; blueLevel: number; redLevel: number }

/**
 * Gold-difference chart with y-axis reference lines and hover-to-inspect.
 * Split out from MatchDetailModal so it can own its own hover state.
 */
function GoldChart({ timeline }: { timeline: TimelineFrame[] }) {
  const W = 640, H = 140, PAD_X = 40, PAD_Y = 16;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const golds = timeline.map((f) => f.blueGold - f.redGold);
  const maxAbs = Math.max(...golds.map(Math.abs), 1);
  const maxMin = timeline[timeline.length - 1].timestampMs / 60000;
  const xAt = (ms: number) => PAD_X + ((ms / 60000) / maxMin) * (W - PAD_X * 2);
  const yAt = (gd: number) => H / 2 - (gd / maxAbs) * (H / 2 - PAD_Y);
  const zeroY = H / 2;
  const pts = timeline.map((f) => `${xAt(f.timestampMs)},${yAt(f.blueGold - f.redGold)}`).join(" ");
  const areaPts = `${xAt(0)},${zeroY} ${pts} ${xAt(timeline[timeline.length - 1].timestampMs)},${zeroY}`;
  const finalGD = golds[golds.length - 1];
  const peakBlue = Math.max(...golds);
  const peakRed  = Math.min(...golds);

  // Reference y-gridlines: 25%, 50%, 75% of maxAbs, mirrored above and below.
  // Labelled on the left so the eye can read a delta without moving to the tooltip.
  const yTicks = [0.25, 0.5, 0.75, 1].flatMap((frac) => [frac, -frac]).map((frac) => ({
    frac,
    y: yAt(frac * maxAbs),
    labelK: (frac * maxAbs) / 1000,
  }));

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    // Find the nearest frame to the pointer's x-position.
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < timeline.length; i++) {
      const dist = Math.abs(xAt(timeline[i].timestampMs) - svgX);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    setHoverIdx(best);
  }

  const hoverFrame = hoverIdx != null ? timeline[hoverIdx] : null;
  const hoverGD = hoverFrame ? hoverFrame.blueGold - hoverFrame.redGold : 0;
  const hoverMin = hoverFrame ? Math.round(hoverFrame.timestampMs / 60000) : 0;
  const hoverX = hoverFrame ? xAt(hoverFrame.timestampMs) : 0;
  const hoverY = hoverFrame ? yAt(hoverGD) : 0;

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Gold difference · blue − red
        </h3>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          <span style={{ color: "var(--accent-blue)" }}>peak +{(peakBlue / 1000).toFixed(1)}k</span>
          <span> · </span>
          <span style={{ color: "var(--accent-red)" }}>peak −{(-peakRed / 1000).toFixed(1)}k</span>
          <span> · final </span>
          <span style={{ color: finalGD >= 0 ? "var(--accent-blue)" : "var(--accent-red)", fontWeight: 600 }}>
            {finalGD >= 0 ? "+" : "−"}{(Math.abs(finalGD) / 1000).toFixed(1)}k
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
          style={{ cursor: "crosshair" }}
        >
          {/* Reference y-gridlines (dashed, faint) + left labels */}
          {yTicks.map(({ frac, y, labelK }) => (
            <g key={frac}>
              <line x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.6} />
              <text x={PAD_X - 4} y={y + 3} fontSize={9} textAnchor="end" fill="var(--text-muted)">
                {frac > 0 ? "+" : "−"}{labelK.toFixed(1)}k
              </text>
            </g>
          ))}
          {/* Zero line — solid, more prominent */}
          <line x1={PAD_X} y1={zeroY} x2={W - PAD_X} y2={zeroY} stroke="var(--text-muted)" strokeWidth={1} />
          <text x={PAD_X - 4} y={zeroY + 3} fontSize={9} textAnchor="end" fill="var(--text-muted)">0</text>

          {/* Filled area — blue above, red below */}
          <defs>
            <clipPath id="blueClip"><rect x={0} y={0} width={W} height={zeroY} /></clipPath>
            <clipPath id="redClip"><rect x={0} y={zeroY} width={W} height={H - zeroY} /></clipPath>
          </defs>
          <polygon points={areaPts} fill="var(--accent-blue)" opacity={0.35} clipPath="url(#blueClip)" />
          <polygon points={areaPts} fill="var(--accent-red)"  opacity={0.35} clipPath="url(#redClip)"  />

          {/* Line above the fill */}
          <polyline points={pts} fill="none" stroke="var(--text)" strokeWidth={1.5} strokeLinejoin="round" />

          {/* X-axis minute ticks every 5 min */}
          {Array.from({ length: Math.floor(maxMin / 5) + 1 }, (_, i) => i * 5).map((min) => (
            <g key={min}>
              <line x1={xAt(min * 60000)} y1={H - PAD_Y + 2} x2={xAt(min * 60000)} y2={H - PAD_Y - 2} stroke="var(--text-muted)" strokeWidth={0.5} />
              <text x={xAt(min * 60000)} y={H - 2} fontSize={9} textAnchor="middle" fill="var(--text-muted)">{min}′</text>
            </g>
          ))}

          {/* Hover indicator: vertical line + dot + tooltip */}
          {hoverFrame && (
            <g style={{ pointerEvents: "none" }}>
              <line x1={hoverX} y1={PAD_Y} x2={hoverX} y2={H - PAD_Y} stroke="var(--text-muted)" strokeWidth={0.5} strokeDasharray="2 2" />
              <circle cx={hoverX} cy={hoverY} r={3.5} fill={hoverGD >= 0 ? "var(--accent-blue)" : "var(--accent-red)"} stroke="var(--surface)" strokeWidth={1.5} />
              {/* Tooltip: nudge left when near the right edge so it stays on-screen */}
              {(() => {
                const flipLeft = hoverX > W - 90;
                const tx = flipLeft ? hoverX - 8 : hoverX + 8;
                const anchor = flipLeft ? "end" : "start";
                return (
                  <g>
                    <rect
                      x={flipLeft ? hoverX - 90 : hoverX + 4}
                      y={PAD_Y + 2}
                      width={86}
                      height={30}
                      rx={4}
                      fill="var(--surface)"
                      stroke="var(--border)"
                      strokeWidth={0.5}
                      opacity={0.95}
                    />
                    <text x={tx} y={PAD_Y + 14} fontSize={10} textAnchor={anchor} fill="var(--text)">
                      {hoverMin}′
                    </text>
                    <text x={tx} y={PAD_Y + 26} fontSize={10} fontWeight={600} textAnchor={anchor} fill={hoverGD >= 0 ? "var(--accent-blue)" : "var(--accent-red)"}>
                      {hoverGD >= 0 ? "+" : "−"}{(Math.abs(hoverGD) / 1000).toFixed(2)}k
                    </text>
                  </g>
                );
              })()}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

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
  const [timeline, setTimeline] = useState<TimelineFrame[] | null>(null);

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

    // Fetch timeline in parallel; failure is silent (chart just doesn't render)
    fetch(`/api/lol/match-timeline?matchId=${encodeURIComponent(matchId)}&region=${encodeURIComponent(region)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.frames) setTimeline(d.frames); })
      .catch(() => { /* ignore — chart is optional */ });

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
                                      src={ddragonChampionIcon(data.dragonVersion, p.championName)}
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
                                      {/* Riot calls the support role "UTILITY"; everyone else calls it support. */}
                                      {p.teamPosition && (
                                        <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>
                                          {p.teamPosition === "UTILITY" ? "support" : p.teamPosition.toLowerCase()}
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

              {/* Gold-difference chart under both scoreboards. Own component
                  so hover state stays local. */}
              {timeline && timeline.length > 1 && <GoldChart timeline={timeline} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
