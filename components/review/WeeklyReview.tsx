"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HubShell from "@/components/HubShell";
import { ddragonChampionIcon } from "@/lib/riot";

interface Run { date: string; distance: number; duration: number }
interface Assignment { id: number; title: string; subject: string | null; status: string; dueDate: string }
interface CalEvent { start: string; end: string; allDay: boolean }
interface NhlGame { id: number; startTimeUTC: string; gameState: string; homeTeam: { abbrev: string; score?: number }; awayTeam: { abbrev: string; score?: number } }
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
  config: { name: string; emoji: string; matchKeyword?: string };
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
    prevRuns: Run[];
    schoolDone: Assignment[];
    prevSchoolDone: Assignment[];
    schoolCompletedThisWeek: number;
    calendarHours: number;
    prevCalendarHours: number;
    lolMatches: LolMatch[];
    prevLolMatches: LolMatch[];
    topChamp: ChampAgg | null;
    sports: SportsSummary[];
    nhlGames: NhlGame[];
    dragonVersion: string;
    /** Weeks of running ≥ 20 km, counted backwards from the current week. */
    kmStreak: number;
    /** Weeks with a positive LoL W-L, counted backwards from the current week. */
    lolStreak: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const now = new Date();
      const weekStart = startOfWeek(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      // Previous 7 days: [weekStart − 7, weekStart)
      const prevStart = new Date(weekStart);
      prevStart.setDate(prevStart.getDate() - 7);

      const [runsRes, schoolRes, calRes, accountsRes, sportsRes, nhlRes] = await Promise.allSettled([
        // Widened to 200 runs so streak detection has enough history.
        fetch("/api/running?limit=200").then((r) => r.json()),
        fetch("/api/school?status=done").then((r) => r.json()),
        fetch("/api/calendar").then((r) => r.json()),
        fetch("/api/lol/account").then((r) => r.json()),
        fetch("/api/sports").then((r) => r.json()),
        fetch("/api/nhl/schedule").then((r) => r.json()),
      ]);

      const allRuns: Run[] = runsRes.status === "fulfilled" ? (runsRes.value?.runs ?? []) : [];
      const runs = allRuns.filter((r) => inThisWeek(r.date, weekStart, weekEnd));
      const prevRuns = allRuns.filter((r) => inThisWeek(r.date, prevStart, weekStart));

      const doneAssignments: Assignment[] = schoolRes.status === "fulfilled" ? (schoolRes.value?.assignments ?? []) : [];
      // Filter to assignments whose dueDate falls in the week — proxy for "completed this week".
      const schoolDone = doneAssignments.filter((a) => inThisWeek(a.dueDate, weekStart, weekEnd));
      const prevSchoolDone = doneAssignments.filter((a) => inThisWeek(a.dueDate, prevStart, weekStart));

      const events: CalEvent[] = calRes.status === "fulfilled" ? (calRes.value?.events ?? []) : [];
      let calendarHours = 0;
      let prevCalendarHours = 0;
      for (const e of events) {
        if (e.allDay) continue;
        const s = new Date(e.start).getTime();
        const en = new Date(e.end).getTime();
        if (!isFinite(s) || !isFinite(en)) continue;
        calendarHours += Math.max(0, Math.min(en, weekEnd.getTime()) - Math.max(s, weekStart.getTime())) / 3600000;
        prevCalendarHours += Math.max(0, Math.min(en, weekStart.getTime()) - Math.max(s, prevStart.getTime())) / 3600000;
      }

      // LoL: only the main account (Swimmingfizz) counts for the weekly review —
      // pooling smurfs conflates play sessions that shouldn't be summarised
      // together. Falls back to nothing if the account isn't present.
      const allAccounts: LolAccount[] = accountsRes.status === "fulfilled" ? (accountsRes.value?.accounts ?? []) : [];
      const accounts = allAccounts.filter(
        (a) => a.gameName.toLowerCase() === "swimmingfizz"
      );
      // Widened to 100 matches so both current and previous windows have data.
      const lolResults = await Promise.allSettled(
        accounts.map((a) => fetch(`/api/lol/summary?accountId=${a.id}&count=100`).then((r) => r.json() as Promise<LolSummary>))
      );
      const lolMatches: LolMatch[] = [];
      const prevLolMatches: LolMatch[] = [];
      const allLolMatches: LolMatch[] = [];
      let dragonVersion = "";
      for (const r of lolResults) {
        if (r.status !== "fulfilled" || !r.value?.matches) continue;
        dragonVersion = r.value.dragonVersion || dragonVersion;
        for (const m of r.value.matches) {
          allLolMatches.push(m);
          if (inThisWeek(m.gameCreation, weekStart, weekEnd)) lolMatches.push(m);
          else if (inThisWeek(m.gameCreation, prevStart, weekStart)) prevLolMatches.push(m);
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

      const nhlRecent: NhlGame[] = nhlRes.status === "fulfilled" ? (nhlRes.value?.recent ?? []) : [];
      const nhlGames = nhlRecent.filter((g) => inThisWeek(g.startTimeUTC, weekStart, weekEnd));

      // Streak: count backwards from the current 7-day window as long as the
      // km-in-window is ≥ 20 km. Stops at the first miss. Cap at 26 weeks
      // (half a year) so long streaks don't require huge history.
      const KM_TARGET = 20;
      let kmStreak = 0;
      for (let i = 0; i < 26; i++) {
        const wStart = new Date(weekStart);
        wStart.setDate(wStart.getDate() - 7 * i);
        const wEnd = new Date(wStart);
        wEnd.setDate(wEnd.getDate() + 7);
        const km = allRuns.filter((r) => inThisWeek(r.date, wStart, wEnd)).reduce((s, r) => s + r.distance, 0);
        if (km >= KM_TARGET) kmStreak++;
        else break;
      }

      // LoL streak: consecutive weeks with more wins than losses (remakes ignored).
      let lolStreak = 0;
      for (let i = 0; i < 26; i++) {
        const wStart = new Date(weekStart);
        wStart.setDate(wStart.getDate() - 7 * i);
        const wEnd = new Date(wStart);
        wEnd.setDate(wEnd.getDate() + 7);
        const wk = allLolMatches.filter((m) => inThisWeek(m.gameCreation, wStart, wEnd));
        const w = wk.filter((m) => m.me?.win && !m.me?.gameEndedInEarlySurrender).length;
        const l = wk.filter((m) => m.me && !m.me.win && !m.me.gameEndedInEarlySurrender).length;
        if (w + l === 0) break; // no games — break the streak
        if (w > l) lolStreak++;
        else break;
      }

      if (!cancelled) {
        setData({
          weekStart, weekEnd,
          runs, prevRuns,
          schoolDone, prevSchoolDone, schoolCompletedThisWeek: schoolDone.length,
          calendarHours, prevCalendarHours,
          lolMatches, prevLolMatches, topChamp,
          sports: sportsSummaries,
          nhlGames,
          dragonVersion,
          kmStreak, lolStreak,
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

  const { weekStart, weekEnd, runs, prevRuns, schoolDone, prevSchoolDone, calendarHours, prevCalendarHours, lolMatches, prevLolMatches, topChamp, sports, nhlGames, dragonVersion, kmStreak, lolStreak } = data;
  const kmThisWeek = runs.reduce((s, r) => s + r.distance, 0);
  const kmPrev = prevRuns.reduce((s, r) => s + r.distance, 0);
  const runsSecs = runs.reduce((s, r) => s + r.duration, 0);
  const prevRunsSecs = prevRuns.reduce((s, r) => s + r.duration, 0);
  const lolWins = lolMatches.filter((m) => m.me?.win && !m.me?.gameEndedInEarlySurrender).length;
  const lolLosses = lolMatches.filter((m) => m.me && !m.me.win && !m.me.gameEndedInEarlySurrender).length;
  const lolRemakes = lolMatches.filter((m) => m.me?.gameEndedInEarlySurrender).length;
  const totalLolGames = lolWins + lolLosses;
  const lolWr = totalLolGames > 0 ? Math.round((lolWins / totalLolGames) * 100) : 0;
  const prevLolWins = prevLolMatches.filter((m) => m.me?.win && !m.me?.gameEndedInEarlySurrender).length;
  const prevLolLosses = prevLolMatches.filter((m) => m.me && !m.me.win && !m.me.gameEndedInEarlySurrender).length;
  const prevLolTotal = prevLolWins + prevLolLosses;
  const prevLolWr = prevLolTotal > 0 ? Math.round((prevLolWins / prevLolTotal) * 100) : 0;

  const weekLabel = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(weekEnd.getTime() - 1).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

  return (
    <HubShell title={title} emoji="🗓️" color="var(--accent-cyan)">
      <div className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
        {weekLabel}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>

        {/* Running */}
        <Section title="🏃 Running" href="/running">
          <StatRow
            label="Distance"
            value={`${kmThisWeek.toFixed(1)} km`}
            sub={`in ${runs.length} run${runs.length === 1 ? "" : "s"}`}
            delta={{ current: kmThisWeek, previous: kmPrev, unit: " km" }}
          />
          <StatRow
            label="Time spent"
            value={formatHMS(runsSecs)}
            delta={{ current: Math.round(runsSecs / 60), previous: Math.round(prevRunsSecs / 60), unit: "m", decimals: 0 }}
          />
          {kmStreak >= 2 && (
            <div className="mt-2 text-xs" style={{ color: "var(--accent-orange)" }}>
              🔥 {kmStreak} weeks in a row over 20 km
            </div>
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
                delta={prevLolTotal > 0 ? { current: lolWr, previous: prevLolWr, unit: "%", decimals: 0 } : undefined}
              />
              {lolStreak >= 2 && (
                <div className="mt-2 text-xs" style={{ color: "var(--accent-green)" }}>
                  🔥 {lolStreak} winning weeks in a row
                </div>
              )}
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
          <StatRow
            label="Completed"
            value={String(schoolDone.length)}
            sub={schoolDone.length === 1 ? "assignment" : "assignments"}
            delta={{ current: schoolDone.length, previous: prevSchoolDone.length, decimals: 0 }}
          />
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
          <StatRow
            label="Booked"
            value={`${calendarHours.toFixed(1)}h`}
            sub="of non-all-day events"
            delta={{ current: calendarHours, previous: prevCalendarHours, unit: "h", higherIsBetter: false }}
          />
        </Section>

        {/* Sports */}
        <Section title="🏆 Followed teams" href="/">
          <ul className="space-y-2 text-sm">
            {/* EDM (NHL) — W-L record across this week's games (matches the
                aggregate style used for the football/hockey teams below). */}
            {(() => {
              let ew = 0, el = 0;
              for (const g of nhlGames) {
                const isHomeUs = g.homeTeam.abbrev === "EDM";
                const us = isHomeUs ? g.homeTeam.score : g.awayTeam.score;
                const them = isHomeUs ? g.awayTeam.score : g.homeTeam.score;
                if (us == null || them == null) continue;
                if (us > them) ew++;
                else if (us < them) el++;
              }
              const total = ew + el;
              const c = ew > el ? "var(--accent-green)" : el > ew ? "var(--accent-red)" : "var(--text-muted)";
              return (
                <li className="flex items-center gap-2">
                  <span>🏒</span>
                  <span className="truncate">Edmonton Oilers</span>
                  <span className="ml-auto text-xs" style={{ color: total === 0 ? "var(--text-muted)" : c, fontWeight: total === 0 ? 400 : 600 }}>
                    {total === 0 ? "no matches" : `${ew}W ${el}L`}
                  </span>
                </li>
              );
            })()}

            {sports.map((s) => {
              // Aggregate the team's record over the current 7-day window —
              // simpler than showing every individual match and matches the
              // "how did they do this week?" framing. A match counts as
              // played when either `finished` is set OR both scores are
              // non-null (FotMob is slow to flip `finished` for a few hours
              // after full time). matchKeyword identifies which side is us.
              const key = (s.config.matchKeyword ?? s.config.name?.split(" ")[0] ?? "").toLowerCase();
              let wins = 0, draws = 0, losses = 0;
              for (const m of s.last5) {
                if (!m.date) continue;
                if (!inThisWeek(m.date, weekStart, weekEnd)) continue;
                const played = m.finished || (m.homeScore != null && m.awayScore != null);
                if (!played) continue;
                const isHomeUs = m.homeTeam.toLowerCase().includes(key);
                const us = isHomeUs ? m.homeScore : m.awayScore;
                const them = isHomeUs ? m.awayScore : m.homeScore;
                if (us == null || them == null) continue;
                if (us > them) wins++;
                else if (us < them) losses++;
                else draws++;
              }
              const total = wins + draws + losses;
              const recordColor = wins > losses ? "var(--accent-green)"
                : losses > wins ? "var(--accent-red)"
                : "var(--text-muted)";
              return (
                <li key={s.slug} className="flex items-center gap-2">
                  <span>{s.config.emoji}</span>
                  <span className="truncate">{s.config.name}</span>
                  <span className="ml-auto text-xs" style={{ color: total === 0 ? "var(--text-muted)" : recordColor, fontWeight: total === 0 ? 400 : 600 }}>
                    {total === 0 ? "no matches" : `${wins}W ${draws}D ${losses}L`}
                  </span>
                </li>
              );
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

function StatRow({ label, value, sub, valueColor, delta }: { label: string; value: string; sub?: string; valueColor?: string; delta?: { current: number; previous: number; unit?: string; higherIsBetter?: boolean; decimals?: number } }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs uppercase tracking-wide flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        {label}
        {delta && <DeltaBadge {...delta} />}
      </span>
      <span className="text-lg font-bold" style={{ color: valueColor ?? "var(--text)" }}>
        {value} {sub && <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>· {sub}</span>}
      </span>
    </div>
  );
}

/** ▲/▼ delta pill vs the previous 7-day window. Muted when the diff is
 *  negligible or when the previous window had zero data (no baseline). */
function DeltaBadge({ current, previous, unit = "", higherIsBetter = true, decimals = 1 }: { current: number; previous: number; unit?: string; higherIsBetter?: boolean; decimals?: number }) {
  const diff = current - previous;
  const abs = Math.abs(diff);
  const epsilon = Math.pow(10, -decimals) / 2;
  if (previous === 0 && current === 0) return null;
  if (abs < epsilon) return (
    <span className="text-[10px] px-1 rounded" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>=</span>
  );
  const isUp = diff > 0;
  const isGood = isUp === higherIsBetter;
  const color = isGood ? "var(--accent-green)" : "var(--accent-red)";
  return (
    <span
      className="text-[10px] px-1 rounded tabular-nums"
      style={{ color, background: `${color}22` }}
      title={`vs previous 7 days (${previous.toFixed(decimals)}${unit})`}
    >
      {isUp ? "▲" : "▼"} {abs.toFixed(decimals)}{unit}
    </span>
  );
}
