"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import WoWWidget from "./WoWWidget";
import LoLWidget from "./LoLWidget";

type GameKey = "wow" | "lol";

const STORAGE_KEY = "dashboard.games.tab";

/**
 * Row-2 dashboard widget that shows either the WoW or the LoL summary,
 * switchable via a small tab bar at the top. The active tab is persisted
 * to localStorage so it survives reloads. Clicking the body of a widget
 * still deep-links into the matching game hub (/wow or /lol).
 */
export default function GamesWidget() {
  const [tab, setTab] = useState<GameKey>("wow");

  // Hydrate persisted tab
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "wow" || raw === "lol") setTab(raw);
    } catch { /* ignore */ }
  }, []);

  function selectTab(next: GameKey) {
    setTab(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }

  const tabs: { key: GameKey; label: string; emoji: string; color: string; href: string }[] = [
    { key: "wow", label: "WoW", emoji: "🧙",  color: "var(--accent-purple)", href: "/wow" },
    { key: "lol", label: "LoL", emoji: "⚔️", color: "var(--accent-blue)",   href: "/lol" },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar — click a tab to switch the visible game. The widget body
          underneath is the navigation link into the hub. */}
      <div
        className="flex items-center mb-2 rounded-lg px-1.5 py-1"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex gap-1">
          {tabs.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => selectTab(t.key)}
                className="px-3 py-1 rounded-md text-sm font-medium flex items-center gap-1.5"
                style={{
                  background: active ? t.color : "transparent",
                  color: active ? "#fff" : "var(--text-muted)",
                }}
              >
                <span>{t.emoji}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active game body — wrap in the hub link so clicking anywhere still opens the hub */}
      <Link href={tabs.find((t) => t.key === tab)!.href} className="block flex-1">
        {tab === "wow" ? <WoWWidget /> : <LoLWidget />}
      </Link>
    </div>
  );
}
