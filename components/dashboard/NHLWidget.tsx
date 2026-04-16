"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface TeamStanding {
  teamName: string;
  teamAbbrev: string;
  points: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  otLosses: number;
  divisionRank: number;
}

interface Game {
  gameDate: string;
  homeTeam: { abbrev: string; score?: number };
  awayTeam: { abbrev: string; score?: number };
  gameState: string;
  periodType?: string | null;
}

export default function NHLWidget() {
  const [edm, setEdm] = useState<TeamStanding | null>(null);
  const [recentGames, setRecentGames] = useState<Game[]>([]);
  const [nextGame, setNextGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [standingsRes, scheduleRes] = await Promise.all([
          fetch("/api/nhl/standings"),
          fetch("/api/nhl/schedule?team=EDM"),
        ]);
        const standingsData = await standingsRes.json();
        const scheduleData = await scheduleRes.json();

        const edmStanding = standingsData.standings?.find(
          (s: TeamStanding) => s.teamAbbrev === "EDM"
        );
        setEdm(edmStanding ?? null);
        setRecentGames(scheduleData.recent ?? []);
        setNextGame(scheduleData.next ?? null);
      } catch {
        // silently fail — widget shows empty state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function gameResult(game: Game): "W" | "L" | "OTL" | "?" {
    const edm_score =
      game.homeTeam.abbrev === "EDM" ? game.homeTeam.score : game.awayTeam.score;
    const opp_score =
      game.homeTeam.abbrev === "EDM" ? game.awayTeam.score : game.homeTeam.score;
    if (edm_score === undefined || opp_score === undefined) return "?";
    if (edm_score > opp_score) return "W";
    // Loss — check if it was OT/SO
    const isOT = game.periodType === "OT" || game.periodType === "SO";
    return isOT ? "OTL" : "L";
  }

  return (
    <Card accentColor="var(--accent-blue)">
      <CardHeader
        icon="🏒"
        title="NHL — Edmonton Oilers"
        subtitle="Pacific Division"
        accentColor="var(--accent-blue)"
      />

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <div className="space-y-3">
          {edm && (
            <div
              className="flex gap-4 text-sm rounded-xl p-3"
              style={{ background: "var(--surface-2)" }}
            >
              <div className="text-center">
                <div className="text-xl font-bold" style={{ color: "var(--accent-blue)" }}>
                  {edm.points}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  PTS
                </div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold">{edm.wins}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  W
                </div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold">{edm.losses}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  L
                </div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold">{edm.otLosses}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  OTL
                </div>
              </div>
              <div className="text-center ml-auto">
                <div
                  className="text-xl font-bold"
                  style={{ color: "var(--accent-orange)" }}
                >
                  #{edm.divisionRank}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  DIV
                </div>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
              LAST 5
            </p>
            <div className="flex gap-1.5">
              {recentGames.slice(0, 5).map((g, i) => {
                const res = gameResult(g);
                return (
                  <span
                    key={i}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
                    style={{
                      background:
                        res === "W"
                          ? "var(--accent-green)"
                          : res === "OTL"
                          ? "var(--accent-orange)"
                          : res === "L"
                          ? "#374151"
                          : "var(--surface-2)",
                      color: res === "W" || res === "OTL" ? "#fff" : "var(--text)",
                    }}
                  >
                    {res}
                  </span>
                );
              })}
              {recentGames.length === 0 && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  No recent games
                </span>
              )}
            </div>
          </div>

          {nextGame && (
            <div
              className="text-sm rounded-xl p-2.5 flex items-center justify-between"
              style={{ background: "var(--surface-2)" }}
            >
              <span style={{ color: "var(--text-muted)" }}>Next:</span>
              <span className="font-medium">
                {nextGame.awayTeam.abbrev} @ {nextGame.homeTeam.abbrev}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                {new Date(nextGame.gameDate).toLocaleDateString("en-GB", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
