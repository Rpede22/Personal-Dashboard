"use client";

import { useState } from "react";
import Link from "next/link";
import WoWHub from "@/components/wow/WoWHub";
import LoLHub from "@/components/lol/LoLHub";

export type GameKey = "wow" | "lol";

/**
 * Unified games hub — one sticky header, a WoW/LoL tab switcher, and the
 * previously-standalone `WoWHub` / `LoLHub` rendered inside with their own
 * internal headers hidden. `/games`, `/wow`, and `/lol` all render this
 * component with a different `defaultGame`, so old bookmarks keep working.
 */
export default function GameHub({ defaultGame = "wow" }: { defaultGame?: GameKey }) {
  const [game, setGame] = useState<GameKey>(defaultGame);

  const tabs: Array<{
    key: GameKey; label: string; emoji: string; color: string;
  }> = [
    { key: "wow", label: "World of Warcraft", emoji: "🧙",  color: "var(--accent-purple)" },
    { key: "lol", label: "League of Legends", emoji: "⚔️", color: "var(--accent-blue)"   },
  ];
  const activeMeta = tabs.find((t) => t.key === game)!;

  return (
    <div className="min-h-screen p-6 page-bg">
      {/* Shared sticky header */}
      <div className="sticky top-[28px] z-10 -mx-6 px-6 pt-5 pb-3 mb-4 page-bg">
        <div className="flex items-center gap-4 mb-3">
          <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: activeMeta.color }}>
            <span>{activeMeta.emoji}</span>
            <span>{activeMeta.label}</span>
          </h1>
        </div>

        {/* Game switcher */}
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
      </div>

      {/* Active sub-hub — rendered with its own header hidden */}
      {game === "wow" ? <WoWHub hideHeader /> : <LoLHub hideHeader />}
    </div>
  );
}
