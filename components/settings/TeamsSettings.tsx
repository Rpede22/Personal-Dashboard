"use client";

import { useEffect, useState } from "react";
import { loadShowEdm, setShowEdm } from "@/lib/sports-prefs";
import { PanelIntro } from "@/components/settings/SettingsHelp";

/**
 * Followed-teams settings panel. Two-step League → Team picker: choose a
 * league, then one of its teams (fetched live from the league's standings via
 * `/api/sports/catalogue`). Also lists the current followed teams with
 * move-up/down reorder + remove. All mutations go through `/api/sports/teams`
 * (add/remove/reorder/reset). Max 6 teams. Backed by `followed-teams.json`.
 *
 * Football (FotMob) + Danish hockey (Metal Ligaen) + the US majors NBA/NFL/NHL
 * (ESPN) are all pickable. The Edmonton Oilers keep their own dedicated /nhl hub
 * separately; NHL here is for following other NHL teams.
 */

interface FollowedTeam {
  slug: string;
  name: string;
  shortName: string;
  sport: "football" | "icehockey";
  leagueName: string;
  emoji: string;
  accentColor: string;
}
interface CatLeague { id: string; label: string; country: string; sport: string; emoji: string }
interface CatTeam { name: string; matchKeyword: string; fotmobTeamId?: number }

const MAX = 6;
const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

export default function TeamsSettings() {
  const [teams, setTeams] = useState<FollowedTeam[] | null>(null);
  const [leagues, setLeagues] = useState<CatLeague[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [catTeams, setCatTeams] = useState<CatTeam[] | null>(null);
  const [teamPick, setTeamPick] = useState("");
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [edmShown, setEdmShown] = useState(true);

  useEffect(() => { setEdmShown(loadShowEdm()); }, []);
  function toggleEdm() { const next = !edmShown; setEdmShown(next); setShowEdm(next); }

  useEffect(() => {
    fetch("/api/sports/teams").then((r) => r.json()).then((d) => setTeams(d.teams ?? [])).catch(() => setTeams([]));
    fetch("/api/sports/catalogue").then((r) => r.json()).then((d) => setLeagues(d.leagues ?? [])).catch(() => {});
  }, []);

  // Load a league's teams whenever the league dropdown changes.
  useEffect(() => {
    if (!leagueId) { setCatTeams(null); setTeamPick(""); return; }
    setLoadingTeams(true);
    setCatTeams(null);
    setTeamPick("");
    fetch(`/api/sports/catalogue?league=${encodeURIComponent(leagueId)}`)
      .then((r) => r.json())
      .then((d) => setCatTeams(d.teams ?? []))
      .catch(() => setCatTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [leagueId]);

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/sports/teams", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.ok) {
        setTeams(d.teams ?? []);
        return true;
      }
      setStatus(d.error || "Failed");
      return false;
    } catch (err) {
      setStatus(String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addTeam() {
    if (!leagueId || !teamPick || !catTeams) return;
    const t = catTeams.find((x) => x.name === teamPick);
    if (!t) return;
    const ok = await mutate({ action: "add", leagueId, name: t.name, matchKeyword: t.matchKeyword, fotmobTeamId: t.fotmobTeamId });
    if (ok) { setTeamPick(""); setStatus(`Added ${t.name} ✓`); }
  }

  function move(idx: number, dir: -1 | 1) {
    if (!teams) return;
    const j = idx + dir;
    if (j < 0 || j >= teams.length) return;
    const order = teams.map((t) => t.slug);
    [order[idx], order[j]] = [order[j], order[idx]];
    mutate({ action: "reorder", order });
  }

  if (!teams) return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>;

  const atMax = teams.length >= MAX;

  return (
    <div className="space-y-6">
      <PanelIntro accent="var(--accent-blue)">
        Pick the sports teams you follow — football (top-5 European leagues + Danish), Danish hockey, and NBA/NFL/NHL. Each
        gets a box on the dashboard and its own hub. Choose a league, then a team, and add up to 6. (The Edmonton Oilers
        have their own dedicated NHL hub, toggled separately below.)
      </PanelIntro>
      {/* ── Edmonton Oilers box (dedicated /nhl hub, not a followed team) ─── */}
      <section>
        <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Edmonton Oilers</h3>
        <button
          onClick={toggleEdm}
          className="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between"
          style={{ background: edmShown ? "var(--accent-blue)22" : "var(--surface-2)", color: edmShown ? "var(--accent-blue)" : "var(--text-muted)", border: `1px solid ${edmShown ? "var(--accent-blue)" : "var(--border)"}` }}
        >
          <span className="text-sm flex items-center gap-2"><span>🏒</span>Show the Oilers box in the Sports widget</span>
          <span className="text-xs">{edmShown ? "✓ shown" : "hidden"}</span>
        </button>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>EDM has its own dedicated NHL hub, so it isn&apos;t in the followed-teams list — this toggle hides its box instead.</p>
      </section>

      {/* ── Current followed teams ─────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Followed teams ({teams.length}/{MAX})</h3>
          <button
            onClick={() => mutate({ action: "reset" })}
            disabled={busy}
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >Reset to defaults</button>
        </div>
        {teams.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No teams yet — add one below.</p>
        ) : (
          <ul className="space-y-1.5">
            {teams.map((t, i) => (
              <li key={t.slug} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <span className="text-sm">{t.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium" style={{ color: t.accentColor }}>{t.name}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>{t.leagueName}</span>
                </span>
                <button onClick={() => move(i, -1)} disabled={busy || i === 0} className="text-xs px-1.5 py-0.5 rounded disabled:opacity-30" style={{ color: "var(--text-muted)" }} title="Move up">↑</button>
                <button onClick={() => move(i, 1)} disabled={busy || i === teams.length - 1} className="text-xs px-1.5 py-0.5 rounded disabled:opacity-30" style={{ color: "var(--text-muted)" }} title="Move down">↓</button>
                <button onClick={() => mutate({ action: "remove", slug: t.slug })} disabled={busy} className="text-xs px-1.5 py-0.5 rounded" style={{ color: "var(--accent-red)" }} title="Remove">✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Add a team ─────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Add a team</h3>
        {atMax ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>You&apos;re following the max of {MAX} teams. Remove one to add another.</p>
        ) : (
          <div className="space-y-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>League</label>
              <select value={leagueId} onChange={(e) => setLeagueId(e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-sm" style={inputStyle}>
                <option value="">Choose a league…</option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>{l.emoji} {l.label} · {l.country}</option>
                ))}
              </select>
            </div>
            {leagueId && (
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Team</label>
                <select
                  value={teamPick}
                  onChange={(e) => setTeamPick(e.target.value)}
                  disabled={loadingTeams || !catTeams?.length}
                  className="w-full rounded-lg px-2 py-1.5 text-sm"
                  style={inputStyle}
                >
                  <option value="">{loadingTeams ? "Loading teams…" : catTeams?.length ? "Choose a team…" : "No teams found"}</option>
                  {(catTeams ?? []).map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={addTeam}
              disabled={busy || !leagueId || !teamPick}
              className="text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-40"
              style={{ background: "var(--accent-blue)22", color: "var(--accent-blue)", border: "1px solid var(--accent-blue)" }}
            >{busy ? "Adding…" : "+ Add team"}</button>
          </div>
        )}
        {status && (
          <p className="text-xs mt-2" style={{ color: status.includes("✓") ? "var(--accent-green)" : "var(--accent-red)" }}>{status}</p>
        )}
      </section>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Football, Danish hockey, and the US majors (NBA / NFL / NHL) are all pickable. The Edmonton Oilers keep their own dedicated hub — NHL here is for following other teams.
      </p>
    </div>
  );
}
