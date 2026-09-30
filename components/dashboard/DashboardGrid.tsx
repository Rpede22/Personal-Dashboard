"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import WidgetErrorBoundary from "@/components/WidgetErrorBoundary";
import { REFRESH_OPTIONS_MIN, loadRefreshOverrides, saveRefreshOverride } from "@/lib/refresh";
import {
  type WidgetSlug as Slug,
  type CategoryFilter,
  WIDGET_META_BY_SLUG, DEFAULT_WIDGET_ORDER,
  loadWidgetOrder, saveWidgetOrder, loadWidgetEnabled,
  loadCategoryFilter, saveCategoryFilter, CATEGORY_META,
  useSettingsTick,
} from "@/lib/dashboard-settings";
import SportsWidget from "@/components/dashboard/SportsWidget";
import SchoolWidget from "@/components/dashboard/SchoolWidget";
import TasksWidget from "@/components/dashboard/TasksWidget";
import GamesWidget from "@/components/dashboard/GamesWidget";
import RunningWidget from "@/components/dashboard/RunningWidget";
import MealWidget from "@/components/dashboard/MealWidget";
import SteamWidget from "@/components/dashboard/SteamWidget";
import WorkhubWidget from "@/components/dashboard/WorkhubWidget";
import CalendarWidget from "@/components/dashboard/CalendarWidget";
import NewsWidget from "@/components/dashboard/NewsWidget";
import MediaWidget from "@/components/dashboard/MediaWidget";
import WeatherWidget from "@/components/dashboard/WeatherWidget";
import TransitWidget from "@/components/dashboard/TransitWidget";
import SubscriptionsWidget from "@/components/dashboard/SubscriptionsWidget";
import BudgetWidget from "@/components/dashboard/BudgetWidget";
import WatchlistWidget from "@/components/dashboard/WatchlistWidget";

const DEFAULT_ORDER = DEFAULT_WIDGET_ORDER;

interface Entry {
  label: string;
  href?: string;
  node: ReactNode;
  size?: "square" | "wide";
  defaultRefreshMin?: number;
}

// The React nodes live here; all metadata (label/href/size/refresh/order) comes
// from the shared catalogue in lib/dashboard-settings so the settings modal and
// the grid can't drift.
const NODES: Record<Slug, ReactNode> = {
  sports: <SportsWidget />,
  school: <SchoolWidget />,
  tasks: <TasksWidget />,
  games: <GamesWidget />,
  running: <RunningWidget />,
  meals: <MealWidget />,
  steam: <SteamWidget />,
  calendar: <CalendarWidget />,
  workhub: <WorkhubWidget />,
  news: <NewsWidget />,
  media: <MediaWidget />,
  weather: <WeatherWidget />,
  transit: <TransitWidget />,
  subscriptions: <SubscriptionsWidget />,
  budget: <BudgetWidget />,
  watchlist: <WatchlistWidget />,
};

const WIDGETS: Record<Slug, Entry> = Object.fromEntries(
  DEFAULT_ORDER.map((slug) => {
    const m = WIDGET_META_BY_SLUG[slug];
    return [slug, { label: m.label, href: m.href, node: NODES[slug], size: m.size, defaultRefreshMin: m.defaultRefreshMin }];
  })
) as Record<Slug, Entry>;

export default function DashboardGrid() {
  const tick = useSettingsTick();
  const [order, setOrder] = useState<Slug[]>(DEFAULT_ORDER);
  const [enabled, setEnabled] = useState<Set<Slug>>(new Set(DEFAULT_ORDER));
  const [dragSlug, setDragSlug] = useState<Slug | null>(null);
  const [hoverSlug, setHoverSlug] = useState<Slug | null>(null);
  const [refreshOverrides, setRefreshOverrides] = useState<Record<string, number>>({});
  const [refreshMenuFor, setRefreshMenuFor] = useState<Slug | null>(null);
  const [category, setCategoryState] = useState<CategoryFilter>("all");

  // Read from the shared store on mount + whenever settings change (the modal
  // toggles enabled/refresh and broadcasts, bumping `tick`).
  useEffect(() => {
    setOrder(loadWidgetOrder());
    setEnabled(loadWidgetEnabled());
    setRefreshOverrides(loadRefreshOverrides());
    setCategoryState(loadCategoryFilter());
  }, [tick]);

  function setCategory(cat: CategoryFilter) {
    setCategoryState(cat);
    saveCategoryFilter(cat);
  }

  function setRefresh(slug: Slug, minutes: number | null) {
    saveRefreshOverride(slug, minutes);
    setRefreshOverrides(loadRefreshOverrides());
    setRefreshMenuFor(null);
  }

  // Close refresh menu on any outside click. Inside-menu clicks stop
  // propagation themselves so this doesn't fire on option clicks.
  useEffect(() => {
    if (!refreshMenuFor) return;
    function onDoc() { setRefreshMenuFor(null); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [refreshMenuFor]);

  function swap(from: Slug, to: Slug) {
    if (from === to) return;
    const next = [...order];
    const iF = next.indexOf(from);
    const iT = next.indexOf(to);
    if (iF < 0 || iT < 0) return;
    [next[iF], next[iT]] = [next[iT], next[iF]];
    setOrder(next);
    saveWidgetOrder(next); // persist + broadcast
  }

  function resetOrder() {
    setOrder(DEFAULT_ORDER);
    saveWidgetOrder(DEFAULT_ORDER);
  }

  const isCustomOrder = order.some((s, i) => s !== DEFAULT_ORDER[i]);
  const enabledSlugs = order.filter((s) => enabled.has(s));

  // Which categories actually have an enabled widget — the bar only offers
  // those (+ "All"). If the active category no longer has any, fall back to All.
  const presentCategories = new Set(enabledSlugs.map((s) => WIDGET_META_BY_SLUG[s].category));
  const availableCategories = CATEGORY_META.filter((c) => presentCategories.has(c.key));
  const effectiveCategory: CategoryFilter =
    category === "all" || presentCategories.has(category) ? category : "all";
  const visible = enabledSlugs.filter(
    (s) => effectiveCategory === "all" || WIDGET_META_BY_SLUG[s].category === effectiveCategory
  );
  // A category bar only earns its place when widgets span ≥2 categories.
  const showCategoryBar = availableCategories.length >= 2;

  return (
    <>
      {showCategoryBar && (
        <div className="flex flex-wrap gap-2 mb-4">
          {([{ key: "all", label: "All", emoji: "▦" }, ...availableCategories] as const).map((c) => {
            const on = effectiveCategory === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key as CategoryFilter)}
                className="text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors"
                style={{
                  background: on ? "var(--accent-cyan)22" : "var(--surface)",
                  color: on ? "var(--accent-cyan)" : "var(--text-muted)",
                  border: `1px solid ${on ? "var(--accent-cyan)" : "var(--border)"}`,
                }}
              >
                <span>{c.emoji}</span><span>{c.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {visible.length === 0 ? (
        <div
          className="rounded-2xl p-6 text-center text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          No widgets enabled. Open <span className="font-semibold" style={{ color: "var(--text)" }}>⚙️ Settings</span> in the header to add one back.
        </div>
      ) : (
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: "repeat(2, minmax(420px, 1fr))" }}
        >
          {visible.map((slug) => {
            const w = WIDGETS[slug];
            const isHover = hoverSlug === slug && dragSlug !== null && dragSlug !== slug;
            const isDragging = dragSlug === slug;

            const inner = (
              <WidgetErrorBoundary label={w.label}>{w.node}</WidgetErrorBoundary>
            );

            const cellStyle: React.CSSProperties = {
              position: "relative",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
              transform: isHover ? "scale(1.01)" : undefined,
              boxShadow: isHover ? "0 0 0 2px var(--accent-blue)" : undefined,
              borderRadius: "16px",
              opacity: isDragging ? 0.45 : 1,
              gridColumn: w.size === "wide" ? "1 / -1" : undefined,
            };

            const defaultMin = w.defaultRefreshMin ?? 0;
            const effectiveMin = refreshOverrides[slug] ?? defaultMin;
            const hasOverride = slug in refreshOverrides;
            const menuOpen = refreshMenuFor === slug;
            const canRefresh = defaultMin > 0 || hasOverride;

            const handle = (
              <div className="absolute z-20 flex items-center gap-1" style={{ top: 8, right: 8 }}>
                {canRefresh && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setRefreshMenuFor(menuOpen ? null : slug); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      aria-label={`Refresh interval for ${w.label}`}
                      title={`Auto-refresh: ${effectiveMin === 0 ? "off" : `${effectiveMin} min`}${hasOverride ? " (custom)" : ""}`}
                      className="flex items-center justify-center rounded-md text-xs opacity-40 hover:opacity-100"
                      style={{
                        width: 24, height: 24,
                        background: hasOverride ? "var(--accent-cyan)22" : "var(--surface-2)",
                        color: hasOverride ? "var(--accent-cyan)" : "var(--text-muted)",
                        border: `1px solid ${hasOverride ? "var(--accent-cyan)" : "var(--border)"}`,
                        lineHeight: 1,
                      }}
                    >⚡</button>
                    {menuOpen && (
                      <div
                        className="absolute rounded-lg p-2 shadow-lg z-30"
                        style={{ top: 28, right: 0, background: "var(--surface)", border: "1px solid var(--border)", minWidth: 130 }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                      >
                        <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
                          Auto-refresh
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {REFRESH_OPTIONS_MIN.map((m) => {
                            const selected = effectiveMin === m;
                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setRefresh(slug, m === defaultMin ? null : m)}
                                className="text-xs text-left px-2 py-1 rounded"
                                style={{
                                  background: selected ? "var(--accent-cyan)22" : "transparent",
                                  color: selected ? "var(--accent-cyan)" : "var(--text)",
                                }}
                              >
                                {m === 0 ? "Off" : `${m} min`}
                                {m === defaultMin && <span className="ml-1 opacity-60">·default</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <button
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", slug);
                    setDragSlug(slug);
                  }}
                  onDragEnd={() => { setDragSlug(null); setHoverSlug(null); }}
                  onClick={(e) => e.preventDefault()}
                  aria-label={`Drag ${w.label} to reorder`}
                  title="Drag to reorder"
                  className="flex items-center justify-center rounded-md text-xs opacity-40 hover:opacity-100"
                  style={{
                    width: 24, height: 24,
                    cursor: "grab",
                    background: "var(--surface-2)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                    lineHeight: 1,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >⋮⋮</button>
              </div>
            );

            const dropHandlers = {
              onDragOver: (e: React.DragEvent) => {
                if (!dragSlug) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (hoverSlug !== slug) setHoverSlug(slug);
              },
              onDragLeave: () => { if (hoverSlug === slug) setHoverSlug(null); },
              onDrop: (e: React.DragEvent) => {
                e.preventDefault();
                const from = (e.dataTransfer.getData("text/plain") || dragSlug) as Slug | "";
                if (from && from !== slug) swap(from as Slug, slug);
                setDragSlug(null);
                setHoverSlug(null);
              },
            };

            if (w.href) {
              return (
                <div key={slug} className="h-full" style={cellStyle} {...dropHandlers}>
                  {handle}
                  <Link href={w.href} className="block group h-full" draggable={false}>
                    {inner}
                  </Link>
                </div>
              );
            }
            return (
              <div key={slug} className="h-full" style={cellStyle} {...dropHandlers}>
                {handle}
                {inner}
              </div>
            );
          })}
        </div>
      )}

      {isCustomOrder && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={resetOrder}
            className="text-xs px-3 py-1.5 rounded-md"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            Reset widget order
          </button>
        </div>
      )}
    </>
  );
}
