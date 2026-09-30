"use client";

import { useEffect, useState } from "react";

/**
 * Which game tabs (WoW / LoL / CS2) are shown in the Games hub + dashboard
 * widget. A per-viewer preference (localStorage) — disabling a game you don't
 * play hides its tab everywhere, live. Follows the weather-city pattern: writes
 * broadcast a same-tab CustomEvent so the hub + widget re-read immediately.
 *
 * Semantics mirror the widget on/off store: turning a game OFF sticks, while a
 * genuinely-new game (added to GAMES later) defaults ON — tracked via a
 * companion "known" list so a disabled game isn't resurrected on reload.
 */

export type GameKey = "wow" | "lol" | "cs2" | "tft";

export const GAMES: { key: GameKey; label: string; short: string; emoji: string; color: string }[] = [
  { key: "wow", label: "World of Warcraft", short: "WoW", emoji: "🧙",  color: "var(--accent-purple)" },
  { key: "lol", label: "League of Legends", short: "LoL", emoji: "⚔️", color: "var(--accent-blue)"   },
  { key: "cs2", label: "Counter-Strike 2",  short: "CS2", emoji: "🎯", color: "var(--accent-orange)" },
  { key: "tft", label: "Teamfight Tactics", short: "TFT", emoji: "🎲", color: "var(--accent-cyan)"   },
];

const ALL: GameKey[] = GAMES.map((g) => g.key);
const ENABLED_KEY = "dashboard.games.enabled";
const KNOWN_KEY = "dashboard.games.known";
const CHANGE_EVENT = "games-visibility-change";

export function loadEnabledGames(): Set<GameKey> {
  if (typeof window === "undefined") return new Set(ALL);
  const known = new Set(ALL);
  try {
    const rawEnabled = localStorage.getItem(ENABLED_KEY);
    if (rawEnabled === null) {
      localStorage.setItem(KNOWN_KEY, JSON.stringify(ALL));
      return new Set(ALL);
    }
    const enabled = new Set((JSON.parse(rawEnabled) as GameKey[]).filter((k) => known.has(k)));
    const knownStored: GameKey[] = (() => {
      try { const r = localStorage.getItem(KNOWN_KEY); return r ? (JSON.parse(r) as GameKey[]).filter((k) => known.has(k)) : []; }
      catch { return []; }
    })();
    const knownSet = new Set(knownStored);
    let sawNew = false;
    for (const g of ALL) if (!knownSet.has(g)) { enabled.add(g); sawNew = true; }
    if (sawNew || knownStored.length !== ALL.length) localStorage.setItem(KNOWN_KEY, JSON.stringify(ALL));
    // Never let everything be off — fall back to all-on so the hub isn't empty.
    return enabled.size === 0 ? new Set(ALL) : enabled;
  } catch {
    return new Set(ALL);
  }
}

export function saveEnabledGames(enabled: Set<GameKey>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify([...enabled]));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch { /* ignore */ }
}

/** React hook: the enabled game set, auto-updating on change (same-tab event + cross-tab storage). */
export function useEnabledGames(): Set<GameKey> {
  const [enabled, setEnabled] = useState<Set<GameKey>>(() => new Set(ALL));
  useEffect(() => {
    setEnabled(loadEnabledGames());
    const onChange = () => setEnabled(loadEnabledGames());
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return enabled;
}
