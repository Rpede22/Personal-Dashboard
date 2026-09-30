"use client";

import { useEffect, useState, type ReactNode } from "react";
import TeamsSettings from "@/components/settings/TeamsSettings";
import WorkSettings from "@/components/settings/WorkSettings";
import NewsSettings from "@/components/settings/NewsSettings";
import CalendarSettings from "@/components/settings/CalendarSettings";
import WeatherSettings from "@/components/settings/WeatherSettings";
import RunningSettings from "@/components/settings/RunningSettings";
import BudgetSettings from "@/components/settings/BudgetSettings";
import SteamSettings from "@/components/settings/SteamSettings";
import TransitSettings from "@/components/settings/TransitSettings";
import WatchlistSettings from "@/components/settings/WatchlistSettings";
import SubscriptionsSettings from "@/components/settings/SubscriptionsSettings";
import TasksSettings from "@/components/settings/TasksSettings";
import { loadCities, loadSelectedCity } from "@/lib/weather-city";
import {
  WIDGET_META, CATEGORY_META, loadWidgetEnabled, saveWidgetEnabled,
  type WidgetSlug,
} from "@/lib/dashboard-settings";

/**
 * First-run onboarding wizard. A stepped, fully-skippable frame around the
 * existing `<XSettings />` panels — each panel already persists its own config
 * as the user edits, so the wizard collects nothing itself; it just guides.
 *
 * Skippable at every step (and "Skip setup" bails entirely). Finishing OR
 * skipping marks onboarding complete (`POST /api/onboarding`) so it never
 * auto-shows again — the app boots fully usable even if everything is skipped
 * (all config has safe defaults). Reachable later via Settings › "Re-run setup".
 */

interface Step {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  render: () => ReactNode;
}

/** Small "already configured" banner shown atop a step so you can see at a
 *  glance what's set up before deciding whether to edit or skip. */
function StepBanner({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div
      className="rounded-lg px-3 py-2 mb-4 text-sm"
      style={{
        background: ok ? "var(--accent-green)15" : "var(--surface-2)",
        border: `1px solid ${ok ? "var(--accent-green)55" : "var(--border)"}`,
        color: ok ? "var(--accent-green)" : "var(--text-muted)",
      }}
    >{children}</div>
  );
}

function TeamsStep() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/sports/teams").then((r) => r.json()).then((d: { teams?: unknown[] }) => setCount((d.teams ?? []).length)).catch(() => {});
  }, []);
  return (
    <>
      {count !== null && (
        <StepBanner ok={count > 0}>
          {count > 0 ? `✓ Following ${count} team${count > 1 ? "s" : ""}` : "No teams followed yet — pick some below."}
        </StepBanner>
      )}
      <TeamsSettings />
    </>
  );
}

function WorkStep() {
  const [cfg, setCfg] = useState<{ enabled?: boolean; monthlyHoursFallback?: number } | null>(null);
  useEffect(() => { fetch("/api/work").then((r) => r.json()).then(setCfg).catch(() => {}); }, []);
  const enabled = cfg ? cfg.enabled !== false : false;
  return (
    <>
      {cfg && (
        <StepBanner ok={enabled}>
          {enabled ? "✓ Hour tracking is on" : `Tracking is off — assuming ${cfg.monthlyHoursFallback ?? 160} h/month`}
        </StepBanner>
      )}
      <WorkSettings />
    </>
  );
}

function NewsStep() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/news/config").then((r) => r.json()).then((d: { source: string; sources: { id: string; label: string }[] }) => {
      const s = (d.sources ?? []).find((x) => x.id === d.source);
      setLabel(s ? s.label : d.source);
    }).catch(() => {});
  }, []);
  return (
    <>
      {label && <StepBanner ok>✓ News source: {label}</StepBanner>}
      <NewsSettings />
    </>
  );
}

function CalendarStep() {
  const [cfg, setCfg] = useState<{ icsFeeds: { url: string }[]; caldav: { user: string; hasPassword: boolean } } | null>(null);
  useEffect(() => { fetch("/api/calendar/config").then((r) => r.json()).then(setCfg).catch(() => {}); }, []);
  const connected = !!cfg?.caldav?.hasPassword;
  const feeds = (cfg?.icsFeeds ?? []).filter((f) => f.url).length;
  const anything = connected || feeds > 0;
  return (
    <>
      {cfg && (
        <StepBanner ok={anything}>
          {connected
            ? `✓ iCloud connected${cfg.caldav.user ? ` as ${cfg.caldav.user}` : ""}${feeds > 0 ? ` · ${feeds} feed${feeds > 1 ? "s" : ""}` : ""}`
            : feeds > 0
              ? `✓ ${feeds} calendar feed${feeds > 1 ? "s" : ""} configured`
              : "No calendars connected yet — add an iCloud account or ICS feed below."}
        </StepBanner>
      )}
      <CalendarSettings />
    </>
  );
}

function WeatherStep() {
  const [info, setInfo] = useState<{ selected: string; count: number } | null>(null);
  useEffect(() => {
    // Client-only localStorage read — defer to mount.
    setInfo({ selected: loadSelectedCity().name, count: loadCities().length });
  }, []);
  return (
    <>
      {info && (
        <StepBanner ok>
          ✓ Weather for {info.selected}{info.count > 1 ? ` (+${info.count - 1} more saved)` : ""}
        </StepBanner>
      )}
      <WeatherSettings />
    </>
  );
}

/** "Which of these do you want?" — per-widget on/off during onboarding, grouped
 *  by category. Everything starts on; untick anything you don't want. Saves live
 *  to the same store the dashboard + Settings read. */
function PickWidgetsStep() {
  const [enabled, setEnabled] = useState<Set<WidgetSlug>>(() => new Set());
  useEffect(() => { setEnabled(loadWidgetEnabled()); }, []);
  function toggle(slug: WidgetSlug) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      saveWidgetEnabled(next);
      return next;
    });
  }
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Pick which widgets show on your dashboard — untick anything you don&apos;t want. You can change this any time in
        ⚙️ Settings → General, and re-order them by dragging on the dashboard.
      </p>
      {CATEGORY_META.map((cat) => {
        const widgets = WIDGET_META.filter((w) => w.category === cat.key);
        if (widgets.length === 0) return null;
        return (
          <div key={cat.key}>
            <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>{cat.emoji} {cat.label}</div>
            <div className="flex flex-wrap gap-2">
              {widgets.map((w) => {
                const on = enabled.has(w.slug);
                return (
                  <button key={w.slug} onClick={() => toggle(w.slug)} className="text-xs px-3 py-1.5 rounded-lg"
                    style={{
                      background: on ? "var(--accent-cyan)22" : "var(--surface-2)",
                      color: on ? "var(--accent-cyan)" : "var(--text-muted)",
                      border: `1px solid ${on ? "var(--accent-cyan)" : "var(--border)"}`,
                    }}>{on ? "✓ " : ""}{w.label}</button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IntroStep() {
  return (
    <div className="space-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
      <p>This quick setup personalises your dashboard. Every step is optional — skip anything you don&apos;t need and change it later in ⚙️ Settings.</p>
      <ul className="space-y-1.5 pl-1">
        <li>🏟️ Followed sports teams</li>
        <li>💼 Work hours &amp; pay</li>
        <li>📰 News source</li>
        <li>🌦️ Weather city</li>
        <li>📅 Personal calendars</li>
        <li>🏃 Strava (running)</li>
      </ul>
      <p>Nothing here is required — the app already works with sensible defaults.</p>
    </div>
  );
}

interface StravaStatus {
  connected: boolean;
  athleteId: number | null;
  athlete: { id: number; firstname?: string; lastname?: string; username?: string } | null;
  hasCredentials: boolean;
}

function StravaStep() {
  const [status, setStatus] = useState<StravaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ?profile=1 resolves the linked athlete's name so you can confirm it's the right account.
    fetch("/api/strava?profile=1")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  const athleteName = status?.athlete
    ? [status.athlete.firstname, status.athlete.lastname].filter(Boolean).join(" ") ||
      status.athlete.username ||
      `athlete #${status.athlete.id}`
    : status?.athleteId
      ? `athlete #${status.athleteId}`
      : null;

  return (
    <div className="space-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
      <p>Connect Strava to auto-import your runs, splits, HR zones, and best efforts. It&apos;s <strong>one click</strong> — you just log in and approve on Strava, then you&apos;re back here. No Strava developer account or API keys on your side.</p>

      {loading ? (
        <div className="text-xs">Checking Strava connection…</div>
      ) : status?.connected ? (
        <div className="rounded-lg px-3 py-2" style={{ background: "var(--accent-green)15", border: "1px solid var(--accent-green)55" }}>
          <div className="text-sm font-medium" style={{ color: "var(--accent-green)" }}>
            ✓ Connected{athleteName ? ` as ${athleteName}` : ""}
          </div>
          <div className="text-xs mt-0.5">
            Not the right account?{" "}
            <a href="/api/strava/auth" style={{ color: "var(--accent-blue)" }}>Reconnect a different one →</a>
          </div>
        </div>
      ) : (
        <a
          href="/api/strava/auth"
          className="inline-block text-sm px-4 py-2 rounded-lg font-medium"
          style={{ background: "#FC4C02", color: "#fff" }}
        >Connect Strava →</a>
      )}

      {status && !status.hasCredentials && (
        <p className="text-xs" style={{ color: "var(--accent-orange)" }}>
          ⚠ Strava API keys aren&apos;t configured in this build, so connecting won&apos;t work yet.
        </p>
      )}
      <p className="text-xs">You can also do this later from the Running hub. Skip if you don&apos;t run (or don&apos;t use Strava).</p>
    </div>
  );
}

/** One step that bundles the optional widget setups behind a compact tab picker
 *  so the wizard stays short. Each renders the same panel as ⚙️ Settings. */
function ExtrasStep() {
  const EXTRAS = [
    { id: "budget", label: "💰 Budget", render: () => <BudgetSettings /> },
    { id: "running", label: "🏃 Running", render: () => <RunningSettings /> },
    { id: "watchlist", label: "📈 Watchlist", render: () => <WatchlistSettings /> },
    { id: "steam", label: "🎯 Steam", render: () => <SteamSettings /> },
    { id: "transit", label: "🚉 Transit", render: () => <TransitSettings /> },
    { id: "subscriptions", label: "🔁 Subscriptions", render: () => <SubscriptionsSettings /> },
    { id: "tasks", label: "✅ Tasks", render: () => <TasksSettings /> },
  ] as const;
  const [tab, setTab] = useState<string>(EXTRAS[0].id);
  const active = EXTRAS.find((e) => e.id === tab) ?? EXTRAS[0];
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Optional widgets you can set up now or later. Pick a tab, fill in what you want, skip the rest — each is saved as
        you go.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {EXTRAS.map((e) => (
          <button key={e.id} onClick={() => setTab(e.id)} className="text-xs px-3 py-1.5 rounded-lg"
            style={{
              background: tab === e.id ? "var(--accent-cyan)22" : "var(--surface-2)",
              color: tab === e.id ? "var(--accent-cyan)" : "var(--text-muted)",
              border: `1px solid ${tab === e.id ? "var(--accent-cyan)" : "var(--border)"}`,
            }}>{e.label}</button>
        ))}
      </div>
      <div className="pt-1">{active.render()}</div>
    </div>
  );
}

function DoneStep() {
  return (
    <div className="space-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
      <p style={{ color: "var(--text)" }} className="text-base font-medium">You&apos;re all set 🎉</p>
      <p>Everything you picked is saved. Tweak anything any time from <strong style={{ color: "var(--text)" }}>⚙️ Settings</strong> in the header — and re-run this setup from the General panel.</p>
    </div>
  );
}

const STEPS: Step[] = [
  { id: "welcome", icon: "👋", title: "Welcome", subtitle: "Let's set up your dashboard", render: () => <IntroStep /> },
  { id: "widgets", icon: "🧩", title: "Choose your widgets", subtitle: "Which of these do you want? (all optional)", render: () => <PickWidgetsStep /> },
  { id: "teams", icon: "🏟️", title: "Sports teams", subtitle: "Pick the teams you follow", render: () => <TeamsStep /> },
  { id: "work", icon: "💼", title: "Work", subtitle: "Hour tracking & links (optional)", render: () => <WorkStep /> },
  { id: "news", icon: "📰", title: "News", subtitle: "Choose your headline source", render: () => <NewsStep /> },
  { id: "weather", icon: "🌦️", title: "Weather", subtitle: "Pick your city", render: () => <WeatherStep /> },
  { id: "calendar", icon: "📅", title: "Calendar", subtitle: "Add your personal calendars", render: () => <CalendarStep /> },
  { id: "strava", icon: "🏃", title: "Strava", subtitle: "Connect running data (optional)", render: () => <StravaStep /> },
  { id: "extras", icon: "✨", title: "More widgets", subtitle: "Budget, running goal, watchlist, Steam, transit — all optional", render: () => <ExtrasStep /> },
  { id: "done", icon: "🎉", title: "Done", subtitle: "", render: () => <DoneStep /> },
];

export default function OnboardingWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function complete() {
    setFinishing(true);
    try {
      await fetch("/api/onboarding", { method: "POST" });
    } catch { /* non-fatal */ }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div
        className="rounded-2xl overflow-hidden flex flex-col w-full max-w-2xl shadow-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", height: "min(82vh, 660px)", marginTop: 28 }}
      >
        {/* Header + progress */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>{current.icon}</span>{current.title}
            </h2>
            <button onClick={complete} className="text-xs" style={{ color: "var(--text-muted)" }} title="Skip the whole setup">
              Skip setup
            </button>
          </div>
          {current.subtitle && <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>{current.subtitle}</p>}
          {/* Step dots */}
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className="h-1.5 rounded-full transition-all"
                style={{
                  flex: i === step ? "2 1 0" : "1 1 0",
                  background: i <= step ? "var(--accent-cyan)" : "var(--surface-2)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {current.render()}
        </div>

        {/* Footer nav */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-sm px-4 py-2 rounded-lg disabled:opacity-30"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >← Back</button>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Step {step + 1} of {STEPS.length}</span>
          {isLast ? (
            <button
              onClick={complete}
              disabled={finishing}
              className="text-sm px-5 py-2 rounded-lg font-medium"
              style={{ background: "var(--accent-green)22", color: "var(--accent-green)", border: "1px solid var(--accent-green)" }}
            >{finishing ? "Finishing…" : "Finish ✓"}</button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                className="text-sm px-4 py-2 rounded-lg"
                style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
              >Skip</button>
              <button
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                className="text-sm px-5 py-2 rounded-lg font-medium"
                style={{ background: "var(--accent-cyan)22", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }}
              >Next →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
