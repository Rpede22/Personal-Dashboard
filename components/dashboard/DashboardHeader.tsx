"use client";

import { useEffect, useState } from "react";
import TodayDate from "@/components/dashboard/TodayDate";
import TodayBriefing from "@/components/dashboard/TodayBriefing";
import WeekAheadHeatmap from "@/components/dashboard/WeekAheadHeatmap";
import CountdownStrip from "@/components/dashboard/CountdownStrip";
import ClockTile from "@/components/dashboard/ClockTile";
import SettingsButton, { type SettingsSection } from "@/components/settings/SettingsModal";
import WorkSettings from "@/components/settings/WorkSettings";
import NewsSettings from "@/components/settings/NewsSettings";
import CalendarSettings from "@/components/settings/CalendarSettings";
import TeamsSettings from "@/components/settings/TeamsSettings";
import WeatherSettings from "@/components/settings/WeatherSettings";
import FeedbackSettings from "@/components/settings/FeedbackSettings";
import BackupSettings from "@/components/settings/BackupSettings";
import GamesSettings from "@/components/settings/GamesSettings";
import RunningSettings from "@/components/settings/RunningSettings";
import BudgetSettings from "@/components/settings/BudgetSettings";
import SteamSettings from "@/components/settings/SteamSettings";
import TransitSettings from "@/components/settings/TransitSettings";
import { HubPlaceholder } from "@/components/settings/SettingsHelp";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import { applyThemeDensity, loadSections, useSettingsTick, OPEN_ONBOARDING_EVENT } from "@/lib/dashboard-settings";

// Per-hub settings panels mounted into the unified modal's left rail. Each new
// de-hardcoded hub adds one here.
// Grouped to match the dashboard's category chips (CATEGORY_META): Sports /
// Finance / Health / Productivity / At a glance / Entertainment, then App for
// the two app-level panels. Order here drives the left-rail group order (the
// modal buckets by `group` in first-seen order), so keep entries category-sorted.
const HUB_SETTINGS: SettingsSection[] = [
  // Sports
  { id: "teams", label: "Teams", icon: "🏟️", group: "Sports", render: () => <TeamsSettings /> },
  // Finance
  { id: "work", label: "Work", icon: "💼", group: "Finance", render: () => <WorkSettings /> },
  { id: "budget", label: "Budget", icon: "💰", group: "Finance", render: () => <BudgetSettings /> },
  { id: "watchlist", label: "Watchlist", icon: "📈", group: "Finance", render: () => <HubPlaceholder emoji="📈" name="Watchlist" widget="Watchlist" blurb="Your watchlist is just the tickers you follow, added as you like." /> },
  { id: "subscriptions", label: "Subscriptions", icon: "🔁", group: "Finance", render: () => <HubPlaceholder emoji="🔁" name="Subscriptions" widget="Subscriptions" blurb="Subscriptions are the recurring bills you log as you go." /> },
  // Health
  { id: "running", label: "Running", icon: "🏃", group: "Health", render: () => <RunningSettings /> },
  // Productivity
  { id: "calendar", label: "Calendar", icon: "📅", group: "Productivity", render: () => <CalendarSettings /> },
  { id: "tasks", label: "Tasks", icon: "✅", group: "Productivity", render: () => <HubPlaceholder emoji="✅" name="Tasks" widget="Tasks" /> },
  { id: "countdowns", label: "Countdowns", icon: "⏳", group: "Productivity", render: () => <HubPlaceholder emoji="⏳" name="Countdowns" widget="Countdown strip" blurb="Countdowns are just pinned dates you add as they come up." /> },
  // At a glance
  { id: "news", label: "News", icon: "📰", group: "At a glance", render: () => <NewsSettings /> },
  { id: "weather", label: "Weather", icon: "🌦️", group: "At a glance", render: () => <WeatherSettings /> },
  { id: "transit", label: "Transit", icon: "🚉", group: "At a glance", render: () => <TransitSettings /> },
  // Entertainment
  { id: "games", label: "Games", icon: "🎮", group: "Entertainment", render: () => <GamesSettings /> },
  { id: "steam", label: "Steam", icon: "🎯", group: "Entertainment", render: () => <SteamSettings /> },
  // App
  { id: "feedback", label: "Feedback", icon: "💬", group: "App", render: () => <FeedbackSettings /> },
  { id: "backup", label: "Backup", icon: "💾", group: "App", render: () => <BackupSettings /> },
];

/**
 * Dashboard header + the top-of-page sections (countdown / today / week-ahead).
 * Which sections render is driven by the shared dashboard-settings store; the
 * unified Settings modal toggles them. `useSettingsTick()` re-reads on change
 * so the modal applies live. Theme + density are applied here on boot.
 */
export default function DashboardHeader() {
  const tick = useSettingsTick();
  const [sections, setSections] = useState<Set<string>>(new Set());
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Apply saved theme/density on mount (replaces the old DashboardPrefs boot).
  useEffect(() => { applyThemeDensity(); }, []);
  // Re-read enabled sections on mount + whenever settings change.
  useEffect(() => { setSections(loadSections()); }, [tick]);

  // First-run: auto-open the wizard when onboarding hasn't been completed.
  // Also listen for the "Re-run setup" event from the Settings General panel.
  useEffect(() => {
    let alive = true;
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((d) => { if (alive && d && d.completed === false) setShowOnboarding(true); })
      .catch(() => {});
    const reopen = () => setShowOnboarding(true);
    window.addEventListener(OPEN_ONBOARDING_EVENT, reopen);
    return () => { alive = false; window.removeEventListener(OPEN_ONBOARDING_EVENT, reopen); };
  }, []);

  return (
    <>
      <header className="sticky top-[28px] z-40 -mx-6 px-6 pt-5 pb-4 mb-6 page-bg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>Dashboard</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              <TodayDate />
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ClockTile />
            <SettingsButton extraSections={HUB_SETTINGS} />
          </div>
        </div>
      </header>

      {sections.has("countdown") && <CountdownStrip />}
      {sections.has("todayBriefing") && <TodayBriefing />}
      {sections.has("weekAhead") && <WeekAheadHeatmap />}

      {showOnboarding && <OnboardingWizard onClose={() => setShowOnboarding(false)} />}
    </>
  );
}
