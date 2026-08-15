"use client";

import { useEffect, useMemo, useState } from "react";
import HubShell from "@/components/HubShell";

interface Show {
  id: number;
  title: string;
  channel: string;
  airDays: string;      // "0,3,5" (JS days)
  airTime: string;      // "20:00" or ""
  active: boolean;
  episodesSeen: number;
  /** Optional cap. When set and `episodesSeen >= maxEpisodes` the show
   *  auto-hides from Tonight / Next up (still visible in All shows). */
  maxEpisodes: number | null;
  notes: string;
  sortOrder: number;
  createdAt: string;
}

/** True when the user has watched every known episode. Shows without a
 *  configured cap are never considered finished. */
export function isFinished(s: Pick<Show, "episodesSeen" | "maxEpisodes">): boolean {
  return typeof s.maxEpisodes === "number" && s.maxEpisodes > 0 && s.episodesSeen >= s.maxEpisodes;
}

const DAYS: Array<{ n: number; short: string; label: string }> = [
  { n: 1, short: "Mon", label: "Monday" },
  { n: 2, short: "Tue", label: "Tuesday" },
  { n: 3, short: "Wed", label: "Wednesday" },
  { n: 4, short: "Thu", label: "Thursday" },
  { n: 5, short: "Fri", label: "Friday" },
  { n: 6, short: "Sat", label: "Saturday" },
  { n: 0, short: "Sun", label: "Sunday" },
];

function parseDays(s: string): Set<number> {
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const n = Number(part);
    if (Number.isFinite(n) && n >= 0 && n <= 6) out.add(n);
  }
  return out;
}

function joinDays(set: Set<number>): string {
  return [...set].sort().join(",");
}

/** Minutes-until an air-time today. Negative → already aired. Returns null
 *  if `time` isn't a valid HH:MM. */
function minutesUntil(time: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const now = new Date();
  const then = new Date();
  then.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return Math.round((then.getTime() - now.getTime()) / 60000);
}

/** Compute the shows airing on a given weekday, sorted by air time. */
function showsOnDay(shows: Show[], dayN: number): Show[] {
  return shows
    .filter((s) => s.active && !isFinished(s) && parseDays(s.airDays).has(dayN))
    .sort((a, b) => (a.airTime || "99:99").localeCompare(b.airTime || "99:99"));
}

export default function MediaHub() {
  const [shows, setShows] = useState<Show[] | null>(null);
  const [saving, setSaving] = useState(false);

  const [addTitle, setAddTitle] = useState("");
  const [addChannel, setAddChannel] = useState("");
  const [addTime, setAddTime] = useState("");
  const [addDays, setAddDays] = useState<Set<number>>(new Set());
  const [addNotes, setAddNotes] = useState("");
  const [addMaxEpisodes, setAddMaxEpisodes] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Show>>({});

  async function load() {
    const res = await fetch("/api/media");
    const j = await res.json();
    setShows(j.shows ?? []);
  }
  useEffect(() => { load(); }, []);

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await load();
    } finally { setSaving(false); }
  }
  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch("/api/media", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await load();
    } finally { setSaving(false); }
  }
  async function del(id: number) {
    if (!confirm("Delete this show?")) return;
    setSaving(true);
    try {
      await fetch(`/api/media?id=${id}`, { method: "DELETE" });
      await load();
    } finally { setSaving(false); }
  }

  async function addShow() {
    if (!addTitle.trim()) return;
    const maxN = Number(addMaxEpisodes);
    await post({
      title: addTitle.trim(),
      channel: addChannel.trim(),
      airTime: addTime.trim(),
      airDays: joinDays(addDays),
      notes: addNotes.trim(),
      maxEpisodes: Number.isInteger(maxN) && maxN > 0 ? maxN : null,
    });
    setAddTitle(""); setAddChannel(""); setAddTime(""); setAddDays(new Set()); setAddNotes(""); setAddMaxEpisodes("");
  }

  const todayN = new Date().getDay();
  const tonightShows = useMemo(() => shows ? showsOnDay(shows, todayN) : [], [shows, todayN]);

  // "Airing now" is any show whose time is within [now-30m, now+120m] today.
  const airingNow = useMemo(() => {
    if (!shows) return [] as Show[];
    return tonightShows.filter((s) => {
      const m = minutesUntil(s.airTime);
      return m !== null && m >= -30 && m <= 120;
    });
  }, [shows, tonightShows]);

  const startEdit = (s: Show) => {
    setEditingId(s.id);
    setEditDraft({ title: s.title, channel: s.channel, airTime: s.airTime, airDays: s.airDays, notes: s.notes, active: s.active, maxEpisodes: s.maxEpisodes });
  };
  const saveEdit = async () => {
    if (editingId == null) return;
    await patch({ id: editingId, ...editDraft });
    setEditingId(null);
    setEditDraft({});
  };

  return (
    <HubShell
      title="Media"
      emoji="📺"
      color="var(--accent-purple)"
      tabs={
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <span>{shows?.filter(s => s.active).length ?? 0} active shows</span>
          <span className="ml-auto">Manual tracker — no scrape.</span>
        </div>
      }
    >
      {shows === null ? (
        <p style={{ color: "var(--text-muted)" }}>Loading shows…</p>
      ) : (
        <div className="space-y-6 max-w-5xl mx-auto">

          {/* ── Airing tonight ── */}
          <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: `1px solid var(--accent-purple)44` }}>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--accent-purple)" }}>
              Tonight — {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
            </div>
            {tonightShows.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>No shows scheduled for tonight.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tonightShows.map((s) => {
                  const mins = minutesUntil(s.airTime);
                  const soon = mins !== null && mins >= 0 && mins <= 120;
                  const past = mins !== null && mins < 0;
                  return (
                    <div
                      key={s.id}
                      className="rounded-xl px-3 py-2"
                      style={{
                        background: soon ? "var(--accent-purple)22" : "var(--surface-2)",
                        border: `1px solid ${soon ? "var(--accent-purple)" : "var(--border)"}`,
                        opacity: past ? 0.55 : 1,
                      }}
                    >
                      <div className="text-sm font-semibold">
                        {s.airTime && <span className="mr-2 tabular-nums" style={{ color: soon ? "var(--accent-purple)" : "var(--text-muted)" }}>{s.airTime}</span>}
                        {s.title}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {s.channel || "—"}
                        {mins !== null && mins >= 0 && mins <= 240 && (
                          <span> · in {mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}</span>
                        )}
                        {past && <span> · aired</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {airingNow.length > 0 && (
              <div className="text-xs mt-2" style={{ color: "var(--accent-purple)" }}>
                🔴 {airingNow.length} show{airingNow.length === 1 ? "" : "s"} within the next 2h
              </div>
            )}
          </div>

          {/* ── Weekly grid ── */}
          <div>
            <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>This week</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {DAYS.map((d) => {
                const isToday = d.n === todayN;
                const dayShows = showsOnDay(shows, d.n);
                return (
                  <div
                    key={d.n}
                    className="rounded-xl p-3 min-h-[110px]"
                    style={{
                      background: "var(--surface)",
                      border: `1px solid ${isToday ? "var(--accent-purple)" : "var(--border)"}`,
                    }}
                  >
                    <div className="text-xs font-semibold mb-2" style={{ color: isToday ? "var(--accent-purple)" : "var(--text-muted)" }}>
                      {d.short}{isToday && " · today"}
                    </div>
                    {dayShows.length === 0 ? (
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>—</div>
                    ) : (
                      <ul className="space-y-1">
                        {dayShows.map((s) => (
                          <li key={s.id} className="text-xs">
                            {s.airTime && <span className="tabular-nums font-semibold mr-1" style={{ color: "var(--text-muted)" }}>{s.airTime}</span>}
                            <span>{s.title}</span>
                            {s.channel && <span className="ml-1" style={{ color: "var(--text-muted)" }}>· {s.channel}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Add a new show ── */}
          <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Add a show</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <input
                type="text" placeholder="Show title *"
                value={addTitle} onChange={(e) => setAddTitle(e.target.value)}
                className="text-sm px-2 py-1.5 rounded-md"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
              <input
                type="text" placeholder="Channel (DR1, TV2, Netflix …)"
                value={addChannel} onChange={(e) => setAddChannel(e.target.value)}
                className="text-sm px-2 py-1.5 rounded-md"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
              <input
                type="text" placeholder="Air time (HH:MM) — leave blank if it varies"
                value={addTime} onChange={(e) => setAddTime(e.target.value)}
                pattern="\d{2}:\d{2}"
                className="text-sm px-2 py-1.5 rounded-md"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
              <input
                type="number" min="1" placeholder="Total episodes (optional)"
                value={addMaxEpisodes} onChange={(e) => setAddMaxEpisodes(e.target.value)}
                title="Set the season/series length so the show auto-hides from Tonight / Next up once you've watched them all."
                className="text-sm px-2 py-1 rounded w-40"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
              <input
                type="text" placeholder="Notes (optional)"
                value={addNotes} onChange={(e) => setAddNotes(e.target.value)}
                className="text-sm px-2 py-1.5 rounded-md"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {DAYS.map((d) => {
                const on = addDays.has(d.n);
                return (
                  <button
                    key={d.n}
                    type="button"
                    onClick={() => {
                      const next = new Set(addDays);
                      if (next.has(d.n)) next.delete(d.n); else next.add(d.n);
                      setAddDays(next);
                    }}
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      background: on ? "var(--accent-purple)22" : "var(--surface-2)",
                      color: on ? "var(--accent-purple)" : "var(--text-muted)",
                      border: `1px solid ${on ? "var(--accent-purple)" : "var(--border)"}`,
                    }}
                  >{d.short}</button>
                );
              })}
            </div>
            <button
              onClick={addShow}
              disabled={saving || !addTitle.trim()}
              className="text-sm px-3 py-1.5 rounded-md"
              style={{ background: "var(--accent-purple)22", color: "var(--accent-purple)", border: "1px solid var(--accent-purple)" }}
            >Add show</button>
          </div>

          {/* ── All shows (edit / delete) ── */}
          <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>All shows · {shows.length}</div>
            {shows.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing tracked yet.</div>
            ) : (
              <ul className="space-y-1">
                {shows.map((s) => {
                  const days = [...parseDays(s.airDays)].sort().map((n) => DAYS.find((d) => d.n === n)?.short).filter(Boolean).join(" · ");
                  const editing = editingId === s.id;
                  return (
                    <li key={s.id} className="rounded-md p-2 text-sm" style={{ background: "var(--surface-2)", opacity: s.active ? 1 : 0.55 }}>
                      {editing ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input value={String(editDraft.title ?? "")} onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                            className="text-sm px-2 py-1 rounded" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }} />
                          <input value={String(editDraft.channel ?? "")} onChange={(e) => setEditDraft((d) => ({ ...d, channel: e.target.value }))}
                            placeholder="Channel" className="text-sm px-2 py-1 rounded" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }} />
                          <input value={String(editDraft.airTime ?? "")} onChange={(e) => setEditDraft((d) => ({ ...d, airTime: e.target.value }))}
                            placeholder="HH:MM" className="text-sm px-2 py-1 rounded" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }} />
                          <input value={String(editDraft.airDays ?? "")} onChange={(e) => setEditDraft((d) => ({ ...d, airDays: e.target.value }))}
                            placeholder="Days (0=Sun,1=Mon,…)" className="text-sm px-2 py-1 rounded" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }} />
                          <input
                            type="number" min="1"
                            value={editDraft.maxEpisodes == null ? "" : String(editDraft.maxEpisodes)}
                            onChange={(e) => setEditDraft((d) => {
                              const v = e.target.value;
                              const n = Number(v);
                              return { ...d, maxEpisodes: v === "" ? null : Number.isInteger(n) && n > 0 ? n : d.maxEpisodes };
                            })}
                            placeholder="Total episodes (optional)"
                            title="Auto-hide once episodesSeen reaches this number"
                            className="text-sm px-2 py-1 rounded" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
                          />
                          <input value={String(editDraft.notes ?? "")} onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                            placeholder="Notes" className="text-sm px-2 py-1 rounded sm:col-span-2" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }} />
                          <label className="text-xs flex items-center gap-1 sm:col-span-2" style={{ color: "var(--text-muted)" }}>
                            <input type="checkbox" checked={editDraft.active ?? true} onChange={(e) => setEditDraft((d) => ({ ...d, active: e.target.checked }))} />
                            Active (uncheck to hide from grid without deleting)
                          </label>
                          <div className="sm:col-span-2 flex gap-2">
                            <button onClick={saveEdit} className="text-xs px-2 py-1 rounded" style={{ background: "var(--accent-purple)22", color: "var(--accent-purple)", border: "1px solid var(--accent-purple)" }}>Save</button>
                            <button onClick={() => { setEditingId(null); setEditDraft({}); }} className="text-xs" style={{ color: "var(--text-muted)" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-semibold">{s.title}</span>
                          {s.channel && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{s.channel}</span>}
                          {s.airTime && <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{s.airTime}</span>}
                          {days && <span className="text-xs" style={{ color: "var(--text-muted)" }}>· {days}</span>}
                          {!s.active && <span className="text-xs" style={{ color: "var(--accent-orange)" }}>on hiatus</span>}
                          {isFinished(s) && <span className="text-xs" style={{ color: "var(--accent-green)" }}>✓ finished</span>}
                          <span className="ml-auto flex gap-1 items-center">
                            <button
                              onClick={() => patch({ id: s.id, episodesSeen: Math.max(0, s.episodesSeen - 1) })}
                              disabled={s.episodesSeen === 0}
                              title="Undo — walks the counter back one episode if you tapped +1 by mistake."
                              className="text-xs w-6 h-6 rounded disabled:opacity-30"
                              style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                            >−</button>
                            <button onClick={() => patch({ id: s.id, episodesSeen: s.episodesSeen + 1 })} title="Click after watching an episode. The counter drives the widget's 'next episode' number (Ep N + 1)."
                              className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                              Watched · {s.episodesSeen}{s.maxEpisodes ? ` / ${s.maxEpisodes}` : ""} ep
                            </button>
                            <button onClick={() => startEdit(s)} className="text-xs" style={{ color: "var(--text-muted)" }}>Edit</button>
                            <button onClick={() => del(s.id)} className="text-xs" style={{ color: "var(--accent-red)" }}>✕</button>
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </HubShell>
  );
}
