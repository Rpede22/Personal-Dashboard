"use client";

import { useEffect, useState } from "react";
import { CURRENCIES, setDisplayCurrency, getDisplayCurrency } from "./payday";

/** CustomEvent the Settings "Re-run setup" button dispatches so the header
 *  reopens the onboarding wizard. Lives here (imported by both the modal and
 *  the header) to avoid a circular import between them. */
export const OPEN_ONBOARDING_EVENT = "dashboard-open-onboarding";

/**
 * Shared dashboard settings — the single source of truth the unified settings
 * modal and the consuming components (grid, header) both read from. Keeps the
 * existing localStorage keys so no user data is lost in the migration.
 *
 * Any write broadcasts a same-tab `dashboard-settings-change` CustomEvent (and
 * relies on the browser's cross-tab `storage` event); `useSettingsTick()`
 * subscribes to both so a change in the modal re-renders the grid/header live.
 *
 * Per-widget refresh intervals stay in `lib/refresh.ts` (its own event) — this
 * module just re-exports the option list for the modal's convenience.
 */

// ── Theme + density ─────────────────────────────────────────────────────────
export type Theme = "dark" | "light";
export type Density = "comfortable" | "compact";
const THEME_KEY = "dashboard.theme";
const DENSITY_KEY = "dashboard.density";

export function loadTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}
export function loadDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}
/** Stamp theme + density onto <html> so globals.css reacts. Call on boot.
 *  Also syncs the display currency into the payday module so `formatMoney`
 *  is correct from the first render. */
export function applyThemeDensity(): void {
  setDisplayCurrency(loadCurrency());
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = loadTheme();
  document.documentElement.dataset.density = loadDensity();
}

// ── Display currency ────────────────────────────────────────────────────────
const CURRENCY_KEY = "dashboard.currency";
export { CURRENCIES };
export function loadCurrency(): string {
  if (typeof window === "undefined") return "DKK";
  try {
    const raw = localStorage.getItem(CURRENCY_KEY);
    if (raw && CURRENCIES.some((c) => c.code === raw)) return raw;
  } catch { /* ignore */ }
  return "DKK";
}
export function setCurrency(code: string): void {
  try { localStorage.setItem(CURRENCY_KEY, code); } catch { /* ignore */ }
  setDisplayCurrency(code);
  broadcastSettingsChange();
}
/** Subscribe to currency changes + keep the payday module in sync; returns the
 *  active code. Money components call this so they re-render when it changes. */
export function useCurrency(): string {
  const tick = useSettingsTick();
  const [code, setCode] = useState(getDisplayCurrency());
  useEffect(() => {
    const c = loadCurrency();
    setDisplayCurrency(c);
    setCode(c);
  }, [tick]);
  return code;
}
/* ── Language (da | en) ──────────────────────────────────────────────────────
 * Currently drives recipe-source availability in the Meals hub (English unlocks
 * the TheMealDB finder; Danish is add-your-own-only until a Danish API lands).
 * Kept as a global pref so a future full-UI i18n can read the same setting. */
export type Language = "en" | "da";
const LANGUAGE_KEY = "dashboard.language";
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "da", label: "Dansk" },
];
export function loadLanguage(): Language {
  if (typeof window === "undefined") return "en";
  try { const raw = localStorage.getItem(LANGUAGE_KEY); if (raw === "da" || raw === "en") return raw; } catch { /* ignore */ }
  return "en";
}
export function setLanguage(lang: Language): void {
  try { localStorage.setItem(LANGUAGE_KEY, lang); } catch { /* ignore */ }
  broadcastSettingsChange();
}
export function useLanguage(): Language {
  const tick = useSettingsTick();
  const [lang, setLang] = useState<Language>("en");
  useEffect(() => { setLang(loadLanguage()); }, [tick]);
  return lang;
}

export function setTheme(theme: Theme): void {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
  broadcastSettingsChange();
}
export function setDensity(density: Density): void {
  try { localStorage.setItem(DENSITY_KEY, density); } catch { /* ignore */ }
  if (typeof document !== "undefined") document.documentElement.dataset.density = density;
  broadcastSettingsChange();
}

// ── Widget catalogue (meta only — the React nodes live in DashboardGrid) ─────
export type WidgetSlug =
  | "sports" | "school" | "games" | "running" | "calendar"
  | "workhub" | "news" | "media" | "weather" | "subscriptions" | "budget" | "watchlist"
  | "tasks" | "meals" | "steam" | "transit";

// Dashboard categories — group widgets so the top-of-dashboard bar can filter
// the grid to one theme at a time, and (later) the settings rail can group by
// the same key. Each widget declares one primary category.
export type CategoryKey = "sports" | "finance" | "health" | "productivity" | "info" | "entertainment";
export const CATEGORY_META: Array<{ key: CategoryKey; label: string; emoji: string }> = [
  { key: "sports",        label: "Sports",        emoji: "🏆" },
  { key: "finance",       label: "Finance",       emoji: "💰" },
  { key: "health",        label: "Health",        emoji: "🏃" },
  { key: "productivity",  label: "Productivity",  emoji: "📋" },
  { key: "info",          label: "At a glance",   emoji: "📰" },
  { key: "entertainment", label: "Entertainment", emoji: "🎮" },
];
export const CATEGORY_LABEL: Record<CategoryKey, string> =
  Object.fromEntries(CATEGORY_META.map((c) => [c.key, c.label])) as Record<CategoryKey, string>;

export interface WidgetMeta {
  slug: WidgetSlug;
  label: string;
  href?: string;
  size?: "square" | "wide";
  defaultRefreshMin?: number; // 0 / undefined = no auto-refresh
  category: CategoryKey;
}

export const WIDGET_META: WidgetMeta[] = [
  { slug: "sports",   label: "Sports",   defaultRefreshMin: 5,  category: "sports" },
  { slug: "school",   label: "School",   href: "/school",   defaultRefreshMin: 0,  category: "productivity" },
  { slug: "tasks",    label: "Tasks",    href: "/tasks",    defaultRefreshMin: 0,  category: "productivity" },
  { slug: "games",    label: "Games",    defaultRefreshMin: 2,  category: "entertainment" },
  { slug: "running",  label: "Running",  href: "/running",  defaultRefreshMin: 0,  category: "health" },
  { slug: "meals",    label: "Meals",    href: "/meals",    defaultRefreshMin: 0,  category: "health" },
  { slug: "calendar", label: "Calendar", href: "/calendar", size: "wide", defaultRefreshMin: 60, category: "productivity" },
  { slug: "workhub",  label: "Workhub",  href: "/work",     defaultRefreshMin: 0,  category: "finance" },
  { slug: "news",     label: "News",     href: "/news",     defaultRefreshMin: 15, category: "info" },
  { slug: "media",    label: "Media",    defaultRefreshMin: 5,  category: "entertainment" }, // no href — the widget owns its own tab navigation (internal Link)
  { slug: "steam",    label: "Steam",    href: "/steam",    defaultRefreshMin: 60, category: "entertainment" },
  { slug: "weather",  label: "Weather",  href: "/weather",  defaultRefreshMin: 30, category: "info" },
  { slug: "transit",  label: "Transit",  href: "/transit",  defaultRefreshMin: 2,  category: "info" },
  { slug: "subscriptions", label: "Subscriptions", href: "/subscriptions", defaultRefreshMin: 60, category: "finance" },
  { slug: "budget", label: "Budget", href: "/budget", defaultRefreshMin: 30, category: "finance" },
  { slug: "watchlist", label: "Watchlist", href: "/watchlist", defaultRefreshMin: 5, category: "finance" },
];

export const DEFAULT_WIDGET_ORDER: WidgetSlug[] = WIDGET_META.map((w) => w.slug);
export const WIDGET_META_BY_SLUG: Record<WidgetSlug, WidgetMeta> =
  Object.fromEntries(WIDGET_META.map((w) => [w.slug, w])) as Record<WidgetSlug, WidgetMeta>;

const WIDGET_ORDER_KEY = "dashboard.widgetOrder";
const WIDGET_ENABLED_KEY = "dashboard.widgetEnabled";
const WIDGET_KNOWN_KEY = "dashboard.widgetKnown";

export function loadWidgetOrder(): WidgetSlug[] {
  if (typeof window === "undefined") return DEFAULT_WIDGET_ORDER;
  try {
    const raw = localStorage.getItem(WIDGET_ORDER_KEY);
    if (!raw) return DEFAULT_WIDGET_ORDER;
    const parsed = JSON.parse(raw) as WidgetSlug[];
    const known = new Set(DEFAULT_WIDGET_ORDER);
    const kept = parsed.filter((s) => known.has(s));
    for (const s of DEFAULT_WIDGET_ORDER) if (!kept.includes(s)) kept.push(s);
    return kept;
  } catch { return DEFAULT_WIDGET_ORDER; }
}
export function saveWidgetOrder(order: WidgetSlug[]): void {
  try { localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(order)); } catch { /* ignore */ }
  broadcastSettingsChange();
}
export function loadWidgetEnabled(): Set<WidgetSlug> {
  return loadEnabledSet(WIDGET_ENABLED_KEY, WIDGET_KNOWN_KEY, DEFAULT_WIDGET_ORDER);
}
export function saveWidgetEnabled(enabled: Set<WidgetSlug>): void {
  try { localStorage.setItem(WIDGET_ENABLED_KEY, JSON.stringify([...enabled])); } catch { /* ignore */ }
  broadcastSettingsChange();
}

// ── Category filter (top-of-dashboard bar) ──────────────────────────────────
// The currently-selected category, or "all". A view pref (localStorage), not
// shared data. `null`/"all" = show every enabled widget.
const CATEGORY_KEY = "dashboard.category";
export type CategoryFilter = CategoryKey | "all";

export function loadCategoryFilter(): CategoryFilter {
  if (typeof window === "undefined") return "all";
  try {
    const raw = localStorage.getItem(CATEGORY_KEY);
    if (raw && (raw === "all" || CATEGORY_META.some((c) => c.key === raw))) return raw as CategoryFilter;
  } catch { /* ignore */ }
  return "all";
}
export function saveCategoryFilter(cat: CategoryFilter): void {
  try { localStorage.setItem(CATEGORY_KEY, cat); } catch { /* ignore */ }
  broadcastSettingsChange();
}

// ── Dashboard sections (top-of-page strips) ─────────────────────────────────
export type SectionSlug = "countdown" | "todayBriefing" | "weekAhead";
export const SECTION_META: Array<{ slug: SectionSlug; label: string }> = [
  { slug: "countdown", label: "Countdown strip" },
  { slug: "todayBriefing", label: "Today briefing" },
  { slug: "weekAhead", label: "Week-ahead heatmap" },
];
export const DEFAULT_SECTIONS: SectionSlug[] = SECTION_META.map((s) => s.slug);
const SECTIONS_KEY = "dashboard.sectionsEnabled";
const SECTIONS_KNOWN_KEY = "dashboard.sectionsKnown";

export function loadSections(): Set<SectionSlug> {
  return loadEnabledSet(SECTIONS_KEY, SECTIONS_KNOWN_KEY, DEFAULT_SECTIONS);
}
export function saveSections(enabled: Set<SectionSlug>): void {
  try { localStorage.setItem(SECTIONS_KEY, JSON.stringify([...enabled])); } catch { /* ignore */ }
  broadcastSettingsChange();
}

// ── Today briefing rows (which kinds show in the top briefing card) ──────────
export type BriefingRow = "cal" | "sport" | "run" | "school" | "media" | "news" | "weather" | "transit" | "tasks";
export const BRIEFING_ROW_META: Array<{ slug: BriefingRow; label: string }> = [
  { slug: "cal", label: "Calendar" },
  { slug: "sport", label: "Sport" },
  { slug: "run", label: "Run" },
  { slug: "school", label: "School" },
  { slug: "media", label: "Media" },
  // Opt-in "today" rows (#7) — default off so they don't change existing briefings.
  { slug: "news", label: "News" },
  // "weather" is intentionally NOT offered — the briefing always shows the
  // WeatherLine on the left, so a separate weather row was redundant (round 4).
  { slug: "transit", label: "Transit" },
  { slug: "tasks", label: "Tasks" },
];
const DEFAULT_BRIEFING_ROWS: BriefingRow[] = BRIEFING_ROW_META.map((r) => r.slug);
// These are valid + toggleable but start OFF (opt-in).
const DEFAULT_BRIEFING_OFF: BriefingRow[] = ["news", "transit", "tasks"];
const BRIEFING_ROWS_KEY = "dashboard.today.rows";
const BRIEFING_ROWS_KNOWN_KEY = "dashboard.today.rowsKnown";
export function loadBriefingRows(): Set<BriefingRow> {
  return loadEnabledSet(BRIEFING_ROWS_KEY, BRIEFING_ROWS_KNOWN_KEY, DEFAULT_BRIEFING_ROWS, DEFAULT_BRIEFING_OFF);
}
export function saveBriefingRows(enabled: Set<BriefingRow>): void {
  try { localStorage.setItem(BRIEFING_ROWS_KEY, JSON.stringify([...enabled])); } catch { /* ignore */ }
  broadcastSettingsChange();
}

// ── Weekly review — which sections show + a master on/off ────────────────────
export type ReviewSection = "running" | "lol" | "faceit" | "wow" | "school" | "work" | "calendar" | "teams";
export const REVIEW_SECTION_META: Array<{ slug: ReviewSection; label: string }> = [
  { slug: "running", label: "Running" },
  { slug: "lol", label: "League of Legends" },
  { slug: "faceit", label: "CS2 (FACEIT)" },
  { slug: "wow", label: "World of Warcraft" },
  { slug: "school", label: "School" },
  { slug: "work", label: "Work" },
  { slug: "calendar", label: "Calendar" },
  { slug: "teams", label: "Followed teams" },
];
const DEFAULT_REVIEW_SECTIONS: ReviewSection[] = REVIEW_SECTION_META.map((r) => r.slug);
const REVIEW_SECTIONS_KEY = "dashboard.review.sections";
const REVIEW_SECTIONS_KNOWN_KEY = "dashboard.review.sectionsKnown";
const REVIEW_ENABLED_KEY = "dashboard.review.enabled";
export function loadReviewSections(): Set<ReviewSection> {
  return loadEnabledSet(REVIEW_SECTIONS_KEY, REVIEW_SECTIONS_KNOWN_KEY, DEFAULT_REVIEW_SECTIONS);
}
export function saveReviewSections(enabled: Set<ReviewSection>): void {
  try { localStorage.setItem(REVIEW_SECTIONS_KEY, JSON.stringify([...enabled])); } catch { /* ignore */ }
  broadcastSettingsChange();
}
export function loadReviewEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(REVIEW_ENABLED_KEY) !== "0";
}
export function setReviewEnabled(on: boolean): void {
  try { localStorage.setItem(REVIEW_ENABLED_KEY, on ? "1" : "0"); } catch { /* ignore */ }
  broadcastSettingsChange();
}

// Which account feeds each game section of the review. A per-viewer pref map
// (`{ lol?, faceit?, wow? }`) of the account/character id to summarise; empty =
// the review uses the first available account for that game.
export type ReviewGame = "lol" | "faceit" | "wow";
const REVIEW_ACCOUNTS_KEY = "dashboard.review.accounts";
export function loadReviewAccounts(): Partial<Record<ReviewGame, string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(REVIEW_ACCOUNTS_KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch { return {}; }
}
export function loadReviewAccount(game: ReviewGame): string | null {
  return loadReviewAccounts()[game] ?? null;
}
export function setReviewAccount(game: ReviewGame, id: string | null): void {
  const next = loadReviewAccounts();
  if (id) next[game] = id; else delete next[game];
  try { localStorage.setItem(REVIEW_ACCOUNTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  broadcastSettingsChange();
}

// WoW can summarise MULTIPLE characters in the review (you may play several) —
// stored as an id array (empty = fall back to the first saved character).
const REVIEW_WOW_KEY = "dashboard.review.wowChars";
export function loadReviewWowChars(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(REVIEW_WOW_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}
export function setReviewWowChars(ids: string[]): void {
  try { localStorage.setItem(REVIEW_WOW_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
  broadcastSettingsChange();
}

// ── Today in full (/today) — which sections show ─────────────────────────────
export type TodaySection = "agenda" | "tasks" | "dinner" | "run" | "deadlines" | "tonight";
export const TODAY_SECTION_META: Array<{ slug: TodaySection; label: string }> = [
  { slug: "agenda", label: "Agenda (calendar)" },
  { slug: "tasks", label: "Tasks" },
  { slug: "dinner", label: "Dinner" },
  { slug: "run", label: "Run" },
  { slug: "deadlines", label: "Deadlines (school)" },
  { slug: "tonight", label: "Tonight (TV + podcasts)" },
];
const DEFAULT_TODAY_SECTIONS: TodaySection[] = TODAY_SECTION_META.map((r) => r.slug);
const TODAY_SECTIONS_KEY = "dashboard.today.sections";
const TODAY_SECTIONS_KNOWN_KEY = "dashboard.today.sectionsKnown";
export function loadTodaySections(): Set<TodaySection> {
  return loadEnabledSet(TODAY_SECTIONS_KEY, TODAY_SECTIONS_KNOWN_KEY, DEFAULT_TODAY_SECTIONS);
}
export function saveTodaySections(enabled: Set<TodaySection>): void {
  try { localStorage.setItem(TODAY_SECTIONS_KEY, JSON.stringify([...enabled])); } catch { /* ignore */ }
  broadcastSettingsChange();
}

/**
 * Load an enabled-set that (a) lets the user turn items OFF and keep them off,
 * while (b) defaulting genuinely-new items to ON. Naively merging all defaults
 * back in on read makes disabling impossible (the item resurrects next load).
 * We track a companion "known" list: an item is only auto-enabled when it has
 * never been shown before (absent from known). Writes `known = defaults` once
 * when something new appears, so it isn't re-added afterwards.
 */
/**
 * `defaults` = every valid slug (so stored/toggled values survive the filter).
 * `defaultOff` = the subset that should start **off** — items valid + toggleable
 * but opt-in (e.g. the extra Today-briefing rows). On first run and when a
 * genuinely-new slug appears, everything defaults on *except* the defaultOff set.
 */
function loadEnabledSet<T extends string>(enabledKey: string, knownKey: string, defaults: readonly T[], defaultOff: readonly T[] = []): Set<T> {
  const offSet = new Set(defaultOff);
  const defaultOn = defaults.filter((d) => !offSet.has(d));
  if (typeof window === "undefined") return new Set(defaultOn);
  const known = new Set(defaults);
  try {
    const rawEnabled = localStorage.getItem(enabledKey);
    if (rawEnabled === null) {
      // First run — the on-by-default set, and everything is now "known".
      try { localStorage.setItem(knownKey, JSON.stringify([...defaults])); } catch { /* ignore */ }
      return new Set(defaultOn);
    }
    const enabledStored = (JSON.parse(rawEnabled) as T[]).filter((s) => known.has(s));
    const knownStored: T[] = (() => {
      try {
        const raw = localStorage.getItem(knownKey);
        return raw ? (JSON.parse(raw) as T[]).filter((s) => known.has(s)) : [];
      } catch { return []; }
    })();
    const knownSet = new Set(knownStored);
    const enabled = new Set(enabledStored);
    let sawNew = false;
    for (const d of defaults) {
      // Genuinely new → default on, unless it's opt-in (defaultOff).
      if (!knownSet.has(d)) { sawNew = true; if (!offSet.has(d)) enabled.add(d); }
    }
    if (sawNew || knownStored.length !== defaults.length) {
      try { localStorage.setItem(knownKey, JSON.stringify([...defaults])); } catch { /* ignore */ }
    }
    return enabled;
  } catch {
    return new Set(defaultOn);
  }
}

// ── Change broadcast + subscription hook ────────────────────────────────────
const EVENT = "dashboard-settings-change";
export function broadcastSettingsChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Returns a counter that bumps whenever any dashboard setting changes (this
 *  tab via CustomEvent, other tabs via `storage`). Depend on it to re-read. */
export function useSettingsTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  return tick;
}
