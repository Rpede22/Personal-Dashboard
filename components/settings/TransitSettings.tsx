"use client";

import { useEffect, useRef, useState } from "react";
import { PanelIntro, HelpDetails, LocalOnlyNote } from "@/components/settings/SettingsHelp";

/**
 * Transit settings panel (#5) — pick the home stop the Transit widget/hub shows
 * live departures from. Search via `/api/transit/search` (Rejseplanen), save via
 * `/api/transit/config`. Needs `REJSEPLANEN_API_KEY` (author-side); a no-key
 * banner explains when it's missing.
 */

interface Stop { id: string; name: string }
interface SavedCfg { stopName: string; hasKey?: boolean; favoriteLines?: string[] }
const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

export default function TransitSettings() {
  const [saved, setSaved] = useState<SavedCfg | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Stop[]>([]);
  const [status, setStatus] = useState("");
  const [lineDraft, setLineDraft] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetch("/api/transit/config").then((r) => r.json()).then(setSaved).catch(() => {}); }, []);

  async function saveLines(lines: string[]) {
    try {
      const res = await fetch("/api/transit/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteLines: lines }),
      });
      if (res.ok) setSaved(await res.json());
    } catch { /* ignore */ }
  }
  function addLine() {
    const l = lineDraft.trim();
    if (!l) return;
    const cur = saved?.favoriteLines ?? [];
    if (cur.length >= 3 || cur.some((x) => x.toLowerCase() === l.toLowerCase())) { setLineDraft(""); return; }
    saveLines([...cur, l]); setLineDraft("");
  }

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      fetch(`/api/transit/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d) => setResults(d.stops ?? []))
        .catch(() => setResults([]));
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  async function pick(s: Stop) {
    setStatus("");
    try {
      const res = await fetch("/api/transit/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopId: s.id, stopName: s.name }),
      });
      if (res.ok) { setSaved({ stopName: s.name }); setQ(""); setResults([]); setStatus("Saved ✓"); }
      else setStatus("Save failed");
    } catch (e) { setStatus(String(e)); }
  }

  const noKey = saved?.hasKey === false;

  return (
    <div className="space-y-4">
      <PanelIntro accent="var(--accent-green)">
        See live bus/train departures from your <strong>home stop</strong> on the dashboard. Search for a stop below and
        pick it — that&apos;s all the setup there is.
      </PanelIntro>

      {noKey && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--accent-orange)15", border: "1px solid var(--accent-orange)55", color: "var(--accent-orange)" }}>
          ⚠ A Rejseplanen API key isn&apos;t configured in this build yet, so search won&apos;t return results. It&apos;s free from{" "}
          <a href="https://labs.rejseplanen.dk" target="_blank" rel="noreferrer" style={{ color: "var(--accent-blue)" }}>labs.rejseplanen.dk</a>.
        </div>
      )}

      {saved?.stopName && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--accent-green)15", border: "1px solid var(--accent-green)55", color: "var(--accent-green)" }}>
          ✓ Home stop: <strong>{saved.stopName}</strong>
        </div>
      )}

      <div>
        <label className="block text-sm mb-1">Search for your stop</label>
        <input
          placeholder="e.g. Aarhus H, Nørreport…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-lg px-2 py-1.5 text-sm"
          style={inputStyle}
        />
        {results.length > 0 && (
          <div className="mt-2 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {results.slice(0, 8).map((s) => (
              <button key={s.id} onClick={() => pick(s)} className="w-full text-left px-3 py-2 text-sm hover:brightness-110"
                style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        <HelpDetails summary="This is Danish transit — will it work for me?">
          <p>The departure board uses <strong>Rejseplanen</strong>, which covers all public transport in Denmark (bus, train, metro, letbane). If you&apos;re not in Denmark, you can leave this unset and hide the Transit widget in ⚙️ Settings → General → Widgets.</p>
        </HelpDetails>
      </div>

      {/* Favourite lines — pin the 1–3 lines you ride most so they stand out on
          the board without looking them up. */}
      <div>
        <label className="block text-sm mb-1">Favourite lines <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>· up to 3</span></label>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Lines you ride often (e.g. <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>2A</code>, <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>Bus 5</code>). The departure board pins these to the top so you don&apos;t have to scan for them.</p>
        {(saved?.favoriteLines?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {saved!.favoriteLines!.map((l) => (
              <span key={l} className="text-xs px-2 py-1 rounded-lg inline-flex items-center gap-1.5" style={{ background: "var(--accent-green)15", border: "1px solid var(--accent-green)55", color: "var(--accent-green)" }}>
                {l}
                <button onClick={() => saveLines(saved!.favoriteLines!.filter((x) => x !== l))} style={{ color: "var(--accent-red)" }} title="Remove">✕</button>
              </span>
            ))}
          </div>
        )}
        {(saved?.favoriteLines?.length ?? 0) < 3 && (
          <div className="flex gap-2">
            <input value={lineDraft} onChange={(e) => setLineDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addLine(); }}
              placeholder="Add a line…" className="flex-1 rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
            <button onClick={addLine} disabled={!lineDraft.trim()} className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ background: "var(--accent-green)22", color: "var(--accent-green)", border: "1px solid var(--accent-green)" }}>+ Add</button>
          </div>
        )}
      </div>

      {status && <span className="text-xs" style={{ color: status.startsWith("Saved") ? "var(--accent-green)" : "var(--accent-red)" }}>{status}</span>}
      <LocalOnlyNote file="transit.json" />
    </div>
  );
}
