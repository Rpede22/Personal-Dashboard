"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Card, { CardHeader } from "@/components/Card";
import { useRefreshMs } from "@/lib/useRefreshMs";

/* ── Types (trimmed to what the widget reads) ─────────────────────────────── */
interface Show { id: number; title: string; channel: string; airDays: string; airTime: string; active: boolean; episodesSeen: number; maxEpisodes: number | null }
interface PodEpisode { title: string; published: string; link?: string }
interface Podcast { id: string; title: string; imageUrl?: string; episodes: PodEpisode[]; newCount: number }
interface YtVideo { videoId: string; title: string; published: string; thumb?: string }
interface YtChannel { id: string; title: string; videos: YtVideo[]; newCount: number }
interface TwitchChannel { login: string; displayName: string; live: boolean; title?: string; viewers?: number; game?: string; avatar?: string }

type MediaTab = "tv" | "podcasts" | "youtube" | "twitch";
const TAB_KEY = "dashboard.media.widgetTab";
const ACCENT = "var(--accent-purple)";

/* ── Date helpers ─────────────────────────────────────────────────────────── */
function parseDays(s: string): Set<number> {
  const out = new Set<number>();
  for (const part of s.split(",")) { const n = Number(part); if (Number.isFinite(n) && n >= 0 && n <= 6) out.add(n); }
  return out;
}
function isFinished(s: Show): boolean { return typeof s.maxEpisodes === "number" && s.maxEpisodes > 0 && s.episodesSeen >= s.maxEpisodes; }
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
    if (offset === 0 && cand.getTime() < from.getTime()) continue;
    return cand;
  }
  return null;
}
function airLabel(when: Date, now: Date): string {
  const midToday = new Date(now); midToday.setHours(0, 0, 0, 0);
  const midWhen = new Date(when); midWhen.setHours(0, 0, 0, 0);
  const diffDays = Math.round((midWhen.getTime() - midToday.getTime()) / 86400000);
  const hm = when.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0) return `Tonight ${hm}`;
  if (diffDays === 1) return `Tomorrow ${hm}`;
  return `${when.toLocaleDateString("en-GB", { weekday: "short" })} ${hm}`;
}
function relDay(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function MediaWidget() {
  const [tab, setTab] = useState<MediaTab>("tv");
  const [shows, setShows] = useState<Show[] | null>(null);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [youtube, setYoutube] = useState<YtChannel[]>([]);
  const [twitch, setTwitch] = useState<TwitchChannel[]>([]);
  const [counts, setCounts] = useState({ pod: 0, yt: 0, live: 0 });
  const refreshMs = useRefreshMs("media", 5);

  useEffect(() => {
    try { const raw = localStorage.getItem(TAB_KEY); if (raw === "tv" || raw === "podcasts" || raw === "youtube" || raw === "twitch") setTab(raw); } catch { /* ignore */ }
  }, []);
  function selectTab(next: MediaTab) { setTab(next); try { localStorage.setItem(TAB_KEY, next); } catch { /* ignore */ } }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [s, p, y, t] = await Promise.all([
        fetch("/api/media").then((r) => r.json()).catch(() => ({})),
        fetch("/api/podcasts").then((r) => r.json()).catch(() => ({})),
        fetch("/api/youtube").then((r) => r.json()).catch(() => ({})),
        fetch("/api/twitch").then((r) => r.json()).catch(() => ({})),
      ]);
      if (cancelled) return;
      setShows(s.shows ?? []);
      setPodcasts(p.podcasts ?? []);
      setYoutube(y.channels ?? []);
      setTwitch(t.channels ?? []);
      setCounts({ pod: p.totalNew ?? 0, yt: y.totalNew ?? 0, live: t.liveCount ?? 0 });
    }
    load();
    if (refreshMs === 0) return () => { cancelled = true; };
    const iv = setInterval(load, refreshMs);
    return () => { cancelled = true; clearInterval(iv); };
  }, [refreshMs]);

  const upcoming = useMemo(() => {
    if (!shows) return [];
    const now = new Date();
    return shows.filter((s) => s.active && !isFinished(s))
      .map((s) => ({ show: s, next: nextAirDate(s, now) }))
      .filter((r): r is { show: Show; next: Date } => r.next !== null)
      .sort((a, b) => a.next.getTime() - b.next.getTime())
      .slice(0, 4);
  }, [shows]);

  // Flatten podcast episodes / yt videos, newest first, tagging the first
  // `newCount` of each feed as unseen.
  const podEpisodes = useMemo(() => {
    const rows = podcasts.flatMap((p) => p.episodes.map((e, i) => ({ from: p.title, ep: e, isNew: i < p.newCount })));
    return rows.sort((a, b) => b.ep.published.localeCompare(a.ep.published)).slice(0, 5);
  }, [podcasts]);
  const ytVideos = useMemo(() => {
    const rows = youtube.flatMap((c) => c.videos.map((v, i) => ({ from: c.title, v, isNew: i < c.newCount })));
    return rows.sort((a, b) => b.v.published.localeCompare(a.v.published)).slice(0, 5);
  }, [youtube]);

  const TABS: { key: MediaTab; label: string; badge?: number }[] = [
    { key: "tv", label: "TV" },
    { key: "podcasts", label: "🎧", badge: counts.pod },
    { key: "youtube", label: "▶️", badge: counts.yt },
    { key: "twitch", label: "🟣", badge: counts.live },
  ];

  const empty = (msg: string) => <p className="text-sm" style={{ color: "var(--text-muted)" }}>{msg}</p>;

  return (
    <Card accentColor={ACCENT}>
      <CardHeader icon="📺" title="Media" subtitle="TV · Podcasts · YouTube · Twitch" accentColor={ACCENT} />

      {/* Tab bar */}
      <div className="flex gap-1 mb-2 rounded-lg p-1" style={{ background: "var(--surface)" }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button key={t.key} onClick={() => selectTab(t.key)}
              className="px-2.5 py-1 rounded-md text-sm font-medium flex items-center gap-1"
              style={{ background: active ? ACCENT : "transparent", color: active ? "#fff" : "var(--text-muted)" }}>
              <span>{t.label}</span>
              {!!t.badge && t.badge > 0 && (
                <span className="text-[10px] font-bold px-1 rounded-full" style={{ background: active ? "#ffffff33" : "var(--accent-red)", color: "#fff" }}>{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="block">
        {/* TV has no per-item external target → the whole list links to the hub. */}
        {tab === "tv" && (
          shows === null ? empty("Loading…")
          : upcoming.length === 0 ? empty("Nothing scheduled — add shows in the hub.")
          : (
            <ul className="space-y-1.5">
              {upcoming.map(({ show, next }) => {
                const now = new Date();
                const soon = next.getTime() - now.getTime() <= 120 * 60000;
                return (
                  <li key={show.id}>
                    <Link href="/media" className="text-sm flex items-baseline gap-2 rounded-md px-2 py-1 hover:brightness-110" style={{ background: soon ? `${ACCENT}22` : "var(--surface-2)" }}>
                      <span className="flex-1 min-w-0">
                        <span className="font-semibold truncate block">{show.title}</span>
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Ep {show.episodesSeen + 1}{show.channel && ` · ${show.channel}`}</span>
                      </span>
                      <span className="text-xs font-semibold shrink-0" style={{ color: soon ? ACCENT : "var(--text)" }}>{airLabel(next, now)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {tab === "podcasts" && (
          podEpisodes.length === 0 ? empty("No podcasts followed — add feeds in the hub.")
          : (
            <ul className="space-y-1.5">
              {podEpisodes.map((r, i) => (
                <li key={i}>
                  <a href={r.ep.link || "/media"} target={r.ep.link ? "_blank" : undefined} rel="noreferrer" className="block text-sm rounded-md px-2 py-1 hover:brightness-110" style={{ background: r.isNew ? "var(--accent-pink)18" : "var(--surface-2)" }}>
                    <span className="flex items-center gap-1.5">
                      {r.isNew && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent-pink)" }} />}
                      <span className="font-medium truncate flex-1">{r.ep.title}</span>
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{r.from} · {relDay(r.ep.published)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )
        )}

        {/* YouTube video → its watch page (opens the channel's content), not the hub. */}
        {tab === "youtube" && (
          ytVideos.length === 0 ? empty("No channels followed — add them in the hub.")
          : (
            <ul className="space-y-1.5">
              {ytVideos.map((r, i) => (
                <li key={i}>
                  <a href={`https://www.youtube.com/watch?v=${r.v.videoId}`} target="_blank" rel="noreferrer" className="text-sm flex items-center gap-2 rounded-md px-2 py-1 hover:brightness-110" style={{ background: r.isNew ? "var(--accent-red)18" : "var(--surface-2)" }}>
                    {r.v.thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.v.thumb} alt="" className="rounded object-cover shrink-0" style={{ width: 40, height: 22 }} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="font-medium truncate block">{r.v.title}</span>
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{r.from} · {relDay(r.v.published)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )
        )}

        {/* Twitch → the streamer's twitch.tv page, not the hub. */}
        {tab === "twitch" && (() => {
          const live = twitch.filter((c) => c.live);
          if (twitch.length === 0) return empty("No streamers followed — add them in the hub.");
          if (live.length === 0) return empty("Nobody's live right now.");
          return (
            <ul className="space-y-1.5">
              {live.slice(0, 5).map((c) => (
                <li key={c.login}>
                  <a href={`https://www.twitch.tv/${c.login}`} target="_blank" rel="noreferrer" className="text-sm flex items-center gap-2 rounded-md px-2 py-1 hover:brightness-110" style={{ background: `${ACCENT}22` }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent-red)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold truncate block">{c.displayName || c.login}</span>
                      <span className="text-[10px] truncate block" style={{ color: "var(--text-muted)" }}>{c.game || c.title || "Live"}</span>
                    </span>
                    {c.viewers != null && <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{c.viewers.toLocaleString()}</span>}
                  </a>
                </li>
              ))}
            </ul>
          );
        })()}

        <Link href="/media" className="block text-[11px] mt-2" style={{ color: ACCENT }}>Open hub →</Link>
      </div>
    </Card>
  );
}
