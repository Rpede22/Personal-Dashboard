"use client";

import { useEffect, useState } from "react";
import { YouTubeChannelWithVideos, watchUrl, isNewVideo } from "@/lib/youtube";
import { relativeDay } from "@/lib/podcasts";

const ACCENT = "var(--accent-red)";

/**
 * YouTube tab in the Media hub. Follow channels by their UC id (or a
 * /channel/UC… URL); any upload newer than your last visit shows a NEW badge.
 * Keyless — uses each channel's public RSS feed.
 */
export default function YouTubePanel({ onCountChange }: { onCountChange?: (totalNew: number) => void }) {
  const [channels, setChannels] = useState<YouTubeChannelWithVideos[] | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/youtube");
      const j = await res.json();
      setChannels(j.channels ?? []);
      onCountChange?.(j.totalNew ?? 0);
    } catch { setChannels([]); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    const v = input.trim();
    if (!v) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/youtube", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: v }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't add that channel."); return; }
      setInput("");
      await load();
    } catch { setError("Network error."); }
    finally { setBusy(false); }
  }

  async function markSeen(id: string) {
    setBusy(true);
    try {
      await fetch("/api/youtube", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "markSeen" }) });
      await load();
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Unfollow this channel?")) return;
    setBusy(true);
    try {
      await fetch(`/api/youtube?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } finally { setBusy(false); }
  }

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Add */}
      <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Follow a channel</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text" placeholder="@handle, channel URL, or UC… channel id"
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="text-sm px-2 py-1.5 rounded-md flex-1" style={inputStyle}
          />
          <button onClick={add} disabled={busy || !input.trim()} className="text-sm px-3 py-1.5 rounded-md disabled:opacity-40"
            style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>Add</button>
        </div>
        {error && <div className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>{error}</div>}
        <div className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
          Paste a <code>@handle</code> (e.g. <code>@mkbhd</code>), a channel URL, or the <code>UC…</code> id.
        </div>
      </div>

      {/* Channels */}
      {channels === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading channels…</p>
      ) : channels.length === 0 ? (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
          ▶️ No channels yet — follow one to see new uploads.
        </div>
      ) : (
        <div className="space-y-4">
          {channels.map((c) => (
            <div key={c.id} className="rounded-2xl p-4" style={{ background: "var(--surface)", border: `1px solid ${c.newCount > 0 ? ACCENT : "var(--border)"}` }}>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="font-semibold truncate">{c.title}</span>
                {c.newCount > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${ACCENT}22`, color: ACCENT }}>{c.newCount} NEW</span>}
                <div className="ml-auto flex gap-3">
                  {c.newCount > 0 && <button onClick={() => markSeen(c.id)} disabled={busy} className="text-xs" style={{ color: ACCENT }}>Mark all seen</button>}
                  <button onClick={() => remove(c.id)} disabled={busy} className="text-xs" style={{ color: "var(--accent-red)" }}>✕</button>
                </div>
              </div>
              {c.videos.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {c.videos.slice(0, 6).map((v) => {
                    const isNew = isNewVideo(v.published, c.lastSeenAt);
                    return (
                      <a key={v.videoId} href={watchUrl(v.videoId)} target="_blank" rel="noreferrer"
                        className="rounded-xl overflow-hidden flex flex-col hover:brightness-110"
                        style={{ background: "var(--surface-2)", border: `1px solid ${isNew ? ACCENT : "var(--border)"}` }}>
                        {v.thumb && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.thumb} alt="" className="w-full object-cover" style={{ aspectRatio: "16/9" }} />
                        )}
                        <div className="p-2">
                          <div className="text-xs font-medium line-clamp-2" style={{ fontWeight: isNew ? 600 : 400 }}>{v.title}</div>
                          <div className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: isNew ? ACCENT : "var(--text-muted)" }}>
                            {isNew && <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />}
                            {relativeDay(v.published)}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
