"use client";

import { useEffect, useRef, useState } from "react";
import TodayDate from "@/components/dashboard/TodayDate";
import DashboardPrefs from "@/components/dashboard/DashboardPrefs";
import TodayBriefing from "@/components/dashboard/TodayBriefing";
import WeekAheadHeatmap from "@/components/dashboard/WeekAheadHeatmap";

const SECTIONS_KEY = "dashboard.sectionsEnabled";
type SectionSlug = "todayBriefing" | "weekAhead";
const DEFAULT_SECTIONS: SectionSlug[] = ["todayBriefing", "weekAhead"];
const SECTION_LABELS: Record<SectionSlug, string> = {
  todayBriefing: "Today briefing",
  weekAhead: "Week-ahead heatmap",
};

function loadSections(): Set<SectionSlug> {
  if (typeof window === "undefined") return new Set(DEFAULT_SECTIONS);
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (!raw) return new Set(DEFAULT_SECTIONS);
    const parsed = JSON.parse(raw) as SectionSlug[];
    const known = new Set(DEFAULT_SECTIONS);
    return new Set(parsed.filter((s) => known.has(s)));
  } catch {
    return new Set(DEFAULT_SECTIONS);
  }
}

export default function DashboardHeader() {
  const [sections, setSections] = useState<Set<SectionSlug>>(new Set(DEFAULT_SECTIONS));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setSections(loadSections()); }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(SECTIONS_KEY, JSON.stringify([...sections])); } catch { /* ignore */ }
  }, [sections]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  function toggle(slug: SectionSlug) {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <>
      <header className="sticky top-[28px] z-10 -mx-6 px-6 pt-5 pb-4 mb-6 page-bg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>Dashboard</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              <TodayDate />
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DashboardPrefs />
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-2 hover:brightness-110"
                style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                title="Show/hide dashboard sections"
              >
                <span>🧩</span><span>Sections</span>
                <span className="tabular-nums">{sections.size}/{DEFAULT_SECTIONS.length}</span>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-2 rounded-xl p-3 shadow-lg z-30"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", width: 240 }}
                >
                  <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                    Show sections
                  </div>
                  <div className="space-y-1">
                    {DEFAULT_SECTIONS.map((slug) => {
                      const on = sections.has(slug);
                      return (
                        <label
                          key={slug}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:brightness-110"
                          style={{ background: on ? "var(--surface-2)" : "transparent" }}
                        >
                          <input type="checkbox" checked={on} onChange={() => toggle(slug)} />
                          <span className="text-sm">{SECTION_LABELS[slug]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {sections.has("todayBriefing") && <TodayBriefing />}
      {sections.has("weekAhead") && <WeekAheadHeatmap />}
    </>
  );
}
