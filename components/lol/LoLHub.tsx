"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

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

export default function LoLHub({ hideHeader = false }: { hideHeader?: boolean } = {}) {
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

  async function loadSummary(accountId: number) {
    setSummary(null);
    setSummaryError(null);
    setSummaryErrorStatus(null);
    setSummaryLoading(true);
    setNoMoreMatches(false);
    setLoadMoreError(null);
    try {
      const res = await fetch(`/api/lol/summary?accountId=${accountId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSummaryErrorStatus(res.status);
        setSummaryError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setSummary(data);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : String(e));
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    if (selectedId !== null) loadSummary(selectedId);
  }, [selectedId]);

  async function loadAccounts() {
    setLoading(true);
    try {
      const res = await fetch("/api/lol/account");
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      if (data.accounts?.length && selectedId === null) {
        setSelectedId(data.accounts[0].id);
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
    <div className={hideHeader ? "" : "min-h-screen p-6 page-bg"}>
      {!hideHeader && (
        <div className="sticky top-[28px] z-10 -mx-6 px-6 pt-5 pb-3 mb-4 page-bg">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-bold" style={{ color: "var(--accent-blue)" }}>
              ⚔️ League of Legends
            </h1>
          </div>
        </div>
      )}

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
                        src={`https://ddragon.leagueoflegends.com/cdn/${summary.dragonVersion}/img/profileicon/${summary.summoner.profileIconId}.png`}
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
                        {summary?.liveGame && (
                          <span
                            className="rounded-full px-2 py-0.5 font-bold"
                            style={{ background: "var(--accent-red)22", color: "var(--accent-red)" }}
                          >
                            🔴 LIVE · {queueLabel(summary.liveGame.queueId)}
                          </span>
                        )}
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
                  {/* ── Ranks (Solo + Flex) ── */}
                  {summary.ranks.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {summary.ranks
                        .slice()
                        .sort((a, b) => (a.queueType === "RANKED_SOLO_5x5" ? -1 : b.queueType === "RANKED_SOLO_5x5" ? 1 : 0))
                        .map((r) => {
                          const label = r.queueType === "RANKED_SOLO_5x5" ? "Ranked Solo" : r.queueType === "RANKED_FLEX_SR" ? "Ranked Flex" : r.queueType;
                          const games = r.wins + r.losses;
                          const wr = games > 0 ? Math.round((r.wins / games) * 100) : 0;
                          const color = tierColor(r.tier);
                          const emblem = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${r.tier.toLowerCase()}.png`;
                          return (
                            <div key={r.queueType} className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "var(--surface)", border: `1px solid ${color}55` }}>
                              <img
                                src={emblem}
                                alt=""
                                width={56}
                                height={56}
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
                      ) : (
                      <div className="space-y-1.5">
                        {filtered.map((m) => {
                          if (!m.me) return null;
                          const cs = m.me.totalMinionsKilled + m.me.neutralMinionsKilled;
                          const csPerMin = m.gameDuration > 0 ? (cs / (m.gameDuration / 60)).toFixed(1) : "0";
                          const result = m.me.win ? "W" : "L";
                          const resultColor = m.me.win ? "var(--accent-green)" : "var(--accent-red)";
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
                              <img
                                src={`https://ddragon.leagueoflegends.com/cdn/${summary.dragonVersion}/img/champion/${m.me.championName}.png`}
                                alt={m.me.championName}
                                width={36}
                                height={36}
                                className="rounded flex-shrink-0"
                                style={{ background: "var(--surface-2)" }}
                              />
                              {/* Summoner spells (D, F) */}
                              <div className="flex flex-col gap-0.5 flex-shrink-0">
                                {[m.me.summoner1Id, m.me.summoner2Id].map((sid, i) => {
                                  const spellName = summary.summonerSpellsById[sid];
                                  if (!spellName) return <div key={i} className="w-4 h-4 rounded-sm" style={{ background: "var(--surface-2)" }} />;
                                  return (
                                    <img
                                      key={i}
                                      src={`https://ddragon.leagueoflegends.com/cdn/${summary.dragonVersion}/img/spell/${spellName}.png`}
                                      alt={spellName}
                                      title={spellName.replace(/^Summoner/, "")}
                                      width={16}
                                      height={16}
                                      className="rounded-sm"
                                      style={{ background: "var(--surface-2)" }}
                                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                                    />
                                  );
                                })}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {m.me.championName} <span style={{ color: "var(--text-muted)" }}>· {queueLabel(m.queueId)}</span>
                                </div>
                                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                                  {m.me.kills}/{m.me.deaths}/{m.me.assists} · {kda(m.me)} KDA · {cs} CS ({csPerMin}/min) · {formatDuration(m.gameDuration)}
                                </div>
                              </div>
                              <div className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                                {timeAgo(m.gameCreation)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      )}

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

                  {/* ── Champion Performance (aggregate over loaded matches) ── */}
                  {(() => {
                    const perChampion = new Map<string, {
                      name: string; games: number; wins: number;
                      kills: number; deaths: number; assists: number;
                      cs: number; durationSec: number;
                    }>();
                    for (const m of summary.matches) {
                      if (!m.me) continue;
                      const key = m.me.championName;
                      const row = perChampion.get(key) ?? {
                        name: key, games: 0, wins: 0,
                        kills: 0, deaths: 0, assists: 0,
                        cs: 0, durationSec: 0,
                      };
                      row.games      += 1;
                      row.wins       += m.me.win ? 1 : 0;
                      row.kills      += m.me.kills;
                      row.deaths     += m.me.deaths;
                      row.assists    += m.me.assists;
                      row.cs         += m.me.totalMinionsKilled + m.me.neutralMinionsKilled;
                      row.durationSec += m.gameDuration;
                      perChampion.set(key, row);
                    }
                    const rows = [...perChampion.values()].sort((a, b) => b.games - a.games).slice(0, 8);
                    if (rows.length === 0) return null;
                    return (
                      <div>
                        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                          <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                            Champion Performance
                          </h3>
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            Aggregated over {summary.matches.length} loaded match{summary.matches.length === 1 ? "" : "es"}
                            {summary.matches.length < 20 && " · load more matches to grow the sample"}
                          </span>
                        </div>
                        <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                          <table className="w-full text-xs">
                            <thead>
                              <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                                <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}>Champion</th>
                                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>Games</th>
                                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>KDA</th>
                                <th className="px-3 py-2 text-right font-medium hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>CS/m</th>
                                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>WR</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r) => {
                                const denom = r.deaths || 1;
                                const kdaVal = (r.kills + r.assists) / denom;
                                const csPerMin = r.durationSec > 0 ? (r.cs / (r.durationSec / 60)) : 0;
                                const wr = Math.round((r.wins / r.games) * 100);
                                const wrColor = wr >= 55 ? "var(--accent-green)" : wr < 45 ? "var(--accent-red)" : "var(--text-muted)";
                                return (
                                  <tr key={r.name} style={{ borderBottom: "1px solid var(--border)" }}>
                                    <td className="px-3 py-1.5">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <img
                                          src={`https://ddragon.leagueoflegends.com/cdn/${summary.dragonVersion}/img/champion/${r.name}.png`}
                                          alt=""
                                          width={26}
                                          height={26}
                                          className="rounded flex-shrink-0"
                                          style={{ background: "var(--surface-2)" }}
                                        />
                                        <span className="truncate">{r.name}</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-medium">{r.games}</td>
                                    <td className="px-3 py-1.5 text-right">
                                      <div className="font-medium">{kdaVal.toFixed(2)}</div>
                                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                        {(r.kills / r.games).toFixed(1)} / {(r.deaths / r.games).toFixed(1)} / {(r.assists / r.games).toFixed(1)}
                                      </div>
                                    </td>
                                    <td className="px-3 py-1.5 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>
                                      {csPerMin.toFixed(1)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-medium" style={{ color: wrColor }}>
                                      {wr}%
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
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
