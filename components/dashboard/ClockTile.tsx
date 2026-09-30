"use client";

import { useEffect, useRef, useState } from "react";

/** Live digital clock for the dashboard header. Shows the local time large,
 *  plus any extra timezones the user adds (for family/colleagues abroad).
 *  Timezone selection persists to localStorage — this is a view preference,
 *  not shared data. */

const ZONES_KEY = "dashboard.clock.zones";

// A small curated list; the picker also accepts any IANA zone the browser knows.
const ZONE_PRESETS: Array<{ tz: string; label: string }> = [
  { tz: "Europe/Copenhagen", label: "Copenhagen" },
  { tz: "Europe/London", label: "London" },
  { tz: "America/New_York", label: "New York" },
  { tz: "America/Edmonton", label: "Edmonton" },
  { tz: "America/Los_Angeles", label: "Los Angeles" },
  { tz: "Asia/Tokyo", label: "Tokyo" },
  { tz: "Australia/Sydney", label: "Sydney" },
  { tz: "UTC", label: "UTC" },
];

function loadZones(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ZONES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((z) => typeof z === "string") : [];
  } catch { return []; }
}

function timeInZone(d: Date, tz?: string): string {
  try {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz });
  } catch {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
}

function labelFor(tz: string): string {
  return ZONE_PRESETS.find((z) => z.tz === tz)?.label ?? tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
}

export default function ClockTile() {
  const [now, setNow] = useState<Date | null>(null);
  const [zones, setZones] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setNow(new Date());
    setZones(loadZones());
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(ZONES_KEY, JSON.stringify(zones)); } catch { /* ignore */ }
  }, [zones]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  function toggleZone(tz: string) {
    setZones((prev) => (prev.includes(tz) ? prev.filter((z) => z !== tz) : [...prev, tz]));
  }

  if (!now) return null;

  return (
    <div className="relative flex items-center gap-3" ref={menuRef}>
      {/* Extra zones (compact) */}
      {zones.map((tz) => (
        <div key={tz} className="text-right leading-tight hidden sm:block">
          <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>{timeInZone(now, tz)}</div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{labelFor(tz)}</div>
        </div>
      ))}
      {/* Local clock (always shown) — click to manage zones */}
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="text-right leading-tight hover:brightness-110"
        title="Add/remove timezones"
      >
        <div className="text-xl font-bold tabular-nums" style={{ color: "var(--accent-cyan)" }}>{timeInZone(now)}</div>
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Local ▾</div>
      </button>

      {menuOpen && (
        <div
          className="absolute right-0 top-full mt-2 rounded-xl p-3 shadow-lg z-30"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", width: 220 }}
        >
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Extra timezones</div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {ZONE_PRESETS.map(({ tz, label }) => {
              const on = zones.includes(tz);
              return (
                <label
                  key={tz}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:brightness-110"
                  style={{ background: on ? "var(--surface-2)" : "transparent" }}
                >
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={on} onChange={() => toggleZone(tz)} />
                    <span className="text-sm">{label}</span>
                  </span>
                  <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{timeInZone(now, tz).slice(0, 5)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
