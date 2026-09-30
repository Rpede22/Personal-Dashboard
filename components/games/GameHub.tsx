"use client";

import { useEffect, useState } from "react";
import HubShell from "@/components/HubShell";
import WoWHub from "@/components/wow/WoWHub";
import LoLHub from "@/components/lol/LoLHub";
import CS2Hub from "@/components/cs2/CS2Hub";
import TFTHub from "@/components/tft/TFTHub";
import { useEnabledGames } from "@/lib/games-visibility";

export type GameKey = "wow" | "lol" | "cs2" | "tft";

/**
 * Unified games hub — one sticky header (via HubShell), a WoW/LoL tab switcher,
 * and the previously-standalone `WoWHub` / `LoLHub` rendered inside with their
 * own internal headers hidden. `/games`, `/wow`, and `/lol` all render this
 * component with a different `defaultGame`, so old bookmarks keep working.
 */
export default function GameHub({ defaultGame = "wow" }: { defaultGame?: GameKey }) {
  const [game, setGame] = useState<GameKey>(defaultGame);
  const enabled = useEnabledGames();

  const allTabs: Array<{
    key: GameKey; label: string; emoji: string; color: string;
  }> = [
    { key: "wow", label: "World of Warcraft", emoji: "🧙",  color: "var(--accent-purple)" },
    { key: "lol", label: "League of Legends", emoji: "⚔️", color: "var(--accent-blue)"   },
    { key: "cs2", label: "Counter-Strike 2",  emoji: "🎯", color: "var(--accent-orange)" },
    { key: "tft", label: "Teamfight Tactics", emoji: "🎲", color: "var(--accent-cyan)"   },
  ];
  const tabs = allTabs.filter((t) => enabled.has(t.key));

  // If the active game was hidden, fall back to the first visible one.
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.key === game)) setGame(tabs[0].key);
  }, [tabs, game]);

  const activeMeta = tabs.find((t) => t.key === game) ?? allTabs.find((t) => t.key === game)!;

  const switcher = (
    <div
      className="inline-flex gap-1 rounded-lg p-1"
      style={{ background: "var(--surface-2)" }}
    >
      {tabs.map((t) => {
        const active = t.key === game;
        return (
          <button
            key={t.key}
            onClick={() => setGame(t.key)}
            className="px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2"
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
  );

  return (
    <HubShell
      title={activeMeta.label}
      emoji={activeMeta.emoji}
      color={activeMeta.color}
      tabs={switcher}
    >
      {game === "wow" ? <WoWHub hideHeader /> : game === "lol" ? <LoLHub hideHeader /> : game === "cs2" ? <CS2Hub hideHeader /> : <TFTHub hideHeader />}
    </HubShell>
  );
}
