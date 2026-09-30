"use client";

import { useEffect, useRef, useState } from "react";
import { PanelIntro } from "@/components/settings/SettingsHelp";

/**
 * Watchlist settings panel (#5) — seed the stocks/crypto the Watchlist widget
 * tracks. Search-as-you-type via `/api/watchlist?search=`, add via POST, remove
 * via DELETE — same endpoints as the hub, so both stay in sync.
 */

interface Item { symbol: string; name?: string }
interface SearchHit { symbol: string; name: string; type: string; exchange?: string }
const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

export default function WatchlistSettings() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function load() {
    fetch("/api/watchlist").then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => {});
  }
  useEffect(load, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 1) { setHits([]); return; }
    timer.current = setTimeout(() => {
      fetch(`/api/watchlist?search=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json()).then((d) => setHits(d.results ?? [])).catch(() => setHits([]));
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  async function add(symbol: string) {
    setStatus("");
    const res = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) });
    if (res.ok) { setQ(""); setHits([]); load(); } else { const d = await res.json().catch(() => ({})); setStatus(d.error || "Couldn't add that symbol"); }
  }
  async function remove(symbol: string) {
    await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <PanelIntro accent="var(--accent-indigo)">
        Follow <strong>stocks &amp; crypto</strong> — each shows a live price, daily change, and a mini chart on the
        dashboard. Search by name or ticker and add a few to start; remove any time.
      </PanelIntro>

      <div>
        <label className="block text-sm mb-1">Add a stock or crypto</label>
        <input placeholder="e.g. Apple, AAPL, Bitcoin, BTC-USD" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) add(hits[0].symbol); }}
          className="w-full rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
        {hits.length > 0 && (
          <div className="mt-2 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {hits.slice(0, 6).map((h) => (
              <button key={h.symbol} onClick={() => add(h.symbol)} className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:brightness-110"
                style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <span className="font-semibold">{h.symbol}</span>
                <span className="truncate" style={{ color: "var(--text-muted)" }}>{h.name}</span>
                <span className="ml-auto text-[10px] px-1.5 rounded" style={{ background: "var(--border)", color: "var(--text-muted)" }}>{h.type}</span>
              </button>
            ))}
          </div>
        )}
        {status && <p className="text-xs mt-1" style={{ color: "var(--accent-red)" }}>{status}</p>}
      </div>

      {items.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Following ({items.length})</div>
          <div className="flex flex-wrap gap-2">
            {items.map((it) => (
              <span key={it.symbol} className="text-xs px-2 py-1 rounded-lg inline-flex items-center gap-1.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <strong>{it.symbol}</strong>
                <button onClick={() => remove(it.symbol)} style={{ color: "var(--accent-red)" }} title="Remove">✕</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
