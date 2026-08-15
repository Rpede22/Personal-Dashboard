"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import WeatherLine from "@/components/dashboard/WeatherLine";

/** Kind of a briefing row — used as the persistence key for reordering.
 *  `cal` covers both single-event and collapsed-multi rows since only one
 *  cal row ever renders at a time. Sport rows are grouped by slug so
 *  each followed team can be reordered independently. */
type ItemKind = "cal" | "sport" | "run" | "school" | "media";

const ORDER_KEY = "dashboard.today.order";
const DEFAULT_ORDER: ItemKind[] = ["cal", "sport", "run", "school", "media"];

function loadOrder(): ItemKind[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw) as ItemKind[];
    const known = new Set<ItemKind>(DEFAULT_ORDER);
    const kept = parsed.filter((k): k is ItemKind => known.has(k as ItemKind));
    for (const k of DEFAULT_ORDER) if (!kept.includes(k)) kept.push(k);
    return kept;
  } catch { return DEFAULT_ORDER; }
}

function itemKind(key: string): ItemKind {
  if (key.startsWith("cal")) return "cal";
  if (key.startsWith("sport")) return "sport";
  if (key === "run") return "run";
  if (key === "media") return "media";
  return "school";
}

interface CalEvent { uid: string; title: string; start: string; end: string; allDay: boolean; calendar: string }
interface SportsSummary {
  slug: string;
  config: { emoji?: string; shortName?: string; name?: string; matchKeyword?: string };
  next5: Array<{ date: string; time: string; homeTeam: string; awayTeam: string; finished: boolean; matchId?: string | null }>;
  last5: Array<{ date: string; time: string; homeTeam: string; awayTeam: string; finished: boolean; homeScore: number | null; awayScore: number | null }>;
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
  const [order, setOrder] = useState<ItemKind[]>(DEFAULT_ORDER);
  const [dragKind, setDragKind] = useState<ItemKind | null>(null);
  const [hoverKind, setHoverKind] = useState<ItemKind | null>(null);

  useEffect(() => { setOrder(loadOrder()); }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* ignore */ }
  }, [order]);

  function swap(from: ItemKind, to: ItemKind) {
    if (from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const iF = next.indexOf(from);
      const iT = next.indexOf(to);
      if (iF < 0 || iT < 0) return prev;
      [next[iF], next[iT]] = [next[iT], next[iF]];
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const now = new Date();

      const [calRes, sportsRes, nhlRes, runRes, schoolRes, mediaRes] = await Promise.allSettled([
        fetch("/api/calendar").then((r) => r.json()),
        fetch("/api/sports").then((r) => r.json()),
        fetch("/api/nhl/schedule").then((r) => r.json()),
        fetch("/api/running/summary").then((r) => r.json()),
        fetch("/api/school?status=pending,in_progress,overdue").then((r) => r.json()),
        fetch("/api/media").then((r) => r.json()),
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

      // 2. Tracked matches — same local day only. First check for a match
      // played earlier today (last5 has the score); if none, check upcoming
      // fixtures today so pre-match countdowns still surface.
      if (sportsRes.status === "fulfilled") {
        const summaries: SportsSummary[] = sportsRes.value?.summaries ?? [];
        for (const s of summaries) {
          // Finished-today match: prefer this so the box swaps from countdown
          // to result the moment the full-time whistle lands. FotMob can lag
          // a few hours on `finished`, so treat "both scores non-null" as
          // also finished.
          const played = (s.last5 ?? []).find((m) => {
            if (!m.date) return false;
            const t = matchStart(m.date, m.time);
            if (!t || !isSameLocalDay(t, now)) return false;
            return m.finished || (m.homeScore != null && m.awayScore != null);
          });
          if (played) {
            const key = (s.config.matchKeyword ?? s.config.name?.split(" ")[0] ?? "").toLowerCase();
            const isHomeUs = played.homeTeam.toLowerCase().includes(key);
            const us = isHomeUs ? played.homeScore : played.awayScore;
            const them = isHomeUs ? played.awayScore : played.homeScore;
            const opp = isHomeUs ? played.awayTeam : played.homeTeam;
            const outcome = us != null && them != null && us > them ? "W"
              : us != null && them != null && us < them ? "L"
              : "D";
            const color = outcome === "W" ? "var(--accent-green)"
              : outcome === "L" ? "var(--accent-red)"
              : "var(--text-muted)";
            out.push({
              key: `sport-${s.slug}`,
              emoji: s.config.emoji ?? "🏆",
              label: s.config.shortName ?? s.config.name ?? s.slug,
              detail: `${us ?? "-"}–${them ?? "-"} vs ${opp}`,
              meta: outcome === "W" ? "won today" : outcome === "L" ? "lost today" : "drew today",
              href: SPORT_HREF[s.slug] ?? "/",
              color,
            });
            continue;
          }
          const upcoming = (s.next5 ?? []).find((m) => {
            if (m.finished) return false;
            const t = matchStart(m.date, m.time);
            if (!t) return false;
            return isSameLocalDay(t, now);
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

      // 2b. EDM (NHL) — same local day, PLUS a special case: if tomorrow's
      // game kicks off between 00:00 and 07:00 local time (typical for
      // Edmonton games viewed from Denmark), surface it the evening before so
      // the user isn't blindsided by an overnight puck-drop.
      if (nhlRes.status === "fulfilled") {
        const next = nhlRes.value?.next as { startTimeUTC?: string; homeTeam?: { abbrev?: string }; awayTeam?: { abbrev?: string } } | null;
        if (next?.startTimeUTC) {
          const t = new Date(next.startTimeUTC);
          const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
          const isOvernightTomorrow = isSameLocalDay(t, tomorrow) && t.getHours() < 7;
          if (isSameLocalDay(t, now) || isOvernightTomorrow) {
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

      // 3. Today's run plan. Rest days count as "nothing scheduled" — no
      // entry — so if the rest of the day is also empty, the quiet-day card
      // triggers instead of a filler "Rest day" row.
      if (runRes.status === "fulfilled") {
        const plans: RunPlan[] = runRes.value?.upcomingPlans ?? [];
        const today = plans.find((p) => isSameLocalDay(new Date(p.date), now));
        if (today && today.type !== "rest") {
          const label = `${today.type[0].toUpperCase()}${today.type.slice(1)} run`;
          const detail = today.distance ? `${today.distance.toFixed(1)} km` : "planned";
          out.push({
            key: "run",
            emoji: "🏃",
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

      // 5. Media shows airing tonight (today's weekday). Skip shows that are
      // finished (episodesSeen ≥ maxEpisodes) so the briefing doesn't nag
      // about a series you've already wrapped.
      if (mediaRes.status === "fulfilled") {
        interface Show { id: number; title: string; channel: string; airDays: string; airTime: string; active: boolean; episodesSeen: number; maxEpisodes: number | null }
        const shows: Show[] = mediaRes.value?.shows ?? [];
        const todayN = now.getDay();
        const airing = shows
          .filter((s) => s.active
            && !(typeof s.maxEpisodes === "number" && s.maxEpisodes > 0 && s.episodesSeen >= s.maxEpisodes)
            && s.airDays.split(",").some((d) => Number(d) === todayN))
          .sort((a, b) => (a.airTime || "99:99").localeCompare(b.airTime || "99:99"));
        if (airing.length > 0) {
          const first = airing[0];
          const rest = airing.slice(1);
          const label = airing.length === 1 ? "Tonight on TV" : `📺 ${airing.length} shows tonight`;
          const detail = `${first.airTime ? first.airTime + " " : ""}${first.title}${first.channel ? " · " + first.channel : ""}`;
          const meta = rest.length > 0
            ? "— then " + rest.map((s) => `${s.airTime || "?"} ${s.title}`).join(" · ")
            : (first.channel || "");
          out.push({
            key: "media",
            emoji: "📺",
            label,
            detail,
            meta,
            href: "/media",
            color: "var(--accent-purple)",
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

  // Empty day → render a small "quiet day" card instead of collapsing entirely,
  // so the top of the dashboard doesn't feel dead on days with nothing booked.
  if (items.length === 0) {
    return (
      <div
        className="mb-4 rounded-2xl px-4 py-3 flex items-stretch gap-3 flex-wrap"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex flex-col justify-center pr-3" style={{ borderRight: "1px solid var(--border)" }}>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Today</div>
          <div className="text-sm font-semibold">
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </div>
          <WeatherLine />
        </div>
        <div className="flex-1 min-w-[220px] flex items-center gap-2 px-2 py-2">
          <span className="text-xl">☀️</span>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            Quiet day — nothing scheduled.
          </span>
        </div>
      </div>
    );
  }

  // Sort items by the persisted kind order; items of the same kind keep their
  // original relative order (stable sort).
  const kindRank = new Map<ItemKind, number>(order.map((k, i) => [k, i]));
  const sortedItems = [...items].sort((a, b) => (kindRank.get(itemKind(a.key)) ?? 99) - (kindRank.get(itemKind(b.key)) ?? 99));

  return (
    <div
      className="mb-4 rounded-2xl px-4 py-3 flex items-stretch gap-3 flex-wrap"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex flex-col justify-center pr-3" style={{ borderRight: "1px solid var(--border)" }}>
        <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Today</div>
        <div className="text-sm font-semibold">
          {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
        </div>
        <WeatherLine />
      </div>
      {sortedItems.map((it) => {
        const kind = itemKind(it.key);
        const isHover = hoverKind === kind && dragKind !== null && dragKind !== kind;
        const isDragging = dragKind === kind;
        return (
          <div
            key={it.key}
            className="flex-1 min-w-[220px] relative"
            style={{
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
              transform: isHover ? "scale(1.01)" : undefined,
              boxShadow: isHover ? "0 0 0 2px var(--accent-blue)" : undefined,
              borderRadius: "12px",
              opacity: isDragging ? 0.45 : 1,
            }}
            onDragOver={(e) => {
              if (!dragKind) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (hoverKind !== kind) setHoverKind(kind);
            }}
            onDragLeave={() => { if (hoverKind === kind) setHoverKind(null); }}
            onDrop={(e) => {
              e.preventDefault();
              const from = (e.dataTransfer.getData("text/plain") || dragKind) as ItemKind | "";
              if (from && from !== kind) swap(from as ItemKind, kind);
              setDragKind(null);
              setHoverKind(null);
            }}
          >
            <button
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", kind);
                setDragKind(kind);
              }}
              onDragEnd={() => { setDragKind(null); setHoverKind(null); }}
              onClick={(e) => e.preventDefault()}
              aria-label={`Drag ${it.label} to reorder`}
              title="Drag to reorder"
              className="absolute z-20 flex items-center justify-center rounded-md text-[10px] opacity-30 hover:opacity-100"
              style={{
                top: 4, right: 4, width: 18, height: 18,
                cursor: "grab",
                background: "var(--surface)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                lineHeight: 1,
              }}
            >⋮⋮</button>
            <Link
              href={it.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2 hover:brightness-110"
              style={{ background: "var(--surface-2)", border: `1px solid ${it.color}44` }}
              title={it.detail}
              draggable={false}
            >
              <span className="text-xl">{it.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide" style={{ color: it.color }}>{it.label}</div>
                <div className="text-sm font-semibold truncate">{it.detail}</div>
                {it.meta && <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{it.meta}</div>}
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}

/** Build a match kickoff Date from date (YYYY-MM-DD) + time (HH:MM), local timezone. */
function matchStart(date: string, time: string): Date | null {
  if (!date) return null;
  // Fixtures from /api/sports carry FotMob's raw UTC `HH:MM`. Build a UTC
  // instant, then downstream `toLocaleTimeString` displays it in local time.
  const iso = `${date}T${time || "00:00"}:00Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
