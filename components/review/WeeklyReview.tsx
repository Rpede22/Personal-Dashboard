"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HubShell from "@/components/HubShell";
import { ddragonChampionIcon } from "@/lib/riot";

interface Run { date: string; distance: number; duration: number }
interface RunPlan { date: string; distance: number | null; type: string }
interface Assignment { id: number; title: string; subject: string | null; status: string; dueDate: string }
interface CalEvent { start: string; end: string; allDay: boolean }
interface LolAccount { id: number; gameName: string; tagLine: string; region: string }
interface LolMatch {
  gameCreation: number;
  gameDuration: number;
  queueId: number;
  me: {
    win: boolean;
    championName: string;
    kills: number;
    deaths: number;
    assists: number;
    gameEndedInEarlySurrender?: boolean;
  } | null;
}
interface LolSummary { matches: LolMatch[]; dragonVersion: string }

interface SportsSummary {
  slug: string;
  config: { name: string; emoji: string };
  last5: Array<{ date: string; homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null; finished: boolean }>;
}

interface ChampAgg { name: string; games: number; wins: number; kills: number; deaths: number; assists: number }

/** Start of the rolling 7-day window: midnight, 6 days ago (so today is
 *  included as day 7). Was Monday-anchored — switched to rolling so the
 *  review page is useful any day of the week. */
function startOfWeek(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  c.setDate(c.getDate() - 6);
  return c;
}

function inThisWeek(iso: string | number, weekStart: Date, weekEnd: Date): boolean {
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  return t >= weekStart.getTime() && t < weekEnd.getTime();
}

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function WeeklyReview() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    weekStart: Date;
    weekEnd: Date;
    runs: Run[];
    plans: RunPlan[];
    schoolDone: Assignment[];
    schoolCompletedThisWeek: number;
    calendarHours: number;
    lolMatches: LolMatch[];
    topChamp: ChampAgg | null;
    sports: SportsSummary[];
    dragonVersion: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const now = new Date();
      const weekStart = startOfWeek(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const [runsRes, sumRes, schoolRes, calRes, accountsRes, sportsRes] = await Promise.allSettled([
        fetch("/api/running?limit=50").then((r) => r.json()),
        fetch("/api/running/summary").then((r) => r.json()),
        fetch("/api/school?status=done").then((r) => r.json()),
        fetch("/api/calendar").then((r) => r.json()),
        fetch("/api/lol/account").then((r) => r.json()),
        fetch("/api/sports").then((r) => r.json()),
      ]);

      const allRuns: Run[] = runsRes.status === "fulfilled" ? (runsRes.value?.runs ?? []) : [];
      const runs = allRuns.filter((r) => inThisWeek(r.date, weekStart, weekEnd));

      const plans: RunPlan[] = sumRes.status === "fulfilled" ? (sumRes.value?.upcomingPlans ?? []) : [];
      const weekPlans = plans.filter((p) => inThisWeek(p.date, weekStart, weekEnd));

      const doneAssignments: Assignment[] = schoolRes.status === "fulfilled" ? (schoolRes.value?.assignments ?? []) : [];
      // Filter to assignments whose dueDate falls in the week — proxy for "completed this week".
      const schoolDone = doneAssignments.filter((a) => inThisWeek(a.dueDate, weekStart, weekEnd));

      const events: CalEvent[] = calRes.status === "fulfilled" ? (calRes.value?.events ?? []) : [];
      let calendarHours = 0;
      for (const e of events) {
        if (e.allDay) continue;
        const s = new Date(e.start).getTime();
        const en = new Date(e.end).getTime();
        if (!isFinite(s) || !isFinite(en)) continue;
        const overlap = Math.max(0, Math.min(en, weekEnd.getTime()) - Math.max(s, weekStart.getTime()));
        calendarHours += overlap / 3600000;
      }

      // LoL: only the main account (Swimmingfizz) counts for the weekly review —
      // pooling smurfs conflates play sessions that shouldn't be summarised
      // together. Falls back to nothing if the account isn't present.
      const allAccounts: LolAccount[] = accountsRes.status === "fulfilled" ? (accountsRes.value?.accounts ?? []) : [];
      const accounts = allAccounts.filter(
        (a) => a.gameName.toLowerCase() === "swimmingfizz"
      );
      const lolResults = await Promise.allSettled(
        accounts.map((a) => fetch(`/api/lol/summary?accountId=${a.id}&count=30`).then((r) => r.json() as Promise<LolSummary>))
      );
      const lolMatches: LolMatch[] = [];
      let dragonVersion = "";
      for (const r of lolResults) {
        if (r.status !== "fulfilled" || !r.value?.matches) continue;
        dragonVersion = r.value.dragonVersion || dragonVersion;
        for (const m of r.value.matches) {
          if (inThisWeek(m.gameCreation, weekStart, weekEnd)) lolMatches.push(m);
        }
      }

      // Top champion by wins (games as tiebreak), excluding remakes.
      const byChamp = new Map<string, ChampAgg>();
      for (const m of lolMatches) {
        if (!m.me || m.me.gameEndedInEarlySurrender) continue;
        const c = m.me;
        const cur = byChamp.get(c.championName) ?? { name: c.championName, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
        cur.games++;
        if (c.win) cur.wins++;
        cur.kills += c.kills;
        cur.deaths += c.deaths;
        cur.assists += c.assists;
        byChamp.set(c.championName, cur);
      }
      let topChamp: ChampAgg | null = null;
      for (const c of byChamp.values()) {
        if (!topChamp || c.wins > topChamp.wins || (c.wins === topChamp.wins && c.games > topChamp.games)) topChamp = c;
      }

      const sportsSummaries: SportsSummary[] = sportsRes.status === "fulfilled" ? (sportsRes.value?.summaries ?? []) : [];

      if (!cancelled) {
        setData({
          weekStart, weekEnd,
          runs, plans: weekPlans,
          schoolDone, schoolCompletedThisWeek: schoolDone.length,
          calendarHours, lolMatches, topChamp,
          sports: sportsSummaries,
          dragonVersion,
        });
        setLoading(false);
      }
    }
    load();
  }, []);

  const title = "Last 7 days review";

  if (loading || !data) {
    return (
      <HubShell title={title} emoji="🗓️" color="var(--accent-cyan)">
        <div style={{ color: "var(--text-muted)" }}>Building the review…</div>
      </HubShell>
    );
  }

  const { weekStart, weekEnd, runs, plans, schoolDone, calendarHours, lolMatches, topChamp, sports, dragonVersion } = data;
  const kmThisWeek = runs.reduce((s, r) => s + r.distance, 0);
  const kmPlanned = plans.reduce((s, p) => s + (p.distance ?? 0), 0);
  const runsSecs = runs.reduce((s, r) => s + r.duration, 0);
  const lolWins = lolMatches.filter((m) => m.me?.win && !m.me?.gameEndedInEarlySurrender).length;
  const lolLosses = lolMatches.filter((m) => m.me && !m.me.win && !m.me.gameEndedInEarlySurrender).length;
  const lolRemakes = lolMatches.filter((m) => m.me?.gameEndedInEarlySurrender).length;
  const totalLolGames = lolWins + lolLosses;
  const lolWr = totalLolGames > 0 ? Math.round((lolWins / totalLolGames) * 100) : 0;

  const weekLabel = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(weekEnd.getTime() - 1).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

  const kmDeltaColor = kmPlanned > 0
    ? kmThisWeek >= kmPlanned ? "var(--accent-green)" : "var(--accent-orange)"
    : "var(--text-muted)";

  return (
    <HubShell title={title} emoji="🗓️" color="var(--accent-cyan)">
      <div className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
        {weekLabel}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>

        {/* Running */}
        <Section title="🏃 Running" href="/running">
          <StatRow label="Distance" value={`${kmThisWeek.toFixed(1)} km`} sub={`in ${runs.length} run${runs.length === 1 ? "" : "s"}`} />
          <StatRow label="Time" value={formatHMS(runsSecs)} />
          {kmPlanned > 0 ? (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-xs mb-1">
                <span style={{ color: "var(--text-muted)" }}>Planned {kmPlanned.toFixed(1)} km</span>
                <span style={{ color: kmDeltaColor }}>
                  {kmThisWeek >= kmPlanned ? "+" : ""}{(kmThisWeek - kmPlanned).toFixed(1)} km
                </span>
              </div>
              <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "var(--surface-2)" }}>
                <div style={{ width: `${Math.min(150, (kmThisWeek / kmPlanned) * 100)}%`, height: "100%", background: kmDeltaColor }} />
              </div>
            </div>
          ) : (
            <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>No plan set for this week.</div>
          )}
        </Section>

        {/* LoL */}
        <Section title="⚔️ League of Legends" href="/lol">
          {totalLolGames === 0 && lolRemakes === 0 ? (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>No matches played this week.</div>
          ) : (
            <>
              <StatRow
                label="Record"
                value={`${lolWins}W ${lolLosses}L`}
                sub={`${lolWr}% WR${lolRemakes > 0 ? ` · ${lolRemakes}R` : ""}`}
                valueColor={lolWr >= 55 ? "var(--accent-green)" : lolWr < 45 ? "var(--accent-red)" : undefined}
              />
              {topChamp && (
                <div className="mt-3 flex items-center gap-3 rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
                  {dragonVersion && (
                    <img
                      src={ddragonChampionIcon(dragonVersion, topChamp.name)}
                      width={40} height={40}
                      alt={topChamp.name}
                      style={{ borderRadius: 6 }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Top champion</div>
                    <div className="text-sm font-semibold">{topChamp.name}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {topChamp.games}G · {topChamp.wins}W · {(topChamp.kills / Math.max(1, topChamp.games)).toFixed(1)}/{(topChamp.deaths / Math.max(1, topChamp.games)).toFixed(1)}/{(topChamp.assists / Math.max(1, topChamp.games)).toFixed(1)}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </Section>

        {/* School */}
        <Section title="📚 School" href="/school">
          <StatRow label="Completed" value={String(schoolDone.length)} sub={schoolDone.length === 1 ? "assignment" : "assignments"} />
          {schoolDone.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {schoolDone.slice(0, 5).map((a) => (
                <li key={a.id} className="truncate" style={{ color: "var(--text-muted)" }}>
                  <span style={{ color: "var(--text)" }}>{a.title}</span>{a.subject ? ` · ${a.subject}` : ""}
                </li>
              ))}
              {schoolDone.length > 5 && (
                <li className="text-xs" style={{ color: "var(--text-muted)" }}>…and {schoolDone.length - 5} more</li>
              )}
            </ul>
          )}
        </Section>

        {/* Calendar */}
        <Section title="📅 Calendar" href="/calendar">
          <StatRow label="Booked" value={`${calendarHours.toFixed(1)}h`} sub="of non-all-day events" />
        </Section>

        {/* Sports */}
        <Section title="🏆 Followed teams" href="/">
          <ul className="space-y-2 text-sm">
            {sports.map((s) => {
              const weekMatches = s.last5.filter((m) => m.finished && inThisWeek(m.date, weekStart, weekEnd));
              if (weekMatches.length === 0) {
                return (
                  <li key={s.slug} className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
                    <span>{s.config.emoji}</span><span>{s.config.name}</span><span className="ml-auto text-xs">—</span>
                  </li>
                );
              }
              return weekMatches.map((m, i) => {
                const isHomeUs = m.homeTeam.toLowerCase().includes((s.config.name ?? "").split(" ")[0].toLowerCase());
                const us = isHomeUs ? m.homeScore : m.awayScore;
                const them = isHomeUs ? m.awayScore : m.homeScore;
                const opp = isHomeUs ? m.awayTeam : m.homeTeam;
                const w = us !== null && them !== null && us > them;
                const l = us !== null && them !== null && us < them;
                const color = w ? "var(--accent-green)" : l ? "var(--accent-red)" : "var(--text-muted)";
                return (
                  <li key={`${s.slug}-${i}`} className="flex items-center gap-2">
                    <span>{s.config.emoji}</span>
                    <span className="truncate">{opp}</span>
                    <span className="ml-auto font-semibold" style={{ color }}>{us ?? "-"}–{them ?? "-"}</span>
                  </li>
                );
              });
            })}
          </ul>
        </Section>
      </div>
    </HubShell>
  );
}

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  const inner = (
    <div
      className="rounded-2xl p-4 h-full"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="text-sm font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
  return href ? <Link href={href} className="block hover:brightness-110">{inner}</Link> : inner;
}

function StatRow({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-lg font-bold" style={{ color: valueColor ?? "var(--text)" }}>
        {value} {sub && <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>· {sub}</span>}
      </span>
    </div>
  );
}
