"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HubShell from "@/components/HubShell";
import { formatPrice, formatPct, sparkPath, type WatchQuote } from "@/lib/watchlist";

const ACCENT = "var(--accent-indigo)";

interface SymbolMatch { symbol: string; name: string; type: string; exchange: string }
const TYPE_LABEL: Record<string, string> = { EQUITY: "Stock", ETF: "ETF", CRYPTOCURRENCY: "Crypto", MUTUALFUND: "Fund", INDEX: "Index", CURRENCY: "FX" };

function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const w = 120, h = 34;
  const pts = sparkPath(values, w, h);
  if (!pts) return <div style={{ width: w, height: h }} />;
  const color = up ? "var(--accent-green)" : "var(--accent-red)";
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function WatchlistHub() {
  const [items, setItems] = useState<WatchQuote[] | null>(null);
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<SymbolMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [detail, setDetail] = useState<WatchQuote | null>(null); // ticker whose chart popup is open
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    try { setItems((await (await fetch("/api/watchlist")).json()).items ?? []); }
    catch { setItems([]); }
  }
  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);

  // Search-as-you-type against Yahoo (stocks, ETFs, funds, crypto).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = symbol.trim();
    if (q.length < 1) { setResults([]); setShowResults(false); return; }
    setSearching(true); setShowResults(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/watchlist?search=${encodeURIComponent(q)}`);
        const j = await res.json();
        setResults(j.results ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [symbol]);

  async function addSymbol(s: string) {
    const sym = s.trim();
    if (!sym) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym }) });
      const d = await res.json();
      if (res.ok) { setItems(d.items); setSymbol(""); setResults([]); setShowResults(false); }
      else setError(d.error || "Failed");
    } finally { setBusy(false); }
  }
  function add() {
    // Enter picks the first match if there is one, else tries the raw text.
    addSymbol(results[0]?.symbol ?? symbol);
  }

  async function remove(sym: string) {
    const res = await fetch(`/api/watchlist?symbol=${encodeURIComponent(sym)}`, { method: "DELETE" });
    if (res.ok) setItems((await res.json()).items);
  }

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <HubShell title="Watchlist" emoji="📈" color={ACCENT}>
      {/* Add — search-as-you-type */}
      <div className="rounded-2xl p-4 mb-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="relative">
          <div className="flex gap-2">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") setShowResults(false); }}
              onFocus={() => { if (results.length) setShowResults(true); }}
              placeholder="Search a name or ticker — e.g. Vanguard, Apple, NVDA, Bitcoin"
              className="flex-1 rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            />
            <button onClick={add} disabled={busy || !symbol.trim()} className="text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-40" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>
              {busy ? "…" : "+ Add"}
            </button>
          </div>

          {showResults && (results.length > 0 || searching) && (
            <div className="absolute left-0 right-0 top-full mt-1 rounded-lg overflow-hidden z-20 max-h-72 overflow-y-auto shadow-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              {searching && results.length === 0 ? (
                <div className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>Searching…</div>
              ) : (
                results.map((r) => (
                  <button key={r.symbol + r.exchange} onClick={() => addSymbol(r.symbol)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:brightness-125 border-t first:border-t-0" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                    <span className="text-sm font-semibold shrink-0" style={{ color: "var(--text)" }}>{r.symbol}</span>
                    <span className="text-xs truncate flex-1" style={{ color: "var(--text-muted)" }}>{r.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: `${ACCENT}22`, color: ACCENT }}>{TYPE_LABEL[r.type] ?? r.type}</span>
                    {r.exchange && <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{r.exchange}</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {error && <p className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>{error}</p>}
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Search by name or ticker — stocks, <strong>ETFs / funds</strong>, and crypto (Yahoo Finance). Pick a result to add it. Auto-refreshes every minute.</p>
      </div>

      {items === null ? (
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          Nothing tracked yet — add a ticker above.
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <ul>
            {items.map((q) => {
              const up = (q.changePct ?? 0) >= 0;
              const chgColor = q.changePct === null ? "var(--text-muted)" : up ? "var(--accent-green)" : "var(--accent-red)";
              return (
                <li key={q.symbol} className="border-t first:border-t-0 flex items-center" style={{ borderColor: "var(--border)" }}>
                  <button
                    onClick={() => setDetail(q)}
                    className="flex-1 min-w-0 px-4 py-3 flex items-center gap-4 text-left hover:brightness-125 transition-all cursor-pointer"
                    title={`Open ${q.symbol} chart`}
                  >
                    <div className="min-w-0" style={{ flex: "1 1 0" }}>
                      <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>{q.symbol}</div>
                      <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{q.name}</div>
                    </div>
                    <Sparkline values={q.spark} up={up} />
                    <div className="text-right shrink-0" style={{ minWidth: 110 }}>
                      <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>{formatPrice(q.price, q.currency)}</div>
                      <div className="text-xs tabular-nums" style={{ color: chgColor }}>{q.changePct === null ? "—" : `${up ? "▲" : "▼"} ${formatPct(q.changePct)}`}</div>
                    </div>
                  </button>
                  <button onClick={() => remove(q.symbol)} className="text-xs px-3 py-3 shrink-0" style={{ color: "var(--accent-red)" }} title="Remove">✕</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-xs mt-4 text-center" style={{ color: "var(--text-muted)" }}>
        Prices from Yahoo Finance, delayed. Watchlist only — not financial advice.
      </p>

      {detail && <TickerChartModal quote={detail} onClose={() => setDetail(null)} />}
    </HubShell>
  );
}

// ── Chart popup (click a ticker) ────────────────────────────────────────────────

interface HistoryPoint { t: number; c: number }
interface HistoryResp { symbol: string; name: string; currency: string; range: string; points: HistoryPoint[] }
const RANGES: Array<{ key: string; label: string }> = [
  { key: "1mo", label: "1M" },
  { key: "6mo", label: "6M" },
  { key: "1y",  label: "1Y" },
  { key: "5y",  label: "5Y" },
  { key: "max", label: "Max" },
];

/**
 * Full-history chart popup — the Yahoo/Google-finance-style view opened by
 * tapping a ticker. Range segments (1M/6M/1Y/5Y/Max) hit
 * `/api/watchlist?history=SYMBOL&range=`; the SVG line supports **hover-to-inspect**
 * (crosshair + a floating tooltip showing the date + price at that point).
 */
function TickerChartModal({ quote, onClose }: { quote: WatchQuote; onClose: () => void }) {
  const [range, setRange] = useState("6mo");
  const [data, setData] = useState<HistoryResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setHoverIdx(null);
    fetch(`/api/watchlist?history=${encodeURIComponent(quote.symbol)}&range=${range}`)
      .then((r) => r.json())
      .then((d: HistoryResp) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [quote.symbol, range]);

  const currency = data?.currency ?? quote.currency;
  const pts = data?.points ?? [];
  const W = 640, H = 260, padX = 8, padTop = 12, padBottom = 22;
  const plotW = W - padX * 2, plotH = H - padTop - padBottom;

  const geom = useMemo(() => {
    if (pts.length < 2) return null;
    const closes = pts.map((p) => p.c);
    const min = Math.min(...closes), max = Math.max(...closes);
    const span = max - min || 1;
    const xAt = (i: number) => padX + (i / (pts.length - 1)) * plotW;
    const yAt = (c: number) => padTop + (1 - (c - min) / span) * plotH;
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.c).toFixed(1)}`).join(" ");
    const area = `${line} L ${xAt(pts.length - 1).toFixed(1)} ${padTop + plotH} L ${xAt(0).toFixed(1)} ${padTop + plotH} Z`;
    return { min, max, xAt, yAt, line, area };
  }, [pts, plotW, plotH]);

  // Range performance (first → last close).
  const first = pts[0]?.c ?? null;
  const last = pts[pts.length - 1]?.c ?? null;
  const rangePct = first && last ? ((last - first) / first) * 100 : null;
  const up = (rangePct ?? 0) >= 0;
  const stroke = up ? "var(--accent-green)" : "var(--accent-red)";

  function onMove(e: React.MouseEvent) {
    if (!svgRef.current || pts.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverIdx(Math.round(frac * (pts.length - 1)));
  }

  const hp = hoverIdx !== null ? pts[hoverIdx] : null;
  const hoverX = geom && hoverIdx !== null ? geom.xAt(hoverIdx) : 0;
  const hoverY = geom && hp ? geom.yAt(hp.c) : 0;
  const dateFmt = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: range === "5y" || range === "max" ? "numeric" : undefined });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="rounded-2xl overflow-hidden flex flex-col w-full max-w-2xl shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)", marginTop: 28 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 flex items-start justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="min-w-0">
            <div className="text-lg font-bold">{quote.symbol}</div>
            <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{quote.name}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--accent-indigo)" }}>{formatPrice(quote.price, currency)}</span>
              {rangePct !== null && (
                <span className="text-sm tabular-nums" style={{ color: stroke }}>
                  {up ? "▲" : "▼"} {formatPct(rangePct)} <span style={{ color: "var(--text-muted)" }}>· {RANGES.find((r) => r.key === range)?.label}</span>
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-lg opacity-60 hover:opacity-100" title="Close (Esc)">✕</button>
        </div>

        {/* Range segments */}
        <div className="flex-shrink-0 px-5 pt-3 flex gap-1">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} className="text-xs px-3 py-1.5 rounded-md font-medium"
              style={{ background: range === r.key ? "var(--accent-indigo)" : "var(--surface-2)", color: range === r.key ? "#fff" : "var(--text-muted)" }}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="p-5">
          {loading ? (
            <div className="h-[260px] grid place-items-center text-sm" style={{ color: "var(--text-muted)" }}>Loading chart…</div>
          ) : !geom || pts.length < 2 ? (
            <div className="h-[260px] grid place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No history available for this range.</div>
          ) : (
            <div className="relative">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                width="100%"
                height={H}
                style={{ display: "block", cursor: "crosshair" }}
                onMouseMove={onMove}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <defs>
                  <linearGradient id="wl-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <path d={geom.area} fill="url(#wl-fill)" />
                <path d={geom.line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {hp && (
                  <>
                    <line x1={hoverX} y1={padTop} x2={hoverX} y2={padTop + plotH} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                    <circle cx={hoverX} cy={hoverY} r={3.5} fill={stroke} stroke="var(--surface)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  </>
                )}
              </svg>
              {/* Hover tooltip (HTML overlay so text isn't stretched by the non-uniform viewBox) */}
              {hp && (
                <div
                  className="absolute pointer-events-none rounded-lg px-2 py-1 text-xs shadow-lg"
                  style={{
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                    left: `min(max(${(hoverX / W) * 100}%, 3rem), calc(100% - 3rem))`,
                    top: 4, transform: "translateX(-50%)", whiteSpace: "nowrap",
                  }}
                >
                  <span className="font-semibold tabular-nums">{formatPrice(hp.c, currency)}</span>
                  <span className="ml-1.5" style={{ color: "var(--text-muted)" }}>{dateFmt(hp.t)}</span>
                </div>
              )}
              {/* Date axis — the range's start + end so you can read the span at a glance. */}
              <div className="flex justify-between text-[10px] tabular-nums mt-1 px-1" style={{ color: "var(--text-muted)" }}>
                <span>{dateFmt(pts[0].t)}</span>
                <span>{dateFmt(pts[pts.length - 1].t)}</span>
              </div>
            </div>
          )}
          <p className="text-[11px] mt-3 text-center" style={{ color: "var(--text-muted)" }}>
            Hover the line for the price on any day. Yahoo Finance, delayed — not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
