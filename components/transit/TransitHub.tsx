"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HubShell from "@/components/HubShell";
import type { TransitBoard, TransitDeparture, TransitStop } from "@/lib/transit";
import { TRANSIT_ICON, departureLabel, minutesUntil } from "@/lib/transit";

const ACCENT = "var(--accent-green)";

export default function TransitHub() {
  const [stopId, setStopId] = useState<string | null>(null);
  const [stopName, setStopName] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [favoriteLines, setFavoriteLines] = useState<string[]>([]);
  const [board, setBoard] = useState<TransitBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transit/departures?max=15");
      setBoard(await res.json());
    } catch { setBoard(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch("/api/transit/config").then((r) => r.json()).then((c) => {
      setStopId(c.stopId ?? "");
      setStopName(c.stopName ?? "");
      setHasKey(!!c.hasKey);
      setFavoriteLines(Array.isArray(c.favoriteLines) ? c.favoriteLines : []);
      if (c.stopId) load();
    }).catch(() => setStopId(""));
  }, [load]);

  // Auto-refresh the board every 30s (realtime data).
  useEffect(() => {
    if (!stopId) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [stopId, load]);

  async function saveStop(stop: TransitStop) {
    await fetch("/api/transit/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stopId: stop.id, stopName: stop.name }),
    }).catch(() => {});
    setStopId(stop.id);
    setStopName(stop.name);
    setPicking(false);
    load();
  }

  const showPicker = stopId === "" || picking;

  return (
    <HubShell title="Transit" emoji="🚌" color={ACCENT}
      tabs={
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {stopName && !showPicker && <span>Departures from <span style={{ color: "var(--text)" }}>{stopName}</span></span>}
          <span className="ml-auto">Rejseplanen — live departures.</span>
        </div>
      }
    >
      <div className="space-y-5 max-w-3xl mx-auto">
        {stopId === null ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : !hasKey ? (
          <NoKeyCard />
        ) : showPicker ? (
          <StopPicker current={stopName} onPick={saveStop} onCancel={stopId ? () => setPicking(false) : undefined} />
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm">
              <span style={{ color: "var(--text)" }}>🚏 {stopName}</span>
              <button onClick={() => setPicking(true)} className="text-xs" style={{ color: ACCENT }}>Change stop</button>
              <button onClick={load} disabled={loading} className="text-xs ml-auto" style={{ color: ACCENT }}>{loading ? "Refreshing…" : "⟳ Refresh"}</button>
            </div>

            {loading && !board ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading departures…</p>
            ) : board?.error ? (
              <div className="rounded-2xl p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--accent-orange)" }}>{board.error}</div>
            ) : board && board.departures.length === 0 ? (
              <div className="rounded-2xl p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
                No departures in the next couple of hours.
              </div>
            ) : board ? (() => {
              // Pin favourite-line departures to the top (still time-ordered
              // within each group) so the lines you ride most are first.
              const isFav = (d: TransitDeparture) => favoriteLines.some((l) => {
                const a = d.line.toLowerCase(), b = l.toLowerCase();
                return a.includes(b) || b.includes(a);
              });
              const favs = favoriteLines.length ? board.departures.filter(isFav) : [];
              const rest = favoriteLines.length ? board.departures.filter((d) => !isFav(d)) : board.departures;
              const ordered = [...favs, ...rest];
              return (
                <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  {ordered.map((d, i) => <DepartureRow key={i} d={d} first={i === 0} fav={favs.length > 0 && i < favs.length} />)}
                </div>
              );
            })() : null}
          </>
        )}
      </div>
    </HubShell>
  );
}

function NoKeyCard() {
  return (
    <div className="rounded-2xl p-5 text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
      <div className="text-base mb-2" style={{ color: "var(--text)" }}>🔑 Add a Rejseplanen API key</div>
      <p className="mb-2">
        Live Danish public-transit departures come from <strong>Rejseplanen API 2.0</strong>, which needs a free key. Request one at{" "}
        <a href="https://labs.rejseplanen.dk/" target="_blank" rel="noreferrer" className="underline" style={{ color: ACCENT }}>labs.rejseplanen.dk</a>.
      </p>
      <p>
        Add it as <code style={{ color: "var(--text)" }}>REJSEPLANEN_API_KEY</code> in <code style={{ color: "var(--text)" }}>.env.local</code> and relaunch — then you can search for your home stop here.
      </p>
    </div>
  );
}

function StopPicker({ current, onPick, onCancel }: { current: string; onPick: (s: TransitStop) => void; onCancel?: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TransitStop[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true); setErr(null);
      try {
        const res = await fetch(`/api/transit/search?q=${encodeURIComponent(q.trim())}`);
        const j = await res.json();
        if (!res.ok) { setErr(j.error ?? "Search failed."); setResults([]); }
        else setResults(j.stops ?? []);
      } catch { setErr("Network error."); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Find your home stop</div>
        {onCancel && <button onClick={onCancel} className="text-xs" style={{ color: "var(--text-muted)" }}>Cancel</button>}
      </div>
      <input
        autoFocus type="text" placeholder="Search a stop or station (e.g. Aarhus H, Nørreport)…"
        value={q} onChange={(e) => setQ(e.target.value)}
        className="text-sm px-2 py-1.5 rounded-md w-full" style={inputStyle}
      />
      {current && <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Current: {current}</div>}
      {err && <div className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>{err}</div>}
      {searching && <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Searching…</div>}
      {results.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {results.map((s) => (
            <button key={s.id} onClick={() => onPick(s)}
              className="text-left text-sm px-2 py-1.5 rounded-md hover:brightness-125"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              🚏 {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DepartureRow({ d, first, fav }: { d: TransitDeparture; first?: boolean; fav?: boolean }) {
  const soon = minutesUntil(d.realISO ?? d.plannedISO);
  const late = d.delayMin > 0;
  const early = d.delayMin < 0;
  return (
    <div className="flex items-center gap-3 px-3 py-2" style={{ borderTop: first ? "none" : "1px solid var(--border)", opacity: d.cancelled ? 0.5 : 1, background: fav ? "var(--accent-green)11" : undefined }}>
      {fav && <span className="shrink-0" style={{ color: "var(--accent-green)" }} title="Favourite line">★</span>}
      <span className="text-lg shrink-0" title={d.kind}>{TRANSIT_ICON[d.kind]}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          <span style={{ color: "var(--text)" }}>{d.line}</span>
          {d.direction && <span style={{ color: "var(--text-muted)" }}> → {d.direction}</span>}
        </div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {d.cancelled ? <span style={{ color: "var(--accent-red)" }}>Cancelled</span> : (
            <>
              {new Date(d.plannedISO).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}
              {late && <span style={{ color: "var(--accent-red)" }}> +{d.delayMin} min</span>}
              {early && <span style={{ color: "var(--accent-green)" }}> {d.delayMin} min</span>}
              {d.track && <span> · plat. {d.track}</span>}
            </>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums" style={{ color: soon <= 2 ? "var(--accent-orange)" : "var(--text)" }}>
          {departureLabel(d.realISO ?? d.plannedISO)}
        </div>
      </div>
    </div>
  );
}
