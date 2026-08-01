"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface CalEvent { uid: string; title: string; start: string; end: string; allDay: boolean; calendar: string }
interface SportsSummary {
  slug: string;
  config: { emoji?: string; shortName?: string; name?: string };
  next5: Array<{ date: string; time: string; homeTeam: string; awayTeam: string; finished: boolean; matchId?: string | null }>;
}
interface Assignment { id: number; title: string; dueDate: string; dueTime: string | null; status: string; subject: string | null }
interface RunPlan { date: string; type: string; distance: number | null; notes: string | null }

const SPORT_HREF: Record<string, string> = {
  edmonton: "/nhl",
  "esbjerg-fb": "/sports/esbjerg-fb",
  barcelona: "/sports/barcelona",
  "esbjerg-energy": "/sports/esbjerg-energy",
};

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatCountdown(ms: number): string {
  if (ms < 0) return "now";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min - h * 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h - d * 24}h`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

interface Item {
  key: string;
  emoji: string;
  label: string;
  detail: string;
  meta?: string;
  href: string;
  color: string;
}

export default function TodayBriefing() {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const [calRes, sportsRes, nhlRes, runRes, schoolRes] = await Promise.allSettled([
        fetch("/api/calendar").then((r) => r.json()),
        fetch("/api/sports").then((r) => r.json()),
        fetch("/api/nhl/schedule").then((r) => r.json()),
        fetch("/api/running/summary").then((r) => r.json()),
        fetch("/api/school?status=pending,in_progress,overdue").then((r) => r.json()),
      ]);

      const out: Item[] = [];

      // 1. Every calendar event that lands on today's local calendar day —
      // one row per event. No fallback to tomorrow: if today is empty, the
      // calendar slot simply doesn't render.
      if (calRes.status === "fulfilled") {
        const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);
        const todaysEvents: CalEvent[] = (calRes.value?.events ?? [])
          .filter((e: CalEvent) => {
            const s = new Date(e.start).getTime();
            const en = new Date(e.end).getTime();
            if (!isFinite(s) || !isFinite(en)) return false;
            // Event overlaps today if it starts before end-of-today AND ends after start-of-today.
            return s < endOfToday.getTime() && en > startOfToday.getTime();
          })
          .sort((a: CalEvent, b: CalEvent) => {
            // All-day items first, then by start time.
            if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
            return new Date(a.start).getTime() - new Date(b.start).getTime();
          });

        if (todaysEvents.length === 1) {
          const ev = todaysEvents[0];
          const evStart = new Date(ev.start);
          const startsIn = evStart.getTime() - now.getTime();
          out.push({
            key: `cal-${ev.uid}`,
            emoji: "📅",
            label: "Today",
            detail: ev.title,
            meta: ev.allDay
              ? "all day"
              : startsIn > 0
                ? `${formatTime(ev.start)} · in ${formatCountdown(startsIn)}`
                : `${formatTime(ev.start)} · started`,
            href: "/calendar",
            color: "var(--accent-pink)",
          });
        } else if (todaysEvents.length > 1) {
          // Multiple events — collapse into a single box. Primary line = first
          // event's title; meta line lists the rest with times separated by " · ".
          const first = todaysEvents[0];
          const firstStart = new Date(first.start);
          const firstStartsIn = firstStart.getTime() - now.getTime();
          const firstMeta = first.allDay
            ? "all day"
            : firstStartsIn > 0
              ? `${formatTime(first.start)} · in ${formatCountdown(firstStartsIn)}`
              : `${formatTime(first.start)} · started`;
          const rest = todaysEvents.slice(1).map((ev) => {
            const t = ev.allDay ? "all day" : formatTime(ev.start);
            return `${t} ${ev.title}`;
          }).join(" · ");
          out.push({
            key: "cal-today",
            emoji: "📅",
            label: `Today · ${todaysEvents.length} events`,
            detail: first.title,
            meta: `${firstMeta} — then ${rest}`,
            href: "/calendar",
            color: "var(--accent-pink)",
          });
        }
      }

      // 2. Tracked matches — show if kickoff is today (local day) or within the
      // next 24h. Also include matches that already kicked off today but aren't
      // finished yet (previous rule dropped them the moment kickoff passed).
      if (sportsRes.status === "fulfilled") {
        const summaries: SportsSummary[] = sportsRes.value?.summaries ?? [];
        for (const s of summaries) {
          const upcoming = (s.next5 ?? []).find((m) => {
            if (m.finished) return false;
            const t = matchStart(m.date, m.time);
            if (!t) return false;
            return isSameLocalDay(t, now) || (t.getTime() >= now.getTime() && t.getTime() <= in24h.getTime());
          });
          if (upcoming) {
            const t = matchStart(upcoming.date, upcoming.time)!;
            const startsIn = t.getTime() - now.getTime();
            out.push({
              key: `sport-${s.slug}`,
              emoji: s.config.emoji ?? "🏆",
              label: s.config.shortName ?? s.config.name ?? s.slug,
              detail: `${upcoming.homeTeam} vs ${upcoming.awayTeam}`,
              meta: startsIn >= 0
                ? `${formatTime(t.toISOString())} · in ${formatCountdown(startsIn)}`
                : `${formatTime(t.toISOString())} · started`,
              href: SPORT_HREF[s.slug] ?? "/",
              color: "var(--accent-orange)",
            });
          }
        }
      }

      // 2b. EDM (NHL) — separate endpoint. Same rule: today OR within 24h.
      if (nhlRes.status === "fulfilled") {
        const next = nhlRes.value?.next as { startTimeUTC?: string; homeTeam?: { abbrev?: string }; awayTeam?: { abbrev?: string } } | null;
        if (next?.startTimeUTC) {
          const t = new Date(next.startTimeUTC);
          if (isSameLocalDay(t, now) || (t.getTime() >= now.getTime() && t.getTime() <= in24h.getTime())) {
            const startsIn = t.getTime() - now.getTime();
            out.push({
              key: "sport-edm",
              emoji: "🏒",
              label: "EDM",
              detail: `${next.awayTeam?.abbrev ?? "?"} @ ${next.homeTeam?.abbrev ?? "?"}`,
              meta: startsIn >= 0
                ? `${formatTime(next.startTimeUTC)} · in ${formatCountdown(startsIn)}`
                : `${formatTime(next.startTimeUTC)} · started`,
              href: "/nhl",
              color: "var(--accent-orange)",
            });
          }
        }
      }

      // 3. Today's run plan
      if (runRes.status === "fulfilled") {
        const plans: RunPlan[] = runRes.value?.upcomingPlans ?? [];
        const today = plans.find((p) => isSameLocalDay(new Date(p.date), now));
        if (today) {
          const label = today.type === "rest" ? "Rest day" : `${today.type[0].toUpperCase()}${today.type.slice(1)} run`;
          const detail = today.distance ? `${today.distance.toFixed(1)} km` : today.type === "rest" ? "recovery" : "planned";
          out.push({
            key: "run",
            emoji: today.type === "rest" ? "😴" : "🏃",
            label: "Today's run",
            detail: label,
            meta: today.notes ?? detail,
            href: "/running",
            color: "var(--accent-green)",
          });
        }
      }

      // 4. Next school deadline within 7 days
      if (schoolRes.status === "fulfilled") {
        const assignments: Assignment[] = schoolRes.value?.assignments ?? [];
        const in7d = new Date(now.getTime() + 7 * 86400000);
        const soonest = assignments
          .filter((a) => a.status !== "done")
          .map((a) => ({ a, due: new Date(a.dueDate) }))
          .filter(({ due }) => due.getTime() <= in7d.getTime())
          .sort((x, y) => x.due.getTime() - y.due.getTime())[0];
        if (soonest) {
          const startsIn = soonest.due.getTime() - now.getTime();
          const overdue = soonest.a.status === "overdue" || startsIn < 0;
          out.push({
            key: "school",
            emoji: overdue ? "🚨" : "📚",
            label: soonest.a.subject ?? "School",
            detail: soonest.a.title,
            meta: overdue ? "overdue" : `due in ${formatCountdown(startsIn)}`,
            href: "/school",
            color: overdue ? "var(--accent-red)" : "var(--accent-indigo)",
          });
        }
      }

      if (!cancelled) setItems(out);
    }

    load();
    // Re-run every 5 min so countdowns and next events stay fresh.
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  if (items === null) return null; // silent while loading
  if (items.length === 0) return null; // collapse entirely when there's nothing to say

  return (
    <div
      className="mb-4 rounded-2xl px-4 py-3 flex items-stretch gap-3 flex-wrap"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center pr-3" style={{ borderRight: "1px solid var(--border)" }}>
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Today</div>
          <div className="text-sm font-semibold">
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </div>
        </div>
      </div>
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          className="flex items-center gap-3 rounded-xl px-3 py-2 flex-1 min-w-[220px] hover:brightness-110"
          style={{ background: "var(--surface-2)", border: `1px solid ${it.color}44` }}
          title={it.detail}
        >
          <span className="text-xl">{it.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wide" style={{ color: it.color }}>{it.label}</div>
            <div className="text-sm font-semibold truncate">{it.detail}</div>
            {it.meta && <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{it.meta}</div>}
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Build a match kickoff Date from date (YYYY-MM-DD) + time (HH:MM), local timezone. */
function matchStart(date: string, time: string): Date | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  const local = new Date(y, m - 1, d, hh || 0, mm || 0);
  return isNaN(local.getTime()) ? null : local;
}
