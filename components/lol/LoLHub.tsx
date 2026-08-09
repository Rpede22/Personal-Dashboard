"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  ddragonChampionIcon,
  ddragonProfileIcon,
  ddragonSummonerSpellIcon,
  cdragonRankedEmblem,
  cdragonPositionIcon,
} from "@/lib/riot";

import RankSparkline from "./RankSparkline";

const MatchDetailModal = dynamic(() => import("./MatchDetailModal"), { ssr: false });

interface LolAccount {
  id: number;
  gameName: string;
  tagLine: string;
  region: string;
  puuid: string | null;
  sortOrder: number;
  notes: string;
  createdAt: string;
}

// Shape returned by /api/lol/summary
interface RankEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}
interface MatchParticipant {
  puuid: string;
  championName: string;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  win: boolean;
  teamPosition: string;
  visionScore: number;
  summoner1Id: number;
  summoner2Id: number;
  gameEndedInEarlySurrender?: boolean;
  perks?: {
    styles: Array<{
      style: number;
      selections: Array<{ perk: number }>;
      description: string;
    }>;
  };
}
interface MatchSummary {
  id: string;
  gameCreation: number;
  gameDuration: number;
  queueId: number;
  gameMode: string;
  me: MatchParticipant | null;
}
interface MasteryEntry {
  championId: number;
  championName: string;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
}
interface LoLSummary {
  puuid: string;
  summoner: { level: number; profileIconId: number };
  ranks: RankEntry[];
  matches: MatchSummary[];
  mastery: MasteryEntry[];
  liveGame: { queueId: number; gameMode: string; startedAt: number; length: number } | null;
  dragonVersion: string;
  championsById: Record<number, string>;
  summonerSpellsById: Record<number, string>;
  perkIconsById?: Record<number, string>;
  perkStyleIconsById?: Record<number, string>;
}

// Riot queue IDs → readable labels (only the common ones)
const QUEUE_LABELS: Record<number, string> = {
  400: "Draft",
  420: "Ranked Solo",
  430: "Blind Pick",
  440: "Ranked Flex",
  450: "ARAM",
  700: "Clash",
  830: "Bot (Intro)",
  840: "Bot (Beginner)",
  850: "Bot (Intermediate)",
  900: "URF",
  1020: "One For All",
  1400: "Ultimate Spellbook",
  1700: "Arena",
  1900: "URF",
};

function queueLabel(queueId: number): string {
  return QUEUE_LABELS[queueId] ?? `Queue ${queueId}`;
}

function tierColor(tier: string): string {
  const t = tier.toUpperCase();
  if (t === "IRON")        return "#7c7c7c";
  if (t === "BRONZE")      return "#b57543";
  if (t === "SILVER")      return "#c0c0c0";
  if (t === "GOLD")        return "#f0b400";
  if (t === "PLATINUM")    return "#4dc0b3";
  if (t === "EMERALD")     return "#26d17c";
  if (t === "DIAMOND")     return "#5aa4ff";
  if (t === "MASTER")      return "#c66aff";
  if (t === "GRANDMASTER") return "#e15060";
  if (t === "CHALLENGER")  return "#f4c962";
  return "var(--text-muted)";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeAgo(unixMs: number): string {
  const diffSec = (Date.now() - unixMs) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h ago`;
  return `${Math.floor(diffSec / 86400)} d ago`;
}

function kda(m: MatchParticipant): string {
  const denom = m.deaths || 1;
  return ((m.kills + m.assists) / denom).toFixed(2);
}

// Platform routing values Riot uses. See https://developer.riotgames.com/docs/lol
const REGIONS: { value: string; label: string }[] = [
  { value: "euw1", label: "EU West" },
  { value: "eun1", label: "EU Nordic & East" },
  { value: "na1",  label: "North America" },
  { value: "kr",   label: "Korea" },
  { value: "br1",  label: "Brazil" },
  { value: "jp1",  label: "Japan" },
  { value: "la1",  label: "LAN" },
  { value: "la2",  label: "LAS" },
  { value: "oc1",  label: "Oceania" },
  { value: "tr1",  label: "Turkey" },
  { value: "ru",   label: "Russia" },
];

export default function LoLHub(_props?: { hideHeader?: boolean }) {
  // `hideHeader` prop retained for callsite compatibility; the internal header
  // was removed since the hub is only ever rendered inside GameHub.
  void _props;
  const [accounts, setAccounts] = useState<LolAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ gameName: "", tagLine: "", region: "euw1" });

  // Riot data for the selected account
  const [summary, setSummary] = useState<LoLSummary | null>(null);
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryErrorStatus, setSummaryErrorStatus] = useState<number | null>(null);

  // Full-season champion aggregate (from /api/lol/season-champs). Populated
  // independently of `summary.matches` so the sidebar panel isn't limited to
  // the 10 matches shown in the detail pane.
  interface SeasonChampRow {
    name: string; games: number; wins: number;
    kills: number; deaths: number; assists: number;
    cs: number; durationSec: number;
  }
  interface SeasonChampsData {
    champions: SeasonChampRow[];
    sampleSize: number;
    oldestGameMs: number | null;
  }
  const [seasonChamps, setSeasonChamps] = useState<SeasonChampsData | null>(null);
  const [seasonChampsLoading, setSeasonChampsLoading] = useState(false);

  // Per-queue LP snapshots for the selected account — used to compute
  // per-session (per-day) LP deltas rendered on each day header in the match
  // list. Solo (420) is treated as the primary LP source since that's where
  // the emblem/tier lives; flex is included but rarely moves.
  interface RankSnapshot { capturedAt: number; queueType: string; tier: string; division: string; lp: number; ladder: number }
  const [rankHistory, setRankHistory] = useState<Record<string, RankSnapshot[]>>({});

  // Match list controls
  type QueueFilter = "all" | "solo" | "flex" | "aram" | "other";
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [championFilter, setChampionFilter] = useState<string>("all"); // "all" or champion name
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMoreMatches, setNoMoreMatches] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  async function loadMoreMatches() {
    if (!summary) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const start = summary.matches.length;
      const region = accounts.find((a) => a.id === selectedId)?.region;
      if (!region) throw new Error("No region for selected account");
      const res = await fetch(`/api/lol/matches?puuid=${encodeURIComponent(summary.puuid)}&region=${encodeURIComponent(region)}&start=${start}&count=10`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: { matches: LoLSummary["matches"] } = await res.json();
      if (!data.matches || data.matches.length === 0) {
        setNoMoreMatches(true);
      } else {
        setSummary({ ...summary, matches: [...summary.matches, ...data.matches] });
        if (data.matches.length < 10) setNoMoreMatches(true);
      }
    } catch (e) {
      setLoadMoreError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }
  const QUEUE_FILTER_CHIPS: { key: QueueFilter; label: string }[] = [
    { key: "all",   label: "All"   },
    { key: "solo",  label: "Solo"  },
    { key: "flex",  label: "Flex"  },
    { key: "aram",  label: "ARAM"  },
    { key: "other", label: "Other" },
  ];
  function matchInFilter(queueId: number, f: QueueFilter): boolean {
    if (f === "all")   return true;
    if (f === "solo")  return queueId === 420;
    if (f === "flex")  return queueId === 440;
    if (f === "aram")  return queueId === 450;
    // "other" = anything not in the recognised main queues
    return queueId !== 420 && queueId !== 440 && queueId !== 450;
  }

  async function loadSummary(accountId: number, opts: { silent?: boolean; count?: number } = {}) {
    // Silent mode is used by the 90s auto-refresh: we don't blank the summary
    // (which would close an open MatchDetailModal), don't flip the loading
    // spinner, and we ask the server for however many matches the user has
    // already loaded so pagination doesn't collapse back to 10.
    if (!opts.silent) {
      setSummary(null);
      setSummaryError(null);
      setSummaryErrorStatus(null);
      setSummaryLoading(true);
      setNoMoreMatches(false);
      setLoadMoreError(null);
    }
    try {
      const count = opts.count ?? 10;
      const res = await fetch(`/api/lol/summary?accountId=${accountId}&count=${count}`);
      if (!res.ok) {
        if (opts.silent) return; // swallow — don't disturb a working view
        const body = await res.json().catch(() => ({}));
        setSummaryErrorStatus(res.status);
        setSummaryError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setSummary(data);
    } catch (e) {
      if (!opts.silent) setSummaryError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!opts.silent) setSummaryLoading(false);
    }
  }

  useEffect(() => {
    if (selectedId !== null) loadSummary(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Rank snapshots for the selected account, used to compute per-day LP
  // deltas rendered on each session header. 30 days is comfortably wider
  // than the match window the hub loads.
  interface HistoryPoint { t: number; lp: number }
  const [rankHistorySolo, setRankHistorySolo] = useState<HistoryPoint[]>([]);
  void rankHistory;  // linter — rankHistory declared above kept for future use
  useEffect(() => {
    if (selectedId == null) { setRankHistorySolo([]); return; }
    fetch(`/api/lol/rank-history?accountId=${selectedId}&days=30`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const solo = d?.queues?.RANKED_SOLO_5x5 ?? [];
        setRankHistorySolo(solo);
      })
      .catch(() => setRankHistorySolo([]));
  }, [selectedId]);

  /** LP delta for a local calendar day: last snapshot inside the day
   *  minus the last snapshot before the day starts. Uses the ladder LP so
   *  tier changes don't create fake jumps. Returns null when there isn't
   *  enough data. */
  function lpDeltaForDay(dayStartMs: number, dayEndMs: number): number | null {
    if (rankHistorySolo.length === 0) return null;
    const before = [...rankHistorySolo].reverse().find((s) => s.t < dayStartMs);
    const inDay = [...rankHistorySolo].reverse().find((s) => s.t >= dayStartMs && s.t < dayEndMs);
    if (!before || !inDay) return null;
    return inDay.lp - before.lp;
  }

  // Poll for new games while an account is selected. Silent mode preserves
  // the current UI: any open match modal stays open, the "Load 10 more"
  // count is kept, and there's no loading spinner flash.
  useEffect(() => {
    if (selectedId === null) return;
    const iv = setInterval(() => {
      // Ask the server for at least as many matches as the client currently
      // shows so pagination doesn't reset.
      const count = Math.max(10, summary?.matches.length ?? 10);
      loadSummary(selectedId, { silent: true, count });
    }, 90 * 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, summary?.matches.length]);

  // Fetch full-season champion aggregate as soon as we have a puuid. Kept out
  // of loadSummary so /api/lol/summary stays snappy — this can hit 40+ Riot
  // endpoints and take a couple seconds on cold cache.
  useEffect(() => {
    const region = accounts.find((a) => a.id === selectedId)?.region;
    if (!summary?.puuid || !region) {
      setSeasonChamps(null);
      return;
    }
    let cancelled = false;
    setSeasonChampsLoading(true);
    setSeasonChamps(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/lol/season-champs?puuid=${encodeURIComponent(summary.puuid)}&region=${encodeURIComponent(region)}`
        );
        if (!res.ok) return;
        const data: SeasonChampsData = await res.json();
        if (!cancelled) setSeasonChamps(data);
      } catch {
        // swallow — panel is a nice-to-have; detail pane still works
      } finally {
        if (!cancelled) setSeasonChampsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [summary?.puuid, selectedId, accounts]);

  // Preselect an account via ?account=<id> (used by the dashboard widget so
  // clicking on a specific account card jumps to that account in the hub).
  const searchParams = useSearchParams();
  const requestedAccountId = (() => {
    const raw = searchParams?.get("account");
    if (!raw) return null;
    const n = parseInt(raw);
    return isNaN(n) ? null : n;
  })();

  async function loadAccounts() {
    setLoading(true);
    try {
      const res = await fetch("/api/lol/account");
      const data = await res.json();
      const list: LolAccount[] = data.accounts ?? [];
      setAccounts(list);
      if (list.length && selectedId === null) {
        // Prefer the query-param account if it exists; otherwise the first saved.
        const preferred = requestedAccountId !== null && list.some((a) => a.id === requestedAccountId)
          ? requestedAccountId
          : list[0].id;
        setSelectedId(preferred);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAccounts(); }, []);

  const [addError, setAddError] = useState<string | null>(null);

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!form.gameName.trim() || !form.tagLine.trim()) return;
    try {
      const res = await fetch("/api/lol/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameName: form.gameName.trim(),
          tagLine: form.tagLine.trim().replace(/^#/, ""),
          region: form.region,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Prisma throws "no such table: LolAccount" if the packaged DB is on an
        // older schema — call that out so the user knows the exact fix.
        const rawMsg: string = body.error ?? `HTTP ${res.status}`;
        const friendly = rawMsg.toLowerCase().includes("no such table") || rawMsg.toLowerCase().includes("lolaccount")
          ? "Your database is missing the LolAccount table (it was added recently). Run this in the project dir, then relaunch the app: nvm use 22 && DATABASE_URL=\"file:$HOME/Library/Application Support/Dashboard/dashboard.db\" npx prisma db push --skip-generate"
          : rawMsg;
        setAddError(friendly);
        return;
      }
      setForm({ gameName: "", tagLine: "", region: "euw1" });
      setShowForm(false);
      loadAccounts();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteAccount(id: number) {
    if (!confirm("Remove this account?")) return;
    await fetch(`/api/lol/account?id=${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    loadAccounts();
  }

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* ── Accounts sidebar ── */}
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Accounts
            </h2>
            <button
              onClick={() => setShowForm(true)}
              className="text-xs px-2 py-1 rounded-md font-medium"
              style={{ background: "var(--accent-blue)", color: "#fff" }}
            >
              + Add
            </button>
          </div>

          {loading ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
          ) : accounts.length === 0 ? (
            <div className="rounded-xl p-4 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              No accounts yet. Click <strong style={{ color: "var(--accent-blue)" }}>+ Add</strong> to add your Riot ID.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {accounts.map((a) => {
                const active = a.id === selectedId;
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => setSelectedId(a.id)}
                      className="w-full rounded-xl px-3 py-2 text-left flex items-center gap-2"
                      style={{
                        background: active ? "var(--accent-blue)22" : "var(--surface)",
                        border: `1px solid ${active ? "var(--accent-blue)" : "var(--border)"}`,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate" style={{ color: active ? "var(--accent-blue)" : "var(--text)" }}>
                          {a.gameName}
                          <span style={{ color: "var(--text-muted)" }}>#{a.tagLine}</span>
                        </div>
                        <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                          {a.region}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add-account form */}
          {showForm && (
            <form
              onSubmit={addAccount}
              className="rounded-xl p-3 space-y-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Game name</label>
                <input
                  required
                  value={form.gameName}
                  onChange={(e) => setForm((f) => ({ ...f, gameName: e.target.value }))}
                  placeholder="e.g. Rasmus"
                  className="w-full rounded-lg px-2 py-1 text-sm"
                  style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Tag line</label>
                <input
                  required
                  value={form.tagLine}
                  onChange={(e) => setForm((f) => ({ ...f, tagLine: e.target.value }))}
                  placeholder="EUW"
                  className="w-full rounded-lg px-2 py-1 text-sm"
                  style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Region</label>
                <select
                  value={form.region}
                  onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                  className="w-full rounded-lg px-2 py-1 text-sm"
                  style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                >
                  {REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-lg py-1.5 text-sm font-medium" style={{ background: "var(--accent-blue)", color: "#fff" }}>
                  Save
                </button>
                <button type="button" onClick={() => { setShowForm(false); setAddError(null); }} className="flex-1 rounded-lg py-1.5 text-sm" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                  Cancel
                </button>
              </div>
              {addError && (
                <p
                  className="text-xs whitespace-pre-wrap break-words rounded-md p-2"
                  style={{ background: "var(--accent-red)11", color: "var(--accent-red)", border: "1px solid var(--accent-red)44" }}
                >
                  {addError}
                </p>
              )}
            </form>
          )}

          {/* ── Rank history — LP trend, 60d window, tier icons on Y-axis ── */}
          {selectedId !== null && (
            <div className="pt-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                Rank history
              </h2>
              <RankSparkline accountId={selectedId} />
            </div>
          )}

          {/* ── Top champions this season (full ranked history, not just loaded matches) ── */}
          {selected && summary && (
            <div className="pt-2">
              <div className="flex items-baseline justify-between mb-2 gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Top champions
                </h2>
                {seasonChamps && seasonChamps.sampleSize > 0 && (
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {seasonChamps.sampleSize} ranked
                  </span>
                )}
              </div>
              {seasonChampsLoading ? (
                <div className="rounded-xl p-3 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                  Loading season data…
                </div>
              ) : !seasonChamps || seasonChamps.champions.length === 0 ? (
                <div className="rounded-xl p-3 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                  No ranked games in the recent history.
                </div>
              ) : (
                <ul className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  {seasonChamps.champions.slice(0, 6).map((r) => {
                    const denom = r.deaths || 1;
                    const kdaVal = (r.kills + r.assists) / denom;
                    const wr = Math.round((r.wins / r.games) * 100);
                    const wrColor = wr >= 55 ? "var(--accent-green)" : wr < 45 ? "var(--accent-red)" : "var(--text-muted)";
                    return (
                      <li key={r.name} className="flex items-center gap-2 px-2.5 py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
                        <img
                          src={ddragonChampionIcon(summary.dragonVersion, r.name)}
                          alt=""
                          width={26}
                          height={26}
                          className="rounded flex-shrink-0"
                          style={{ background: "var(--surface-2)" }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{r.name}</div>
                          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {r.games}g · {kdaVal.toFixed(2)} KDA
                          </div>
                        </div>
                        <span className="text-xs font-semibold flex-shrink-0" style={{ color: wrColor }}>
                          {wr}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </aside>

        {/* ── Detail pane ── */}
        <section>
          {selected ? (
            <div className="space-y-4">
              {/* Header — Riot ID + profile icon + level + live-game badge */}
              <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    {summary && (
                      <img
                        src={ddragonProfileIcon(summary.dragonVersion, summary.summoner.profileIconId)}
                        alt=""
                        width={64}
                        height={64}
                        className="rounded-lg flex-shrink-0"
                        style={{ background: "var(--surface-2)" }}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-2xl font-bold truncate" style={{ color: "var(--text)" }}>
                        {selected.gameName}<span style={{ color: "var(--text-muted)" }}>#{selected.tagLine}</span>
                      </div>
                      <div className="text-xs uppercase tracking-wide mt-1 flex items-center gap-2 flex-wrap" style={{ color: "var(--text-muted)" }}>
                        <span>{selected.region}</span>
                        {summary && <span>· Lvl {summary.summoner.level}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => loadSummary(selected.id)}
                      className="text-xs px-3 py-1.5 rounded-md font-medium"
                      style={{ background: "var(--accent-blue)", color: "#fff" }}
                    >
                      ⟳ Refresh
                    </button>
                    <button
                      onClick={() => deleteAccount(selected.id)}
                      className="text-xs px-3 py-1.5 rounded-md font-medium"
                      style={{ color: "var(--accent-red)", border: "1px solid var(--accent-red)44" }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              {summaryLoading && (
                <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <p style={{ color: "var(--text-muted)" }}>Fetching Riot data…</p>
                </div>
              )}

              {summaryError && (
                <div
                  className="rounded-2xl p-5 space-y-2"
                  style={{ background: "var(--surface)", border: "1px solid var(--accent-red)44" }}
                >
                  <p className="text-sm font-medium" style={{ color: "var(--accent-red)" }}>
                    {summaryError}
                  </p>
                  {summaryErrorStatus === 503 && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Get a 24-hour dev key at{" "}
                      <a
                        href="https://developer.riotgames.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                        style={{ color: "var(--accent-blue)" }}
                      >
                        developer.riotgames.com
                      </a>
                      , add it as <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>RIOT_API_KEY</code>{" "}
                      in <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>.env.local</code>, then rebuild the app.
                    </p>
                  )}
                  {summaryErrorStatus === 429 && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Riot rate limit hit (100 req / 2 min on the dev tier). Wait a couple of minutes and try Refresh.
                    </p>
                  )}
                  {summaryErrorStatus === 403 && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Your Riot API key was rejected. Dev keys expire every 24 hours — get a fresh one and update{" "}
                      <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>.env.local</code>.
                    </p>
                  )}
                </div>
              )}

              {summary && (
                <>
                  {/* ── Ranks (Solo + Flex) + Recent-champion strip ── */}
                  {summary.ranks.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
                      {summary.ranks
                        .slice()
                        .sort((a, b) => (a.queueType === "RANKED_SOLO_5x5" ? -1 : b.queueType === "RANKED_SOLO_5x5" ? 1 : 0))
                        .map((r) => {
                          const label = r.queueType === "RANKED_SOLO_5x5" ? "Ranked Solo" : r.queueType === "RANKED_FLEX_SR" ? "Ranked Flex" : r.queueType;
                          const games = r.wins + r.losses;
                          const wr = games > 0 ? Math.round((r.wins / games) * 100) : 0;
                          const color = tierColor(r.tier);
                          const emblem = cdragonRankedEmblem(r.tier);
                          return (
                            <div key={r.queueType} className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "var(--surface)", border: `1px solid ${color}55` }}>
                              <img
                                src={emblem}
                                alt=""
                                width={160}
                                height={160}
                                className="flex-shrink-0"
                                style={{ objectFit: "contain" }}
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
                                  {label}
                                </div>
                                <div className="text-xl font-bold capitalize" style={{ color }}>
                                  {r.tier.toLowerCase()} {r.rank}
                                </div>
                                <div className="text-sm" style={{ color: "var(--text)" }}>
                                  {r.leaguePoints} LP · {r.wins}W {r.losses}L ·{" "}
                                  <span style={{ color: wr >= 55 ? "var(--accent-green)" : wr < 45 ? "var(--accent-red)" : "var(--text-muted)" }}>
                                    {wr}% WR
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      {/* Top-3 champions from the loaded matches — inline strip next to the rank cards */}
                      {(() => {
                        const perChamp = new Map<string, { name: string; games: number; wins: number; kills: number; deaths: number; assists: number }>();
                        for (const m of summary.matches) {
                          if (!m.me) continue;
                          const row = perChamp.get(m.me.championName) ?? { name: m.me.championName, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
                          row.games += 1;
                          row.wins += m.me.win ? 1 : 0;
                          row.kills += m.me.kills; row.deaths += m.me.deaths; row.assists += m.me.assists;
                          perChamp.set(m.me.championName, row);
                        }
                        const top3 = [...perChamp.values()].sort((a, b) => b.games - a.games).slice(0, 3);
                        if (top3.length === 0) return null;
                        return (
                          <div className="rounded-2xl p-3 flex flex-col gap-1.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                            <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                              Last {summary.matches.length} games
                            </div>
                            {top3.map((c) => {
                              const wr = Math.round((c.wins / c.games) * 100);
                              const wrColor = wr >= 55 ? "var(--accent-green)" : wr < 45 ? "var(--accent-red)" : "var(--text-muted)";
                              const kdaVal = ((c.kills + c.assists) / (c.deaths || 1)).toFixed(1);
                              return (
                                <div key={c.name} className="flex items-center gap-2 min-w-[180px]">
                                  <img
                                    src={ddragonChampionIcon(summary.dragonVersion, c.name)}
                                    alt=""
                                    width={28}
                                    height={28}
                                    className="rounded flex-shrink-0"
                                    style={{ background: "var(--surface-2)" }}
                                  />
                                  <div className="flex-1 min-w-0 text-xs">
                                    <div className="font-medium truncate">{c.name}</div>
                                    <div style={{ color: "var(--text-muted)" }}>
                                      <span style={{ color: wrColor, fontWeight: 600 }}>{wr}%</span>
                                      {" · "}{c.wins}W{c.games - c.wins}L
                                      {" · "}{kdaVal} KDA
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {summary.ranks.length === 0 && (
                    <div className="rounded-2xl p-4 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                      No ranked games this split.
                    </div>
                  )}

                  {/* ── Recent matches ── */}
                  {summary.matches.length > 0 && (() => {
                    const filtered = summary.matches.filter((m) =>
                      matchInFilter(m.queueId, queueFilter) &&
                      (championFilter === "all" || (m.me?.championName === championFilter))
                    );
                    // Build the champion picker options — unique names from the loaded matches, alpha-sorted
                    const championsInMatches = [...new Set(summary.matches.map((m) => m.me?.championName).filter(Boolean) as string[])].sort();
                    return (
                    <div>
                      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
                        <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                          Recent matches ({filtered.length}{filtered.length !== summary.matches.length ? ` / ${summary.matches.length}` : ""})
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={championFilter}
                            onChange={(e) => setChampionFilter(e.target.value)}
                            className="text-xs rounded-full px-2.5 py-1 font-medium"
                            style={{
                              background: championFilter === "all" ? "var(--surface-2)" : "var(--accent-blue)",
                              color: championFilter === "all" ? "var(--text-muted)" : "#fff",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <option value="all">All champs</option>
                            {championsInMatches.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <div className="flex gap-1">
                            {QUEUE_FILTER_CHIPS.map((c) => {
                              const active = queueFilter === c.key;
                              return (
                                <button
                                  key={c.key}
                                  onClick={() => setQueueFilter(c.key)}
                                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                                  style={{
                                    background: active ? "var(--accent-blue)" : "var(--surface-2)",
                                    color: active ? "#fff" : "var(--text-muted)",
                                    border: "1px solid var(--border)",
                                  }}
                                >
                                  {c.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      {filtered.length === 0 ? (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          No matches in this queue. Try a different filter.
                        </p>
                      ) : (() => {
                        // Group filtered matches by local calendar day (newest first,
                        // matching the underlying order of `filtered`). Each day gets
                        // a sticky-ish header with W/L + total playtime for a
                        // quick "how did today go?" glance.
                        interface DayGroup { key: string; label: string; matches: typeof filtered; wins: number; losses: number; totalSec: number }
                        const groups: DayGroup[] = [];
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const yesterday = new Date(today);
                        yesterday.setDate(today.getDate() - 1);

                        function dayLabel(d: Date): string {
                          if (d.getTime() === today.getTime()) return "Today";
                          if (d.getTime() === yesterday.getTime()) return "Yesterday";
                          const sameYear = d.getFullYear() === today.getFullYear();
                          return d.toLocaleDateString("en-GB", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            ...(sameYear ? {} : { year: "numeric" }),
                          });
                        }

                        for (const m of filtered) {
                          if (!m.me) continue;
                          const d = new Date(m.gameCreation);
                          d.setHours(0, 0, 0, 0);
                          const key = d.toISOString().slice(0, 10);
                          let g = groups[groups.length - 1];
                          if (!g || g.key !== key) {
                            g = { key, label: dayLabel(d), matches: [], wins: 0, losses: 0, totalSec: 0 };
                            groups.push(g);
                          }
                          g.matches.push(m);
                          // Remakes don't count toward W/L in the day header,
                          // matching Riot's own tracking.
                          if (!m.me.gameEndedInEarlySurrender) {
                            if (m.me.win) g.wins++; else g.losses++;
                          }
                          g.totalSec += m.gameDuration;
                        }

                        return (
                          <div className="space-y-3">
                            {groups.map((g) => {
                              const netColor = g.wins > g.losses ? "var(--accent-green)"
                                : g.wins < g.losses ? "var(--accent-red)"
                                : "var(--text-muted)";
                              // Per-session LP delta — solo queue snapshots taken during this day.
                              const dayStart = new Date(g.key + "T00:00:00").getTime();
                              const dayEnd = dayStart + 86400000;
                              const lp = lpDeltaForDay(dayStart, dayEnd);
                              // Top champion of the session — most wins, then most games,
                              // then best KDA. Remakes excluded.
                              const byChamp = new Map<string, { games: number; wins: number; k: number; d: number; a: number }>();
                              for (const m of g.matches) {
                                if (!m.me || m.me.gameEndedInEarlySurrender) continue;
                                const cur = byChamp.get(m.me.championName) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0 };
                                cur.games++; if (m.me.win) cur.wins++;
                                cur.k += m.me.kills; cur.d += m.me.deaths; cur.a += m.me.assists;
                                byChamp.set(m.me.championName, cur);
                              }
                              let topChamp: { name: string; games: number; wins: number; kda: number } | null = null;
                              for (const [name, s] of byChamp) {
                                const kda = (s.k + s.a) / Math.max(1, s.d);
                                const cand = { name, games: s.games, wins: s.wins, kda };
                                if (!topChamp
                                    || cand.wins > topChamp.wins
                                    || (cand.wins === topChamp.wins && cand.games > topChamp.games)
                                    || (cand.wins === topChamp.wins && cand.games === topChamp.games && cand.kda > topChamp.kda)) {
                                  topChamp = cand;
                                }
                              }
                              const showChamp = topChamp && topChamp.games >= 2;
                              return (
                                <div key={g.key}>
                                  <div className="flex items-baseline justify-between mb-1.5 px-1 gap-2 flex-wrap">
                                    <span className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2" style={{ color: "var(--text)" }}>
                                      {g.label}
                                      {lp != null && lp !== 0 && (
                                        <span
                                          className="text-[10px] px-1.5 py-0.5 rounded tabular-nums"
                                          style={{
                                            color: lp > 0 ? "var(--accent-green)" : "var(--accent-red)",
                                            background: lp > 0 ? "var(--accent-green)22" : "var(--accent-red)22",
                                          }}
                                          title="Solo queue LP change this session"
                                        >
                                          {lp > 0 ? "▲" : "▼"} {Math.abs(lp)} LP
                                        </span>
                                      )}
                                      {showChamp && topChamp && (
                                        <span
                                          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                                          title="Best champion this session"
                                        >
                                          {summary?.dragonVersion && (
                                            <img
                                              src={ddragonChampionIcon(summary.dragonVersion, topChamp.name)}
                                              alt=""
                                              width={14} height={14}
                                              style={{ borderRadius: 2 }}
                                            />
                                          )}
                                          <span className="font-semibold" style={{ color: "var(--text)" }}>{topChamp.name}</span>
                                          <span>· {topChamp.wins}W/{topChamp.games - topChamp.wins}L · {topChamp.kda.toFixed(1)} KDA</span>
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                      <span style={{ color: netColor, fontWeight: 600 }}>{g.wins}W · {g.losses}L</span>
                                      <span> · {formatDuration(g.totalSec)} played</span>
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {g.matches.map((m) => {
                          if (!m.me) return null;
                          const cs = m.me.totalMinionsKilled + m.me.neutralMinionsKilled;
                          const csPerMin = m.gameDuration > 0 ? (cs / (m.gameDuration / 60)).toFixed(1) : "0";
                          // Remakes (all players agreed to end early, ~3:30 mark)
                          // aren't wins or losses — surface them so the row
                          // matches what the Riot client shows.
                          const isRemake = m.me.gameEndedInEarlySurrender === true;
                          const result = isRemake ? "R" : m.me.win ? "W" : "L";
                          const resultColor = isRemake ? "var(--text-muted)" : m.me.win ? "var(--accent-green)" : "var(--accent-red)";
                          const positionSlug = m.me.teamPosition ? m.me.teamPosition.toLowerCase() : "";
                          const positionLabel = m.me.teamPosition === "UTILITY" ? "support" : positionSlug;
                          return (
                            <div
                              key={m.id}
                              onClick={() => setOpenMatchId(m.id)}
                              title="Click for full match detail"
                              className="rounded-lg px-3 py-2 flex items-center gap-3 cursor-pointer hover:brightness-110"
                              style={{
                                background: "var(--surface)",
                                border: `1px solid ${resultColor}44`,
                              }}
                            >
                              <span
                                className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                                style={{ background: resultColor, color: "#fff" }}
                              >
                                {result}
                              </span>
                              {/* Champion portrait with role icon overlay on bottom-left */}
                              <div className="relative flex-shrink-0" style={{ width: 44, height: 44 }}>
                                <img
                                  src={ddragonChampionIcon(summary.dragonVersion, m.me.championName)}
                                  alt={m.me.championName}
                                  width={44}
                                  height={44}
                                  className="rounded"
                                  style={{ background: "var(--surface-2)" }}
                                />
                                {positionSlug && (
                                  <span
                                    title={positionLabel}
                                    className="absolute -bottom-0.5 -left-0.5 rounded-full flex items-center justify-center"
                                    style={{ width: 16, height: 16, background: "var(--surface)", border: "1px solid var(--border)" }}
                                  >
                                    <img
                                      src={cdragonPositionIcon(positionSlug)}
                                      alt=""
                                      width={11}
                                      height={11}
                                      style={{ filter: "invert(100%)", opacity: 0.85 }}
                                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                                    />
                                  </span>
                                )}
                              </div>
                              {/* Summoner spells (D, F) */}
                              <div className="flex flex-col gap-0.5 flex-shrink-0">
                                {[m.me.summoner1Id, m.me.summoner2Id].map((sid, i) => {
                                  const spellName = summary.summonerSpellsById[sid];
                                  if (!spellName) return <div key={i} className="w-4 h-4 rounded-sm" style={{ background: "var(--surface-2)" }} />;
                                  return (
                                    <img
                                      key={i}
                                      src={ddragonSummonerSpellIcon(summary.dragonVersion, spellName)}
                                      alt={spellName}
                                      title={spellName.replace(/^Summoner/, "")}
                                      width={18}
                                      height={18}
                                      className="rounded-sm"
                                      style={{ background: "var(--surface-2)" }}
                                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                                    />
                                  );
                                })}
                              </div>
                              {/* Runes: keystone (primary) + secondary tree icon.
                                  URLs come from Community Dragon's perks.json /
                                  perkstyles.json — resolved server-side and
                                  passed through so the client doesn't have to
                                  guess file paths. */}
                              {(() => {
                                const primary = m.me.perks?.styles.find((s) => s.description === "primaryStyle");
                                const secondary = m.me.perks?.styles.find((s) => s.description === "subStyle");
                                const keystoneId = primary?.selections[0]?.perk;
                                const secondaryTreeId = secondary?.style;
                                const keystoneUrl = keystoneId != null ? summary.perkIconsById?.[keystoneId] : undefined;
                                const secondaryUrl = secondaryTreeId != null ? summary.perkStyleIconsById?.[secondaryTreeId] : undefined;
                                if (!keystoneUrl && !secondaryUrl) return null;
                                return (
                                  <div className="flex flex-col gap-0.5 flex-shrink-0 items-center">
                                    {keystoneUrl ? (
                                      <img
                                        src={keystoneUrl}
                                        alt="keystone"
                                        title="Keystone"
                                        width={20}
                                        height={20}
                                        className="rounded-full"
                                        style={{ background: "#000" }}
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                                      />
                                    ) : (
                                      <div style={{ width: 20, height: 20 }} />
                                    )}
                                    {secondaryUrl ? (
                                      <img
                                        src={secondaryUrl}
                                        alt="secondary tree"
                                        title="Secondary tree"
                                        width={14}
                                        height={14}
                                        style={{ opacity: 0.85 }}
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                                      />
                                    ) : (
                                      <div style={{ width: 14, height: 14 }} />
                                    )}
                                  </div>
                                );
                              })()}
                              {/* Info column — clearer hierarchy */}
                              <div className="flex-1 min-w-0">
                                {/* Line 1: champion + meta (queue · duration) */}
                                <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                                  <span className="font-semibold truncate" style={{ fontSize: "0.95rem", color: "var(--text)" }}>
                                    {m.me.championName}
                                  </span>
                                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                                    {queueLabel(m.queueId)} · {formatDuration(m.gameDuration)}
                                  </span>
                                </div>
                                {/* Line 2: KDA (prominent) + CS (secondary) */}
                                <div className="flex items-baseline gap-3 mt-0.5 flex-wrap">
                                  <span className="font-bold" style={{ fontSize: "0.95rem", color: "var(--text)" }}>
                                    {m.me.kills}
                                    <span style={{ color: "var(--text-muted)" }}> / </span>
                                    <span style={{ color: "var(--accent-red)" }}>{m.me.deaths}</span>
                                    <span style={{ color: "var(--text-muted)" }}> / </span>
                                    {m.me.assists}
                                  </span>
                                  <span
                                    className="text-xs font-semibold px-1.5 py-0.5 rounded"
                                    style={{
                                      background: "var(--surface-2)",
                                      color: parseFloat(kda(m.me)) >= 3 ? "var(--accent-green)" : parseFloat(kda(m.me)) < 1.5 ? "var(--accent-red)" : "var(--text-muted)",
                                    }}
                                    title="Kills + Assists / Deaths"
                                  >
                                    {kda(m.me)} KDA
                                  </span>
                                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                                    {cs} CS · {csPerMin}/min
                                  </span>
                                </div>
                              </div>
                              <div className="text-xs flex-shrink-0 self-start" style={{ color: "var(--text-muted)" }}>
                                {timeAgo(m.gameCreation)}
                              </div>
                            </div>
                          );
                        })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Load more */}
                      <div className="flex flex-col items-center gap-1 mt-3">
                        {noMoreMatches ? (
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            No more matches on record.
                          </p>
                        ) : (
                          <button
                            onClick={loadMoreMatches}
                            disabled={loadingMore}
                            className="text-sm px-4 py-1.5 rounded-md font-medium"
                            style={{
                              background: loadingMore ? "var(--surface-2)" : "var(--accent-blue)22",
                              color: "var(--accent-blue)",
                              border: "1px solid var(--accent-blue)44",
                            }}
                          >
                            {loadingMore ? "Loading…" : "Load 10 more"}
                          </button>
                        )}
                        {loadMoreError && (
                          <p className="text-xs" style={{ color: "var(--accent-red)" }}>
                            {loadMoreError}
                          </p>
                        )}
                      </div>
                    </div>
                    );
                  })()}

                </>
              )}
            </div>
          ) : (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p style={{ color: "var(--text-muted)" }}>
                {accounts.length === 0
                  ? "Add your first Riot ID to get started."
                  : "Pick an account from the sidebar."}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Match detail popover */}
      {openMatchId && selected && summary && (
        <MatchDetailModal
          matchId={openMatchId}
          region={selected.region}
          focusPuuid={summary.puuid}
          onClose={() => setOpenMatchId(null)}
        />
      )}
    </div>
  );
}
