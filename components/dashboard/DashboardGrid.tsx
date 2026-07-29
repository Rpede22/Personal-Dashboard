"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import WidgetErrorBoundary from "@/components/WidgetErrorBoundary";
import SportsWidget from "@/components/dashboard/SportsWidget";
import SchoolWidget from "@/components/dashboard/SchoolWidget";
import GamesWidget from "@/components/dashboard/GamesWidget";
import RunningWidget from "@/components/dashboard/RunningWidget";
import WorkhubWidget from "@/components/dashboard/WorkhubWidget";
import CalendarWidget from "@/components/dashboard/CalendarWidget";

type Slug = "sports" | "school" | "games" | "running" | "calendar" | "workhub";

const DEFAULT_ORDER: Slug[] = ["sports", "school", "games", "running", "calendar", "workhub"];
const STORAGE_KEY = "dashboard.widgetOrder";

interface Entry {
  label: string;
  href?: string;
  node: ReactNode;
}

const WIDGETS: Record<Slug, Entry> = {
  sports: { label: "Sports", node: <SportsWidget /> },
  school: { label: "School", href: "/school", node: <SchoolWidget /> },
  games: { label: "Games", node: <GamesWidget /> },
  running: { label: "Running", href: "/running", node: <RunningWidget /> },
  calendar: { label: "Calendar", href: "/calendar", node: <CalendarWidget /> },
  workhub: { label: "Workhub", node: <WorkhubWidget /> },
};

function loadOrder(): Slug[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw) as Slug[];
    // Merge: keep stored order, append any new widgets not yet in storage,
    // drop any slugs no longer supported.
    const known = new Set(DEFAULT_ORDER);
    const kept = parsed.filter((s) => known.has(s));
    for (const s of DEFAULT_ORDER) if (!kept.includes(s)) kept.push(s);
    return kept;
  } catch {
    return DEFAULT_ORDER;
  }
}

export default function DashboardGrid() {
  const [order, setOrder] = useState<Slug[]>(DEFAULT_ORDER);
  const [dragSlug, setDragSlug] = useState<Slug | null>(null);
  const [hoverSlug, setHoverSlug] = useState<Slug | null>(null);

  useEffect(() => {
    setOrder(loadOrder());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(order)); } catch { /* ignore */ }
  }, [order]);

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

  const isCustom = order.some((s, i) => s !== DEFAULT_ORDER[i]);

  return (
    <>
      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: "repeat(2, minmax(420px, 1fr))" }}
      >
        {order.map((slug) => {
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
          };

          const handle = (
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
              className="absolute z-20 flex items-center justify-center rounded-md text-xs opacity-40 hover:opacity-100"
              style={{
                top: 8, right: 8, width: 24, height: 24,
                cursor: "grab",
                background: "var(--surface-2)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                lineHeight: 1,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >⋮⋮</button>
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

      {isCustom && (
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
