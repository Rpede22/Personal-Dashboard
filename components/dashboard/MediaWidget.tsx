"use client";

import { useEffect, useMemo, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface Show {
  id: number;
  title: string;
  channel: string;
  airDays: string;
  airTime: string;
  active: boolean;
  episodesSeen: number;
  maxEpisodes: number | null;
}

function isFinished(s: Show): boolean {
  return typeof s.maxEpisodes === "number" && s.maxEpisodes > 0 && s.episodesSeen >= s.maxEpisodes;
}

function parseDays(s: string): Set<number> {
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const n = Number(part);
    if (Number.isFinite(n) && n >= 0 && n <= 6) out.add(n);
  }
  return out;
}

/** Next Date this show airs, at or after `from`. Returns null if the show has
 *  no scheduled days. Walks up to 8 days forward so a Sunday-only show found
 *  on Monday still resolves. */
function nextAirDate(show: Show, from: Date): Date | null {
  const days = parseDays(show.airDays);
  if (days.size === 0) return null;
  const time = /^(\d{2}):(\d{2})$/.exec(show.airTime);
  const hh = time ? Number(time[1]) : 20;
  const mm = time ? Number(time[2]) : 0;
  for (let offset = 0; offset < 8; offset++) {
    const cand = new Date(from);
    cand.setDate(cand.getDate() + offset);
    cand.setHours(hh, mm, 0, 0);
    if (!days.has(cand.getDay())) continue;
    if (offset === 0 && cand.getTime() < from.getTime()) continue; // aired earlier today
    return cand;
  }
  return null;
}

function formatCountdown(ms: number): string {
  if (ms < 0) return "aired";
  const min = Math.round(ms / 60000);
  if (min < 60) return `in ${min}m`;
  const h = Math.floor(min / 60);
  const m = min - h * 60;
  if (h < 24) return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d ${h - d * 24}h`;
}

function airLabel(when: Date, now: Date): string {
  const midToday = new Date(now); midToday.setHours(0, 0, 0, 0);
  const midWhen  = new Date(when); midWhen.setHours(0, 0, 0, 0);
  const diffDays = Math.round((midWhen.getTime() - midToday.getTime()) / 86400000);
  const hm = when.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0) return `Tonight ${hm}`;
  if (diffDays === 1) return `Tomorrow ${hm}`;
  return `${when.toLocaleDateString("en-GB", { weekday: "short" })} ${hm}`;
}

export default function MediaWidget() {
  const [shows, setShows] = useState<Show[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/media");
        const j = await res.json();
        if (!cancelled) setShows(j.shows ?? []);
      } catch {
        if (!cancelled) setShows([]);
      }
    }
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  // "What's on next" for the 3 soonest-airing active shows across the coming
  // week. Each row spells out the next-episode number (based on episodesSeen
  // + 1) and when it airs, so you can decide what to catch tonight without
  // opening the hub.
  const upcoming = useMemo(() => {
    if (!shows) return null;
    const now = new Date();
    return shows
      .filter((s) => s.active && !isFinished(s))
      .map((s) => ({ show: s, next: nextAirDate(s, now) }))
      .filter((row): row is { show: Show; next: Date } => row.next !== null)
      .sort((a, b) => a.next.getTime() - b.next.getTime())
      .slice(0, 3);
  }, [shows]);

  return (
    <Card accentColor="var(--accent-purple)">
      <CardHeader icon="📺" title="Next up" subtitle="Coming episodes" accentColor="var(--accent-purple)" />
      {upcoming === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Nothing scheduled — add shows in the hub.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {upcoming.map(({ show, next }) => {
            const now = new Date();
            const soon = next.getTime() - now.getTime() <= 120 * 60000;
            const nextEp = show.episodesSeen + 1;
            return (
              <li
                key={show.id}
                className="text-sm flex items-baseline gap-2 rounded-md px-2 py-1"
                style={{ background: soon ? "var(--accent-purple)22" : "var(--surface-2)" }}
              >
                <span className="flex-1 min-w-0">
                  <span className="font-semibold truncate block">{show.title}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Ep {nextEp}
                    {show.channel && ` · ${show.channel}`}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="text-xs font-semibold" style={{ color: soon ? "var(--accent-purple)" : "var(--text)" }}>
                    {airLabel(next, now)}
                  </span>
                  <span className="block text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {formatCountdown(next.getTime() - now.getTime())}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
