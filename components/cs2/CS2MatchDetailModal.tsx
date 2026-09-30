"use client";

import { useEffect, useState } from "react";
import type { FaceitScoreboard, FaceitScoreTeam } from "@/lib/faceit";

const ACCENT = "var(--accent-orange)";

/** Full scoreboard popover for one CS2 match. Fetches /api/faceit/match. */
export default function CS2MatchDetailModal({ matchId, focusNickname, onClose }: {
  matchId: string; focusNickname?: string; onClose: () => void;
}) {
  const [board, setBoard] = useState<FaceitScoreboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onEsc); document.body.style.overflow = ""; };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/faceit/match?matchId=${encodeURIComponent(matchId)}`)
      .then((r) => r.json())
      .then((j) => { if (cancelled) return; if (j.error) setError(j.error); else setBoard(j); })
      .catch(() => { if (!cancelled) setError("Couldn't load this match."); });
    return () => { cancelled = true; };
  }, [matchId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", paddingTop: 40 }} onClick={onClose}>
      <div className="rounded-2xl overflow-hidden flex flex-col max-w-2xl w-full" style={{ background: "var(--surface)", border: "1px solid var(--border)", maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="font-semibold flex-1 truncate">
            {board ? `${prettyMap(board.map)} · ${board.score}` : "Match"}
          </span>
          <button onClick={onClose} className="text-lg leading-none px-1" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>
        <div className="overflow-y-auto p-3 space-y-3">
          {error ? (
            <p className="text-sm p-3" style={{ color: "var(--accent-orange)" }}>{error}</p>
          ) : !board ? (
            <p className="text-sm p-3" style={{ color: "var(--text-muted)" }}>Loading scoreboard…</p>
          ) : (
            board.teams.map((t, i) => <TeamTable key={i} team={t} focus={focusNickname} />)
          )}
        </div>
      </div>
    </div>
  );
}

function TeamTable({ team, focus }: { team: FaceitScoreTeam; focus?: string }) {
  const color = team.win ? "var(--accent-green)" : "var(--accent-red)";
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-2)", border: `1px solid ${color}` }}>
      <div className="px-3 py-1.5 flex items-center justify-between text-sm font-semibold" style={{ background: `${color}18` }}>
        <span style={{ color }}>{team.win ? "Victory" : "Defeat"}</span>
        <span style={{ color: "var(--text-muted)" }}>{team.score}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="text-left font-medium px-3 py-1">Player</th>
              <th className="text-right font-medium px-1 py-1">K</th>
              <th className="text-right font-medium px-1 py-1">D</th>
              <th className="text-right font-medium px-1 py-1">A</th>
              <th className="text-right font-medium px-2 py-1">K/D</th>
              <th className="text-right font-medium px-2 py-1">ADR</th>
              <th className="text-right font-medium px-2 py-1">HS%</th>
              <th className="text-right font-medium px-3 py-1">MVP</th>
            </tr>
          </thead>
          <tbody>
            {team.players.map((p) => {
              const isFocus = focus && p.nickname.toLowerCase() === focus.toLowerCase();
              return (
                <tr key={p.playerId} style={{ background: isFocus ? `${ACCENT}18` : "transparent", borderTop: "1px solid var(--border)" }}>
                  <td className="px-3 py-1 truncate font-medium" style={{ color: isFocus ? ACCENT : "var(--text)", maxWidth: 130 }}>{p.nickname}</td>
                  <td className="text-right px-1 py-1">{p.kills}</td>
                  <td className="text-right px-1 py-1">{p.deaths}</td>
                  <td className="text-right px-1 py-1">{p.assists}</td>
                  <td className="text-right px-2 py-1" style={{ color: (p.kd ?? 0) >= 1 ? "var(--accent-green)" : "var(--text-muted)" }}>{p.kd?.toFixed(2) ?? "—"}</td>
                  <td className="text-right px-2 py-1" style={{ color: "var(--text-muted)" }}>{p.adr != null ? Math.round(p.adr) : "—"}</td>
                  <td className="text-right px-2 py-1" style={{ color: "var(--text-muted)" }}>{p.hsPct != null ? `${Math.round(p.hsPct)}%` : "—"}</td>
                  <td className="text-right px-3 py-1" style={{ color: "var(--text-muted)" }}>{p.mvps ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "de_anubis" → "Anubis". */
export function prettyMap(map: string): string {
  return map.replace(/^de_/, "").replace(/\b\w/g, (c) => c.toUpperCase());
}
