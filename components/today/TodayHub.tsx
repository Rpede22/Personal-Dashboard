"use client";

import { useEffect, useMemo, useState } from "react";
import HubShell from "@/components/HubShell";
import WeatherLine from "@/components/dashboard/WeatherLine";
import { Task, priorityMeta, sortActive } from "@/lib/tasks";
import type { PlannedMeal } from "@/lib/meals";
import { loadTodaySections, useSettingsTick } from "@/lib/dashboard-settings";

const ACCENT = "var(--accent-cyan)";

interface CalEvent { uid: string; title: string; start: string; end: string; allDay: boolean; calendar: string }
interface Assignment { id: number; title: string; subject?: string; dueDate?: string; dueTime?: string; status: string }
interface RunPlan { date: string; type?: string; distance?: number }
interface MediaShow { id: number; title: string; channel?: string; airDays: string; airTime?: string; active: boolean; episodesSeen?: number; maxEpisodes?: number | null }

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

async function safeJson(url: string): Promise<any> {
  try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); } catch { return null; }
}

/** Card wrapper — only rendered when it has content. */
function Section({ icon, title, accent = ACCENT, children }: { icon: string; title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: `3px solid ${accent}` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-semibold" style={{ color: accent }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function TodayHub() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [runPlans, setRunPlans] = useState<RunPlan[]>([]);
  const [shows, setShows] = useState<MediaShow[]>([]);
  const [podcastNew, setPodcastNew] = useState(0);
  const [loaded, setLoaded] = useState(false);

  async function loadAll() {
    const [cal, tk, mp, sch, run, med, pod] = await Promise.all([
      safeJson("/api/calendar"),
      safeJson("/api/tasks"),
      safeJson("/api/meals/plan"),
      safeJson("/api/school"),
      safeJson("/api/running/summary"),
      safeJson("/api/media"),
      safeJson("/api/podcasts"),
    ]);
    setEvents(cal?.events ?? []);
    setTasks(tk?.tasks ?? []);
    setMeals(mp?.plan ?? []);
    setAssignments(sch?.assignments ?? []);
    setRunPlans(run?.upcomingPlans ?? []);
    setShows(med?.shows ?? []);
    setPodcastNew(pod?.totalNew ?? 0);
    setLoaded(true);
  }
  useEffect(() => { loadAll(); }, []);

  async function completeTask(id: string) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, done: true } : t));
    try { await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, done: true }) }); } catch { /* ignore */ }
  }

  const now = new Date();
  const todayKey = dateKey(now);
  const todayWeekday = now.getDay();

  // Calendar events overlapping today.
  const todayEvents = useMemo(() => {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return events
      .filter((e) => { const s = new Date(e.start).getTime(), en = new Date(e.end).getTime(); return s <= end.getTime() && en >= start.getTime(); })
      .sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
  }, [events, todayKey]);

  const openTasks = useMemo(() => sortActive(tasks).slice(0, 6), [tasks]);
  const dinner = useMemo(() => meals.find((m) => m.date === todayKey), [meals, todayKey]);
  const todayRun = useMemo(() => runPlans.find((p) => dateKey(new Date(p.date)) === todayKey), [runPlans, todayKey]);
  const deadlines = useMemo(() => {
    const soon = new Date(now); soon.setDate(soon.getDate() + 3); soon.setHours(23, 59, 59, 999);
    return assignments
      .filter((a) => a.status !== "done" && a.dueDate && new Date(a.dueDate).getTime() <= soon.getTime())
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
      .slice(0, 5);
  }, [assignments, todayKey]);
  const tonightShows = useMemo(() => shows
    .filter((s) => s.active && s.airDays.split(",").map(Number).includes(todayWeekday))
    .sort((a, b) => (a.airTime || "99:99").localeCompare(b.airTime || "99:99")), [shows, todayWeekday]);

  // Which sections the user has enabled (Settings › General "Today in full").
  useSettingsTick();
  const enabledSections = loadTodaySections();
  const showAgenda = enabledSections.has("agenda") && todayEvents.length > 0;
  const showTasks = enabledSections.has("tasks") && openTasks.length > 0;
  const showDinner = enabledSections.has("dinner") && !!dinner;
  const showRun = enabledSections.has("run") && !!todayRun;
  const showDeadlines = enabledSections.has("deadlines") && deadlines.length > 0;
  const showTonight = enabledSections.has("tonight") && (tonightShows.length > 0 || podcastNew > 0);

  const isEmpty = loaded && !showAgenda && !showTasks && !showDinner && !showRun && !showDeadlines && !showTonight;

  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <HubShell title="Today" emoji="☀️" color={ACCENT}>
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="text-lg font-semibold">{dateLabel}</div>
          <WeatherLine />
        </div>

        {!loaded ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading your day…</p>
        ) : isEmpty ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
            ☀️ Nothing scheduled today — enjoy the quiet, or add a task or meal.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Agenda */}
            {showAgenda && (
              <Section icon="📅" title="Agenda" accent="var(--accent-pink)">
                <ul className="space-y-1.5">
                  {todayEvents.map((e) => (
                    <li key={e.uid} className="text-sm flex items-baseline gap-2">
                      <span className="tabular-nums text-xs shrink-0 w-24" style={{ color: "var(--text-muted)" }}>
                        {e.allDay ? "All day" : `${hhmm(e.start)}–${hhmm(e.end)}`}
                      </span>
                      <span className="flex-1 min-w-0 truncate">{e.title}</span>
                      <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{e.calendar}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Tasks */}
            {showTasks && (
              <Section icon="✅" title="Tasks" accent="var(--accent-indigo)">
                <ul className="space-y-1.5">
                  {openTasks.map((t) => {
                    const meta = priorityMeta(t.priority);
                    return (
                      <li key={t.id} className="text-sm flex items-center gap-2">
                        <button onClick={() => completeTask(t.id)} title="Mark done" className="w-4 h-4 rounded-full shrink-0" style={{ border: `2px solid ${meta.color}` }} />
                        <span className="flex-1 min-w-0 truncate">{t.title}</span>
                        <span className="text-[10px] uppercase tracking-wide shrink-0" style={{ color: meta.color }}>{t.priority}</span>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}

            {/* Dinner */}
            {showDinner && dinner && (
              <Section icon="🍽️" title="Dinner" accent="var(--accent-orange)">
                <div className="flex items-center gap-3">
                  {dinner.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dinner.thumb} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  )}
                  <span className="text-sm font-medium">{dinner.title}</span>
                </div>
              </Section>
            )}

            {/* Run */}
            {showRun && todayRun && (
              <Section icon="🏃" title="Run" accent="var(--accent-green)">
                <div className="text-sm">
                  <span className="font-medium capitalize">{todayRun.type ?? "Run"}</span>
                  {todayRun.distance ? <span style={{ color: "var(--text-muted)" }}> · {todayRun.distance} km</span> : null}
                </div>
              </Section>
            )}

            {/* Deadlines */}
            {showDeadlines && (
              <Section icon="📚" title="Deadlines" accent="var(--accent-indigo)">
                <ul className="space-y-1.5">
                  {deadlines.map((a) => (
                    <li key={a.id} className="text-sm flex items-baseline gap-2">
                      <span className="flex-1 min-w-0 truncate">{a.title}{a.subject && <span style={{ color: "var(--text-muted)" }}> · {a.subject}</span>}</span>
                      <span className="text-xs shrink-0" style={{ color: "var(--accent-orange)" }}>
                        {a.dueDate ? new Date(a.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Tonight (media + podcasts) */}
            {showTonight && (
              <Section icon="📺" title="Tonight" accent="var(--accent-purple)">
                <ul className="space-y-1.5">
                  {tonightShows.map((s) => (
                    <li key={s.id} className="text-sm flex items-baseline gap-2">
                      {s.airTime && <span className="tabular-nums text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{s.airTime}</span>}
                      <span className="flex-1 min-w-0 truncate">{s.title}</span>
                      {s.channel && <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{s.channel}</span>}
                    </li>
                  ))}
                  {podcastNew > 0 && (
                    <li className="text-sm" style={{ color: "var(--accent-pink)" }}>🎧 {podcastNew} new podcast episode{podcastNew === 1 ? "" : "s"}</li>
                  )}
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>
    </HubShell>
  );
}
