"use client";

import { useEffect, useState } from "react";
import {
  PodcastWithEpisodes,
  formatDuration,
  relativeDay,
  isNewEpisode,
} from "@/lib/podcasts";

/**
 * Podcasts tab inside the Media hub. Keyless RSS — add a feed URL, and any
 * episode that drops after you last opened it shows a "NEW" badge. "Mark all
 * seen" clears a podcast's badges.
 */
export default function PodcastPanel({ onCountChange }: { onCountChange?: (totalNew: number) => void }) {
  const [podcasts, setPodcasts] = useState<PodcastWithEpisodes[] | null>(null);
  const [feedUrl, setFeedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/podcasts");
      const j = await res.json();
      setPodcasts(j.podcasts ?? []);
      onCountChange?.(j.totalNew ?? 0);
    } catch {
      setPodcasts([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    const url = feedUrl.trim();
    if (!url) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: url }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't add that feed."); return; }
      setFeedUrl("");
      await load();
    } catch {
      setError("Network error adding the feed.");
    } finally {
      setBusy(false);
    }
  }

  async function markSeen(id: string) {
    setBusy(true);
    try {
      await fetch("/api/podcasts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "markSeen" }),
      });
      await load();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Stop following this podcast?")) return;
    setBusy(true);
    try {
      await fetch(`/api/podcasts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } finally { setBusy(false); }
  }

  const accent = "var(--accent-pink)";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ── Add a feed ── */}
      <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Follow a podcast</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            placeholder="Podcast RSS feed URL (e.g. https://feeds.simplecast.com/…)"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="text-sm px-2 py-1.5 rounded-md flex-1"
            style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
          />
          <button
            onClick={add}
            disabled={busy || !feedUrl.trim()}
            className="text-sm px-3 py-1.5 rounded-md disabled:opacity-40"
            style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}` }}
          >Add feed</button>
        </div>
        {error && <div className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>{error}</div>}
        <div className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
          Paste the show&apos;s RSS URL. Most podcast sites and directories (Apple Podcasts, Pocket Casts, Overcast) list it, or search &quot;&lt;show name&gt; RSS feed&quot;.
        </div>
      </div>

      {/* ── Followed podcasts ── */}
      {podcasts === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading podcasts…</p>
      ) : podcasts.length === 0 ? (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
          🎧 No podcasts yet — add a feed URL above to start tracking new episodes.
        </div>
      ) : (
        <div className="space-y-4">
          {podcasts.map((p) => (
            <div key={p.id} className="rounded-2xl p-4" style={{ background: "var(--surface)", border: `1px solid ${p.newCount > 0 ? accent : "var(--border)"}` }}>
              <div className="flex items-start gap-3">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" width={48} height={48} className="rounded-lg shrink-0" style={{ objectFit: "cover" }} />
                ) : (
                  <div className="w-12 h-12 rounded-lg shrink-0 grid place-items-center text-xl" style={{ background: "var(--surface-2)" }}>🎧</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{p.title}</span>
                    {p.newCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${accent}22`, color: accent }}>
                        {p.newCount} NEW
                      </span>
                    )}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {p.episodes.length} recent episode{p.episodes.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {p.newCount > 0 && (
                    <button onClick={() => markSeen(p.id)} disabled={busy} className="text-xs" style={{ color: accent }}>Mark all seen</button>
                  )}
                  <button onClick={() => remove(p.id)} disabled={busy} className="text-xs" style={{ color: "var(--accent-red)" }}>✕</button>
                </div>
              </div>

              {p.episodes.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {p.episodes.slice(0, 6).map((e, i) => {
                    const isNew = isNewEpisode(e.published, p.lastSeenAt);
                    const dur = formatDuration(e.durationSec);
                    return (
                      <li
                        key={i}
                        className="text-sm rounded-md px-2 py-1 flex items-baseline gap-2"
                        style={{ background: isNew ? `${accent}14` : "var(--surface-2)" }}
                      >
                        {isNew && <span className="w-1.5 h-1.5 rounded-full shrink-0 self-center" style={{ background: accent }} />}
                        <span className="flex-1 min-w-0 truncate" style={{ fontWeight: isNew ? 600 : 400 }}>
                          {e.link ? (
                            <a href={e.link} target="_blank" rel="noreferrer" className="hover:underline">{e.title}</a>
                          ) : e.title}
                        </span>
                        <span className="text-[11px] shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {relativeDay(e.published)}{dur && ` · ${dur}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
