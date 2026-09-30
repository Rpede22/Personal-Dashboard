"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import WoWWidget from "./WoWWidget";
import LoLWidget from "./LoLWidget";
import CS2Widget from "./CS2Widget";
import TFTWidget from "./TFTWidget";
import { useEnabledGames } from "@/lib/games-visibility";

type GameKey = "wow" | "lol" | "cs2" | "tft";

const STORAGE_KEY = "dashboard.games.tab";

/**
 * Row-2 dashboard widget that shows either the WoW or the LoL summary,
 * switchable via a small tab bar at the top. The active tab is persisted
 * to localStorage so it survives reloads. Clicking the body of a widget
 * still deep-links into the matching game hub (/wow or /lol).
 */
export default function GamesWidget() {
  const [tab, setTab] = useState<GameKey>("wow");
  const enabled = useEnabledGames();

  // Hydrate persisted tab
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "wow" || raw === "lol" || raw === "cs2" || raw === "tft") setTab(raw);
    } catch { /* ignore */ }
  }, []);

  function selectTab(next: GameKey) {
    setTab(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }

  const allTabs: { key: GameKey; label: string; emoji: string; color: string; href: string }[] = [
    { key: "wow", label: "WoW", emoji: "🧙",  color: "var(--accent-purple)", href: "/wow" },
    { key: "lol", label: "LoL", emoji: "⚔️", color: "var(--accent-blue)",   href: "/lol" },
    { key: "cs2", label: "CS2", emoji: "🎯", color: "var(--accent-orange)", href: "/cs2" },
    { key: "tft", label: "TFT", emoji: "🎲", color: "var(--accent-cyan)",   href: "/tft" },
  ];
  const tabs = allTabs.filter((t) => enabled.has(t.key));

  // If the active tab was hidden in settings, fall back to the first visible one.
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.key === tab)) setTab(tabs[0].key);
  }, [tabs, tab]);

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

      {/* Active game body. WoW is wrapped in a hub link so clicking anywhere
          opens the hub. LoL manages its own per-account navigation (each
          account header is its own Link to /lol?account=<id>), so we render
          it bare — otherwise the outer link swallows the per-account click. */}
      <div className="flex-1">
        {tab === "wow" ? (
          <Link href="/wow" className="block h-full">
            <WoWWidget />
          </Link>
        ) : tab === "lol" ? (
          <LoLWidget />
        ) : tab === "cs2" ? (
          <CS2Widget />
        ) : (
          <TFTWidget />
        )}
      </div>
    </div>
  );
}
