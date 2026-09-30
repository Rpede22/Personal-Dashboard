import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { configPath } from "@/lib/config-dir";
import type { WatchConfigItem, WatchQuote } from "@/lib/watchlist";

/**
 * Stock / crypto watchlist. File-based config (no DB); quotes fetched live from
 * Yahoo Finance's keyless chart API (works server-side with a browser UA).
 *   GET    /api/watchlist          → { items: WatchQuote[] }
 *   POST   /api/watchlist          → add { symbol } (validated against Yahoo)
 *   DELETE /api/watchlist?symbol=X → remove one
 *
 * Symbols are whatever Yahoo accepts — stocks (`AAPL`) and crypto (`BTC-USD`).
 * Quotes cached 60 s so a busy dashboard doesn't hammer Yahoo.
 */

const PATH = configPath("watchlist.json");
const DEFAULTS: WatchConfigItem[] = [{ symbol: "BTC-USD" }, { symbol: "ETH-USD" }, { symbol: "AAPL" }];

function read(): WatchConfigItem[] {
  try {
    const raw = JSON.parse(readFileSync(PATH, "utf-8"));
    if (Array.isArray(raw)) return raw.filter((i) => i && typeof i.symbol === "string");
    return DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
function write(list: WatchConfigItem[]): void {
  writeFileSync(PATH, JSON.stringify(list, null, 2));
}

const quoteCache = new Map<string, { data: WatchQuote; ts: number }>();
const TTL = 60 * 1000;

async function fetchQuote(item: WatchConfigItem): Promise<WatchQuote> {
  const symbol = item.symbol.toUpperCase();
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.ts < TTL) {
    return item.label ? { ...cached.data, name: item.label } : cached.data;
  }
  const empty: WatchQuote = { symbol, name: item.label ?? symbol, price: null, prevClose: null, changePct: null, currency: "USD", spark: [] };
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 60 } },
    );
    if (!res.ok) return empty;
    const j = await res.json();
    const result = j?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return empty;
    const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter((v: unknown): v is number => typeof v === "number");
    const price: number | null = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : (closes.at(-1) ?? null);
    // Daily change = latest vs the previous daily close (the range's
    // chartPreviousClose is a month ago, so we take it from the series).
    const prevClose: number | null = closes.length >= 2 ? closes[closes.length - 2] : (typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose : null);
    const changePct = price !== null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
    const quote: WatchQuote = {
      symbol,
      name: item.label ?? meta.shortName ?? meta.symbol ?? symbol,
      price,
      prevClose,
      changePct,
      currency: meta.currency ?? "USD",
      spark: closes.slice(-30),
    };
    quoteCache.set(symbol, { data: quote, ts: Date.now() });
    return quote;
  } catch {
    return empty;
  }
}

// ── Price history (for the click-through chart popup) ───────────────────────────
// Yahoo's chart API takes a `range` + `interval`; we map each range segment to a
// sensible interval (denser for short ranges, coarser for long ones) so the line
// stays smooth without pulling thousands of points.
const RANGE_INTERVAL: Record<string, string> = {
  "1mo": "1d",
  "6mo": "1d",
  "1y":  "1d",
  "5y":  "1wk",
  "max": "1mo",
};
const historyCache = new Map<string, { data: unknown; ts: number }>();
const HIST_TTL = 10 * 60 * 1000;

async function fetchHistory(symbol: string, range: string) {
  const key = `${symbol}:${range}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.ts < HIST_TTL) return cached.data;
  const interval = RANGE_INTERVAL[range] ?? "1d";
  const empty = { symbol, name: symbol, currency: "USD", range, points: [] as Array<{ t: number; c: number }> };
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 600 } },
    );
    if (!res.ok) return empty;
    const j = await res.json();
    const result = j?.chart?.result?.[0];
    const meta = result?.meta;
    const ts: number[] = result?.timestamp ?? [];
    const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
    if (!meta || ts.length === 0) return empty;
    const points: Array<{ t: number; c: number }> = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c === "number" && isFinite(c)) points.push({ t: ts[i] * 1000, c });
    }
    const data = { symbol, name: meta.shortName ?? meta.symbol ?? symbol, currency: meta.currency ?? "USD", range, points };
    historyCache.set(key, { data, ts: Date.now() });
    return data;
  } catch {
    return empty;
  }
}

/** Symbol search via Yahoo's keyless search endpoint — stocks, ETFs, crypto. */
async function searchSymbols(query: string): Promise<Array<{ symbol: string; name: string; type: string; exchange: string }>> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const j = await res.json();
    const quotes: Array<Record<string, unknown>> = Array.isArray(j?.quotes) ? j.quotes : [];
    return quotes
      .filter((q) => typeof q.symbol === "string")
      .map((q) => ({
        symbol: String(q.symbol),
        name: String(q.longname ?? q.shortname ?? q.symbol),
        type: String(q.quoteType ?? "").toUpperCase(),   // EQUITY / ETF / CRYPTOCURRENCY / MUTUALFUND / INDEX
        exchange: String(q.exchDisp ?? q.exchange ?? ""),
      }))
      .filter((q) => ["EQUITY", "ETF", "CRYPTOCURRENCY", "MUTUALFUND", "INDEX", "CURRENCY"].includes(q.type));
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const search = params.get("search");
  if (search !== null) {
    const q = search.trim();
    return NextResponse.json({ results: q.length < 1 ? [] : await searchSymbols(q) });
  }
  // Price history for the chart popup: ?history=SYMBOL&range=1mo|6mo|1y|5y|max
  const history = params.get("history");
  if (history !== null) {
    const symbol = history.trim().toUpperCase();
    const range = params.get("range") ?? "1mo";
    if (!symbol || !RANGE_INTERVAL[range]) return NextResponse.json({ error: "bad history request" }, { status: 400 });
    return NextResponse.json(await fetchHistory(symbol, range));
  }
  const items = await Promise.all(read().map(fetchQuote));
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 40) : "";
  if (!symbol || !/^[A-Z0-9.^=-]{1,15}$/.test(symbol)) {
    return NextResponse.json({ error: "Enter a valid ticker (e.g. AAPL or BTC-USD)" }, { status: 400 });
  }
  const list = read();
  if (list.some((i) => i.symbol.toUpperCase() === symbol)) {
    return NextResponse.json({ error: `${symbol} is already on your watchlist.` }, { status: 409 });
  }
  // Validate the symbol resolves before saving it.
  const quote = await fetchQuote({ symbol });
  if (quote.price === null) {
    return NextResponse.json({ error: `Couldn't find "${symbol}" on Yahoo Finance.` }, { status: 404 });
  }
  list.push(label ? { symbol, label } : { symbol });
  write(list);
  const items = await Promise.all(read().map(fetchQuote));
  return NextResponse.json({ items });
}

export async function DELETE(request: Request) {
  const symbol = (new URL(request.url).searchParams.get("symbol") ?? "").toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  write(read().filter((i) => i.symbol.toUpperCase() !== symbol));
  const items = await Promise.all(read().map(fetchQuote));
  return NextResponse.json({ items });
}
