"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import WidgetErrorBoundary from "@/components/WidgetErrorBoundary";
import { REFRESH_OPTIONS_MIN, loadRefreshOverrides, saveRefreshOverride } from "@/lib/refresh";
import SportsWidget from "@/components/dashboard/SportsWidget";
import SchoolWidget from "@/components/dashboard/SchoolWidget";
import GamesWidget from "@/components/dashboard/GamesWidget";
import RunningWidget from "@/components/dashboard/RunningWidget";
import WorkhubWidget from "@/components/dashboard/WorkhubWidget";
import CalendarWidget from "@/components/dashboard/CalendarWidget";

type Slug = "sports" | "school" | "games" | "running" | "calendar" | "workhub";

const DEFAULT_ORDER: Slug[] = ["sports", "school", "games", "running", "calendar", "workhub"];
const ORDER_KEY = "dashboard.widgetOrder";
const ENABLED_KEY = "dashboard.widgetEnabled";

interface Entry {
  label: string;
  href?: string;
  node: ReactNode;
  /** Preferred size class. `wide` spans both grid columns. Default is 1×1. */
  size?: "square" | "wide";
  /** Default auto-refresh interval in minutes. 0 = never. Shown in the ⚡ menu. */
  defaultRefreshMin?: number;
}

const WIDGETS: Record<Slug, Entry> = {
  sports: { label: "Sports", node: <SportsWidget />, defaultRefreshMin: 5 },
  school: { label: "School", href: "/school", node: <SchoolWidget />, defaultRefreshMin: 0 },
  games: { label: "Games", node: <GamesWidget />, defaultRefreshMin: 2 },
  running: { label: "Running", href: "/running", node: <RunningWidget />, defaultRefreshMin: 0 },
  calendar: { label: "Calendar", href: "/calendar", node: <CalendarWidget />, size: "wide", defaultRefreshMin: 60 },
  workhub: { label: "Workhub", href: "/work", node: <WorkhubWidget />, defaultRefreshMin: 0 },
};

function loadOrder(): Slug[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw) as Slug[];
    const known = new Set(DEFAULT_ORDER);
    const kept = parsed.filter((s) => known.has(s));
    for (const s of DEFAULT_ORDER) if (!kept.includes(s)) kept.push(s);
    return kept;
  } catch {
    return DEFAULT_ORDER;
  }
}

function loadEnabled(): Set<Slug> {
  if (typeof window === "undefined") return new Set(DEFAULT_ORDER);
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (!raw) return new Set(DEFAULT_ORDER);
    const parsed = JSON.parse(raw) as Slug[];
    const known = new Set(DEFAULT_ORDER);
    return new Set(parsed.filter((s) => known.has(s)));
  } catch {
    return new Set(DEFAULT_ORDER);
  }
}

export default function DashboardGrid() {
  const [order, setOrder] = useState<Slug[]>(DEFAULT_ORDER);
  const [enabled, setEnabled] = useState<Set<Slug>>(new Set(DEFAULT_ORDER));
  const [dragSlug, setDragSlug] = useState<Slug | null>(null);
  const [hoverSlug, setHoverSlug] = useState<Slug | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryRef = useRef<HTMLDivElement | null>(null);
  const [refreshOverrides, setRefreshOverrides] = useState<Record<string, number>>({});
  const [refreshMenuFor, setRefreshMenuFor] = useState<Slug | null>(null);

  useEffect(() => {
    setOrder(loadOrder());
    setEnabled(loadEnabled());
    setRefreshOverrides(loadRefreshOverrides());
  }, []);

  function setRefresh(slug: Slug, minutes: number | null) {
    saveRefreshOverride(slug, minutes);
    setRefreshOverrides(loadRefreshOverrides());
    setRefreshMenuFor(null);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* ignore */ }
  }, [order]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(ENABLED_KEY, JSON.stringify([...enabled])); } catch { /* ignore */ }
  }, [enabled]);

  // Close library popover when clicking outside.
  useEffect(() => {
    if (!libraryOpen) return;
    function onDoc(e: MouseEvent) {
      if (libraryRef.current && !libraryRef.current.contains(e.target as Node)) {
        setLibraryOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [libraryOpen]);

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
    setOrder((prev) => {
      const next = [...prev];
      const iF = next.indexOf(from);
      const iT = next.indexOf(to);
      if (iF < 0 || iT < 0) return prev;
      [next[iF], next[iT]] = [next[iT], next[iF]];
      return next;
    });
  }

  function resetOrder() {
    setOrder(DEFAULT_ORDER);
  }

  function toggleWidget(slug: Slug) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const isCustomOrder = order.some((s, i) => s !== DEFAULT_ORDER[i]);
  const visible = order.filter((s) => enabled.has(s));
  const isCustomEnabled = enabled.size !== DEFAULT_ORDER.length;

  return (
    <>
      <div className="flex justify-end items-center gap-2 mb-3">
        <div className="relative" ref={libraryRef}>
          <button
            type="button"
            onClick={() => setLibraryOpen((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-2 hover:brightness-110"
            style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            <span>⚙️</span>
            <span>Widgets</span>
            <span className="tabular-nums">{enabled.size}/{DEFAULT_ORDER.length}</span>
          </button>
          {libraryOpen && (
            <div
              className="absolute right-0 mt-2 rounded-xl p-3 shadow-lg z-30"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                width: 240,
              }}
            >
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                Show widgets
              </div>
              <div className="space-y-1">
                {DEFAULT_ORDER.map((slug) => {
                  const on = enabled.has(slug);
                  return (
                    <label
                      key={slug}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:brightness-110"
                      style={{ background: on ? "var(--surface-2)" : "transparent" }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleWidget(slug)}
                      />
                      <span className="text-sm">{WIDGETS[slug].label}</span>
                    </label>
                  );
                })}
              </div>
              {isCustomEnabled && (
                <button
                  type="button"
                  onClick={() => setEnabled(new Set(DEFAULT_ORDER))}
                  className="mt-3 w-full text-[11px] px-2 py-1 rounded-md"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                >
                  Reset to all on
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div
          className="rounded-2xl p-6 text-center text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          No widgets enabled. Open <span className="font-semibold" style={{ color: "var(--text)" }}>⚙️ Widgets</span> above to add one back.
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
