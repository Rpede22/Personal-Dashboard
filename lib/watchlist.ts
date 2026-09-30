/**
 * Stock / crypto watchlist — shared types + client-safe helpers (no `fs`).
 * Data comes from Yahoo Finance's keyless chart API (server-side, see the
 * route), which covers both stocks (`AAPL`, `NVDA`) and crypto (`BTC-USD`,
 * `ETH-USD`) with one endpoint. Info/Finance category.
 */

export interface WatchConfigItem {
  symbol: string;   // Yahoo symbol, e.g. "AAPL" or "BTC-USD"
  label?: string;   // optional display override
}

export interface WatchQuote {
  symbol: string;
  name: string;
  price: number | null;
  prevClose: number | null;
  changePct: number | null;   // daily % change
  currency: string;
  spark: number[];            // ~30 daily closes for a sparkline
}

/** A compact price string — 2 dp normally, more for sub-1 values. */
export function formatPrice(n: number | null, currency = "USD"): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const digits = Math.abs(n) < 1 ? 4 : 2;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
  } catch {
    return `${n.toFixed(digits)} ${currency}`;
  }
}

export function formatPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

/** SVG polyline points for a sparkline scaled into a w×h box. */
export function sparkPath(values: number[], w: number, h: number, pad = 2): string {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return "";
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const step = (w - pad * 2) / (pts.length - 1);
  return pts
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
