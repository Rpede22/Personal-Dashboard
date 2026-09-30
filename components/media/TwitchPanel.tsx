"use client";

import { useEffect, useState } from "react";
import type { TwitchChannel, TwitchLive } from "@/lib/twitch";

const ACCENT = "var(--accent-purple)";
type Row = TwitchChannel & Partial<TwitchLive>;

function viewers(n?: number): string {
  if (!n) return "";
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

/**
 * Twitch tab in the Media hub — which followed streamers are live right now.
 * Keyless (public Twitch GQL). Live channels sort to the top with viewer count,
 * game, and title; offline channels are greyed below.
 */
export default function TwitchPanel({ onCountChange }: { onCountChange?: (liveCount: number) => void }) {
  const [channels, setChannels] = useState<Row[] | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/twitch");
      const j = await res.json();
      setChannels(j.channels ?? []);
      onCountChange?.(j.liveCount ?? 0);
    } catch { setChannels([]); }
  }
  useEffect(() => {
    load();
    const iv = setInterval(load, 2 * 60 * 1000); // live status changes — poll
    return () => clearInterval(iv);
  }, []);

  async function add() {
    const v = input.trim();
    if (!v) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/twitch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: v }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't add that channel."); return; }
      setInput("");
      await load();
    } catch { setError("Network error."); }
    finally { setBusy(false); }
  }
  async function remove(login: string) {
    if (!confirm("Unfollow this channel?")) return;
    setBusy(true);
    try { await fetch(`/api/twitch?login=${encodeURIComponent(login)}`, { method: "DELETE" }); await load(); }
    finally { setBusy(false); }
  }

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Add */}
      <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Follow a channel</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text" placeholder="Twitch channel name (or twitch.tv/name)"
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="text-sm px-2 py-1.5 rounded-md flex-1" style={inputStyle}
          />
          <button onClick={add} disabled={busy || !input.trim()} className="text-sm px-3 py-1.5 rounded-md disabled:opacity-40"
            style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>Add</button>
        </div>
        {error && <div className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>{error}</div>}
        <div className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>Keyless — live status via Twitch&apos;s public API, no login or key needed.</div>
      </div>

      {/* Channels */}
      {channels === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading channels…</p>
      ) : channels.length === 0 ? (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
          🟣 No channels yet — follow one to see who&apos;s live.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {channels.map((c) => (
            <a key={c.login} href={`https://www.twitch.tv/${c.login}`} target="_blank" rel="noreferrer"
              className="rounded-xl overflow-hidden flex flex-col hover:brightness-110"
              style={{ background: "var(--surface)", border: `1px solid ${c.live ? ACCENT : "var(--border)"}`, opacity: c.live ? 1 : 0.6 }}>
              {c.live && c.preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <div className="relative">
                  <img src={c.preview} alt="" className="w-full object-cover" style={{ aspectRatio: "16/9" }} />
                  <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--accent-red)", color: "#fff" }}>● LIVE</span>
                  {c.viewers != null && (
                    <span className="absolute bottom-1.5 right-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>{viewers(c.viewers)} viewers</span>
                  )}
                </div>
              )}
              <div className="p-2 flex items-center gap-2">
                {c.avatar && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatar} alt="" width={32} height={32} className="rounded-full shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{c.displayName ?? c.login}</div>
                  {c.live ? (
                    <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                      {c.game && <span style={{ color: ACCENT }}>{c.game}</span>}{c.game && c.title ? " · " : ""}{c.title}
                    </div>
                  ) : (
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Offline</div>
                  )}
                </div>
                <button onClick={(e) => { e.preventDefault(); remove(c.login); }} className="text-xs shrink-0" style={{ color: "var(--accent-red)" }} title="Unfollow">✕</button>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
