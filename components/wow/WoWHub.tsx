"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface WowCharacter {
  id: number;
  name: string;
  realm: string;
  region: string;
  sortOrder: number;
}

interface ChecklistItem {
  id: number;
  task: string;
  done: boolean;
}

interface CharacterStats {
  ilvl: number | null;
  rioScore: number | null;
  raidProgress: string | null;
  errors: string[];
}

interface GearWishlistItem {
  id: number | null;
  characterId: number;
  slot: string;
  itemName: string;
  obtained: boolean;
}

const GEAR_SLOTS = [
  // left column (matches WoW panel left side + weapons)
  { id: "HEAD",      label: "Head",      abbr: "He" },
  { id: "NECK",      label: "Neck",      abbr: "Nk" },
  { id: "SHOULDERS", label: "Shoulders", abbr: "Sh" },
  { id: "BACK",      label: "Back",      abbr: "Bk" },
  { id: "CHEST",     label: "Chest",     abbr: "Ch" },
  { id: "WRISTS",    label: "Wrists",    abbr: "Wr" },
  { id: "MAIN_HAND", label: "Main Hand", abbr: "MH" },
  { id: "OFF_HAND",  label: "Off Hand",  abbr: "OH" },
  // right column (matches WoW panel right side)
  { id: "HANDS",     label: "Hands",     abbr: "Ha" },
  { id: "WAIST",     label: "Waist",     abbr: "Wa" },
  { id: "LEGS",      label: "Legs",      abbr: "Le" },
  { id: "FEET",      label: "Feet",      abbr: "Fe" },
  { id: "FINGER_1",  label: "Ring 1",    abbr: "R1" },
  { id: "FINGER_2",  label: "Ring 2",    abbr: "R2" },
  { id: "TRINKET_1", label: "Trinket 1", abbr: "T1" },
  { id: "TRINKET_2", label: "Trinket 2", abbr: "T2" },
] as const;

// No client-side cache — server already caches for 1h via lookupCache.
// Keeping a module-level cache here caused stale ilvl values (e.g. integers from before the 2dp fix).

function getMPlusNumber(task: string): number | null {
  const m = task.match(/^M\+\s+Run\s+(\d+)$/i);
  return m ? parseInt(m[1]) : null;
}

// ── CheckGrid ────────────────────────────────────────────────────────────────
function CheckGrid({
  label,
  grid,
  cols,
  accentColor,
  onToggle,
  onDelete,
  allowDelete = true,
}: {
  label: string;
  grid: (ChecklistItem | null)[];
  cols: number;
  accentColor: string;
  onToggle: (item: ChecklistItem) => void;
  onDelete: (id: number) => void;
  allowDelete?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 28px)`,
          gap: "4px",
        }}
      >
        {grid.map((item, i) =>
          item ? (
            <div key={item.id} className="relative group">
              <button
                onClick={() => onToggle(item)}
                title={item.task}
                className="rounded-md flex items-center justify-center font-bold transition-all"
                style={{
                  width: "28px",
                  height: "28px",
                  fontSize: "11px",
                  background: item.done ? accentColor : "var(--surface-2)",
                  border: `1px solid ${item.done ? accentColor : "var(--border)"}`,
                  color: item.done ? "#fff" : "var(--text-muted)",
                  opacity: item.done ? 1 : 0.85,
                }}
              >
                {i + 1}
              </button>
              {/* Delete × button — shown on hover, only for custom tasks */}
              {allowDelete !== false && (
                <button
                  onClick={() => onDelete(item.id)}
                  title="Delete"
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-white hidden group-hover:flex items-center justify-center leading-none"
                  style={{ background: "var(--accent-red)", fontSize: "9px" }}
                >
                  ×
                </button>
              )}
            </div>
          ) : (
            <div
              key={`empty-${i}`}
              className="rounded-md flex items-center justify-center"
              style={{
                width: "28px",
                height: "28px",
                fontSize: "11px",
                background: "var(--surface-2)",
                border: "1px dashed var(--border)",
                color: "var(--border)",
                opacity: 0.4,
              }}
            >
              {i + 1}
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default function WoWHub() {
  const [characters, setCharacters] = useState<WowCharacter[]>([]);
  const [selectedChar, setSelectedChar] = useState<WowCharacter | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [stats, setStats] = useState<CharacterStats | null>(null);
  const [charStats, setCharStats] = useState<Map<number, CharacterStats>>(new Map());
  const [loadingChars, setLoadingChars] = useState(true);
  const [charsError, setCharsError] = useState<string | null>(null);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [addCharForm, setAddCharForm] = useState({ name: "", realm: "", region: "eu" });
  const [showAddChar, setShowAddChar] = useState(false);
  const [lookupForm, setLookupForm] = useState({ name: "", realm: "", region: "eu" });
  const [lookupResult, setLookupResult] = useState<(CharacterStats & { name: string }) | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [gearWishlist, setGearWishlist] = useState<GearWishlistItem[]>([]);
  const [gearEdits, setGearEdits] = useState<Record<string, string>>({});

  async function loadCharacters() {
    setLoadingChars(true);
    setCharsError(null);
    try {
      const res = await fetch("/api/wow/character");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      const chars: WowCharacter[] = data.characters ?? [];
      setCharacters(chars);
      // Load stats for each character in the background
      chars.forEach((char) => fetchCharStats(char));
    } catch (err) {
      setCharsError(String(err));
    } finally {
      setLoadingChars(false);
    }
  }

  async function fetchCharStats(char: WowCharacter): Promise<CharacterStats | null> {
    try {
      const res = await fetch(
        `/api/wow/character?name=${encodeURIComponent(char.name)}&realm=${encodeURIComponent(char.realm)}&region=${char.region}`
      );
      const data = await res.json();
      setCharStats((prev) => new Map(prev).set(char.id, data));
      return data;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    loadCharacters();
  }, []);

  async function loadGearWishlist(char: WowCharacter) {
    const res = await fetch(`/api/wow/gear-wishlist?characterId=${char.id}`);
    if (!res.ok) return;
    const data = await res.json();
    const items: GearWishlistItem[] = data.items ?? [];
    setGearWishlist(items);
    setGearEdits(Object.fromEntries(items.map((i) => [i.slot, i.itemName])));
  }

  async function toggleGearObtained(slot: string) {
    if (!selectedChar) return;
    const current = gearWishlist.find((i) => i.slot === slot);
    const newObtained = !(current?.obtained ?? false);
    const placeholder: GearWishlistItem = {
      id: null, characterId: selectedChar.id, slot, itemName: current?.itemName ?? "", obtained: newObtained,
    };
    // Optimistic update — insert placeholder if item not yet in state
    setGearWishlist((prev) => {
      const exists = prev.some((i) => i.slot === slot);
      return exists
        ? prev.map((i) => (i.slot === slot ? { ...i, obtained: newObtained } : i))
        : [...prev, placeholder];
    });
    const res = await fetch("/api/wow/gear-wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        characterId: selectedChar.id,
        slot,
        itemName: current?.itemName ?? "",
        obtained: newObtained,
      }),
    });
    // Sync back with the real DB id
    const data = await res.json();
    if (data.item) {
      setGearWishlist((prev) =>
        prev.map((i) => (i.slot === slot ? data.item : i))
      );
    }
  }

  async function saveGearItemName(slot: string) {
    if (!selectedChar) return;
    const itemName = gearEdits[slot] ?? "";
    const current = gearWishlist.find((i) => i.slot === slot);
    setGearWishlist((prev) => {
      const exists = prev.some((i) => i.slot === slot);
      return exists
        ? prev.map((i) => (i.slot === slot ? { ...i, itemName } : i))
        : [...prev, { id: null, characterId: selectedChar.id, slot, itemName, obtained: false }];
    });
    const res = await fetch("/api/wow/gear-wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        characterId: selectedChar.id,
        slot,
        itemName,
        obtained: current?.obtained ?? false,
      }),
    });
    const data = await res.json();
    if (data.item) {
      setGearWishlist((prev) =>
        prev.map((i) => (i.slot === slot ? data.item : i))
      );
    }
  }

  async function loadChecklist(char: WowCharacter) {
    setSelectedChar(char);
    setLoadingChecklist(true);
    setStats(null);
    try {
      const res = await fetch(`/api/wow/checklist?characterId=${char.id}`);
      if (!res.ok) throw new Error(`Checklist fetch failed: ${res.status}`);
      const data = await res.json();
      setChecklist(data.checklist ?? []);
    } catch (err) {
      console.error("Failed to load checklist:", err);
      setChecklist([]);
    } finally {
      setLoadingChecklist(false);
    }
    // Load stats
    setLoadingStats(true);
    try {
      const result = await fetchCharStats(char);
      setStats(result);
    } finally {
      setLoadingStats(false);
    }
    // Load gear wishlist
    loadGearWishlist(char);
  }

  // Lightweight checklist-only refresh — used after sync so we don't wipe ilvl/stats
  async function refreshChecklist(char: WowCharacter) {
    setLoadingChecklist(true);
    try {
      const res = await fetch(`/api/wow/checklist?characterId=${char.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setChecklist(data.checklist ?? []);
    } catch { /* silently ignore */ } finally {
      setLoadingChecklist(false);
    }
  }

  async function toggleTask(item: ChecklistItem) {
    await fetch("/api/wow/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, done: !item.done }),
    });
    setChecklist((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c))
    );
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedChar || !newTask.trim()) return;
    await fetch("/api/wow/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: selectedChar.id, task: newTask.trim() }),
    });
    setNewTask("");
    const res = await fetch(`/api/wow/checklist?characterId=${selectedChar.id}`);
    const data = await res.json();
    setChecklist(data.checklist ?? []);
  }

  async function deleteTask(id: number) {
    await fetch(`/api/wow/checklist?id=${id}`, { method: "DELETE" });
    setChecklist((prev) => prev.filter((c) => c.id !== id));
  }

  async function syncFromRaiderIO() {
    if (!selectedChar) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/wow/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedChar.id }),
      });
      const data = await res.json();
      if (data.error) {
        setSyncResult(`Error: ${data.error}`);
      } else if (data.firstSync && data.raidDataSource === "raider-io-baseline") {
        // First RIO baseline sync — no kills trackable yet
        const crawled = data.lastCrawledAt
          ? ` · RIO updated ${new Date(data.lastCrawledAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
          : "";
        setSyncResult(`Baseline set — sync again after killing bosses to auto-tick this week's kills${crawled}`);
      } else {
        const n = data.synced.totalBosses || 9;
        const source = data.raidDataSource === "blizzard" ? " · Blizzard API" : " · RIO baseline";
        const crawled = data.lastCrawledAt
          ? ` · RIO ${new Date(data.lastCrawledAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
          : "";
        const staleNote = data.staleData ? " ⚠️ RIO data stale" : "";
        const updatedNote = data.updated > 0 ? ` · ✓ ${data.updated} ticked` : "";
        setSyncResult(`${selectedChar.name}: M+ ${data.synced.mplusCount}/8 · N ${data.synced.normalKills}/${n} · H ${data.synced.heroicKills}/${n} · M ${data.synced.mythicKills}/${n}${source}${crawled}${updatedNote}${staleNote}`);
        refreshChecklist(selectedChar);
      }
    } catch {
      setSyncResult("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function resetBaseline() {
    if (!selectedChar) return;
    if (!confirm(`Reset raid baseline for ${selectedChar.name}? Next sync will set a fresh baseline — sync BEFORE raiding this week so the baseline is 0.`)) return;
    try {
      const res = await fetch(`/api/wow/sync?characterId=${selectedChar.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) setSyncResult(`Baseline cleared for ${data.character} — click Sync now to set fresh baseline`);
      else setSyncResult(`Error: ${data.error}`);
    } catch {
      setSyncResult("Reset failed");
    }
  }

  async function addCharacter(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/wow/character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addCharForm),
    });
    setAddCharForm({ name: "", realm: "", region: "eu" });
    setShowAddChar(false);
    loadCharacters();
  }

  async function deleteCharacter(id: number) {
    await fetch(`/api/wow/character?id=${id}`, { method: "DELETE" });
    if (selectedChar?.id === id) {
      setSelectedChar(null);
      setChecklist([]);
      setStats(null);
    }
    loadCharacters();
  }

  async function moveCharacter(char: WowCharacter, direction: "up" | "down") {
    // Sort by sortOrder, break ties by id (fixes the "all-zero" case)
    const sorted = [...characters].sort((a, b) =>
      a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.id - b.id
    );
    const idx = sorted.findIndex((c) => c.id === char.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    // Swap in array, then rewrite all sortOrders as 0,1,2,... sequentially
    // This fixes the "all sortOrder=0" case where swapping values is a no-op
    const reordered = [...sorted];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    await Promise.all(
      reordered.map((c, i) =>
        fetch("/api/wow/character", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: c.id, sortOrder: i }),
        })
      )
    );
    loadCharacters();
  }

  async function lookupCharacter(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(
      `/api/wow/character?name=${encodeURIComponent(lookupForm.name)}&realm=${encodeURIComponent(lookupForm.realm)}&region=${lookupForm.region}`
    );
    const data = await res.json();
    setLookupResult({ ...data, name: lookupForm.name });
  }

  // ── Checklist categorisation ──────────────────────────────────────────────
  function getBossNumber(task: string, diff: string): number | null {
    const m = task.match(new RegExp(`^${diff} Boss (\\d+)$`, "i"));
    return m ? parseInt(m[1]) : null;
  }

  const mplusTasks   = checklist.filter((item) => getMPlusNumber(item.task) !== null);
  const normalTasks  = checklist.filter((item) => getBossNumber(item.task, "Normal") !== null);
  const heroicTasks  = checklist.filter((item) => getBossNumber(item.task, "Heroic") !== null);
  const mythicTasks  = checklist.filter((item) => getBossNumber(item.task, "Mythic") !== null);
  const raidTasks    = [...normalTasks, ...heroicTasks, ...mythicTasks];
  const customTasks  = checklist.filter(
    (item) =>
      getMPlusNumber(item.task) === null &&
      getBossNumber(item.task, "Normal") === null &&
      getBossNumber(item.task, "Heroic") === null &&
      getBossNumber(item.task, "Mythic") === null
  );

  const mplusDone  = mplusTasks.filter((t) => t.done).length;

  // Build an 8-slot M+ grid
  const mplusGrid: (ChecklistItem | null)[] = Array.from({ length: 8 }, (_, i) =>
    mplusTasks.find((t) => getMPlusNumber(t.task) === i + 1) ?? null
  );

  // Build boss grids (9 slots each)
  function buildBossGrid(tasks: ChecklistItem[], diff: string): (ChecklistItem | null)[] {
    return Array.from({ length: 9 }, (_, i) =>
      tasks.find((t) => getBossNumber(t.task, diff) === i + 1) ?? null
    );
  }
  const normalGrid = buildBossGrid(normalTasks, "Normal");
  const heroicGrid = buildBossGrid(heroicTasks, "Heroic");
  const mythicGrid = buildBossGrid(mythicTasks, "Mythic");

  const doneCount = checklist.filter((c) => c.done).length;
  const pct = checklist.length > 0 ? Math.round((doneCount / checklist.length) * 100) : 0;

  const sortedCharacters = [...characters].sort((a, b) =>
    a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.id - b.id
  );

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--background)" }}>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--accent-purple)" }}>
          🧙 WoW Hub
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Character list */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Characters</h2>
            <button
              onClick={() => setShowAddChar(!showAddChar)}
              className="text-sm px-3 py-1 rounded-lg"
              style={{ background: "var(--accent-purple)", color: "#fff" }}
            >
              + Add
            </button>
          </div>

          {showAddChar && (
            <form onSubmit={addCharacter} className="space-y-2 mb-4">
              <input
                required
                placeholder="Character name"
                value={addCharForm.name}
                onChange={(e) =>
                  setAddCharForm((f) => ({ ...f, name: e.target.value }))
                }
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              />
              <input
                required
                placeholder="Realm"
                value={addCharForm.realm}
                onChange={(e) =>
                  setAddCharForm((f) => ({ ...f, realm: e.target.value }))
                }
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              />
              <select
                value={addCharForm.region}
                onChange={(e) =>
                  setAddCharForm((f) => ({ ...f, region: e.target.value }))
                }
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="eu">EU</option>
                <option value="us">US</option>
                <option value="kr">KR</option>
                <option value="tw">TW</option>
              </select>
              <button
                type="submit"
                className="w-full py-1.5 rounded-lg text-sm"
                style={{ background: "var(--accent-purple)", color: "#fff" }}
              >
                Save
              </button>
            </form>
          )}

          {loadingChars ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading characters…</p>
          ) : charsError ? (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: "var(--accent-red)" }}>{charsError}</p>
              <button
                onClick={loadCharacters}
                className="text-xs px-3 py-1 rounded-lg"
                style={{ background: "var(--accent-purple)", color: "#fff" }}
              >
                Retry
              </button>
            </div>
          ) : null}

          <div className="space-y-2">
            {sortedCharacters.map((char, idx) => {
              const s = charStats.get(char.id);
              return (
                <div
                  key={char.id}
                  className="rounded-xl p-2.5 cursor-pointer transition-all"
                  style={{
                    background:
                      selectedChar?.id === char.id
                        ? "var(--accent-purple)22"
                        : "var(--surface-2)",
                    border:
                      selectedChar?.id === char.id
                        ? "1px solid var(--accent-purple)"
                        : "1px solid transparent",
                  }}
                  onClick={() => loadChecklist(char)}
                >
                  <div className="flex items-center gap-2">
                    {/* Reorder arrows */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveCharacter(char, "up"); }}
                        disabled={idx === 0}
                        className="text-xs leading-none px-0.5"
                        style={{ color: idx === 0 ? "var(--border)" : "var(--text-muted)" }}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveCharacter(char, "down"); }}
                        disabled={idx === sortedCharacters.length - 1}
                        className="text-xs leading-none px-0.5"
                        style={{
                          color:
                            idx === sortedCharacters.length - 1
                              ? "var(--border)"
                              : "var(--text-muted)",
                        }}
                        title="Move down"
                      >
                        ↓
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">{char.name}</p>
                      <p className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>
                        {char.realm} · {char.region.toUpperCase()}
                      </p>
                      {s && (
                        <div className="flex gap-2 mt-0.5">
                          {s.ilvl !== null && (
                            <span className="text-xs" style={{ color: "var(--accent-blue)" }}>
                              {s.ilvl.toFixed(2)} ilvl
                            </span>
                          )}
                          {s.rioScore !== null && (
                            <span className="text-xs" style={{ color: "var(--accent-orange)" }}>
                              {Math.round(s.rioScore)} rio
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCharacter(char.id);
                      }}
                      className="text-xs px-2 py-1 rounded-md font-medium"
                      style={{
                        color: "var(--accent-red)",
                        background: "var(--surface)",
                        border: "1px solid var(--accent-red)",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
            {characters.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No characters yet
              </p>
            )}
          </div>
        </div>

        {/* Checklist */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {selectedChar ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold capitalize">
                  {selectedChar.name} — Weekly
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={syncFromRaiderIO}
                    disabled={syncing}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{ background: "var(--accent-purple)22", color: "var(--accent-purple)" }}
                    title="Auto-sync M+ and raid kills from Raider.IO"
                  >
                    {syncing ? "Syncing…" : "⟳ Sync"}
                  </button>
                  <button
                    onClick={resetBaseline}
                    disabled={syncing}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                    title="Reset raid baseline for this week (use if bosses show 0 incorrectly)"
                  >
                    ↺ Reset
                  </button>
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {doneCount}/{checklist.length}
                  </span>
                </div>
              </div>
              {syncResult && (
                <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{syncResult}</p>
              )}
              <p className="text-[11px] mb-2" style={{ color: "var(--border)" }}>
                With Blizzard API credentials: kills detected per-boss automatically each sync. Without credentials (RIO fallback): Sync <strong>before</strong> raiding to set baseline, then Sync after to tick kills. Use <strong>↺ Reset</strong> if the baseline is wrong.
              </p>

              <div className="mb-4">
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background:
                        pct === 100 ? "var(--accent-green)" : "var(--accent-purple)",
                    }}
                  />
                </div>
              </div>

              {loadingChecklist ? (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
              ) : (
                <div className="space-y-4">
                  {/* M+ 4×2 grid */}
                  {mplusGrid.some((s) => s !== null) && (
                    <CheckGrid
                      label={`M+ Runs (${mplusDone}/8)`}
                      grid={mplusGrid}
                      cols={4}
                      accentColor="var(--accent-purple)"
                      onToggle={toggleTask}
                      onDelete={deleteTask}
                      allowDelete={false}
                    />
                  )}

                  {/* Boss kill grids */}
                  {normalGrid.some((s) => s !== null) && (
                    <CheckGrid
                      label={`Normal (${normalTasks.filter(t=>t.done).length}/9)`}
                      grid={normalGrid}
                      cols={5}
                      accentColor="var(--accent-green)"
                      onToggle={toggleTask}
                      onDelete={deleteTask}
                      allowDelete={false}
                    />
                  )}
                  {heroicGrid.some((s) => s !== null) && (
                    <CheckGrid
                      label={`Heroic (${heroicTasks.filter(t=>t.done).length}/9)`}
                      grid={heroicGrid}
                      cols={5}
                      accentColor="var(--accent-blue)"
                      onToggle={toggleTask}
                      onDelete={deleteTask}
                      allowDelete={false}
                    />
                  )}
                  {mythicGrid.some((s) => s !== null) && (
                    <CheckGrid
                      label={`Mythic (${mythicTasks.filter(t=>t.done).length}/9)`}
                      grid={mythicGrid}
                      cols={5}
                      accentColor="var(--accent-orange)"
                      onToggle={toggleTask}
                      onDelete={deleteTask}
                      allowDelete={false}
                    />
                  )}

                  {/* Custom tasks */}
                  {customTasks.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Custom</p>
                      {customTasks.map((item) => (
                        <div key={item.id} className="flex items-center gap-3">
                          <button
                            onClick={() => toggleTask(item)}
                            className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-all"
                            style={{
                              background: item.done ? "var(--accent-green)" : "var(--surface-2)",
                              border: `1px solid ${item.done ? "var(--accent-green)" : "var(--border)"}`,
                            }}
                          >
                            {item.done && <span className="text-white text-xs">✓</span>}
                          </button>
                          <span
                            className="flex-1 text-sm"
                            style={{
                              textDecoration: item.done ? "line-through" : "none",
                              color: item.done ? "var(--text-muted)" : "var(--text)",
                            }}
                          >
                            {item.task}
                          </span>
                          <button
                            onClick={() => deleteTask(item.id)}
                            className="text-xs px-2 py-0.5 rounded-md"
                            style={{ color: "var(--accent-red)", border: "1px solid var(--accent-red)" }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={addTask} className="mt-4 flex gap-2">
                <input
                  placeholder="Add custom task…"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  className="flex-1 rounded-lg px-3 py-1.5 text-sm"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-sm"
                  style={{ background: "var(--accent-purple)", color: "#fff" }}
                >
                  Add
                </button>
              </form>
            </>
          ) : (
            <div className="flex items-center justify-center h-40">
              <p style={{ color: "var(--text-muted)" }}>Select a character</p>
            </div>
          )}
        </div>

        {/* Stats + Lookup */}
        <div className="space-y-4">
          {/* Character stats */}
          {selectedChar && (
            <div
              className="rounded-2xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <h2 className="font-semibold mb-3 capitalize">{selectedChar.name} Stats</h2>
              {loadingStats ? (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Loading stats…
                </p>
              ) : stats ? (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div
                      className="flex-1 rounded-xl p-3 text-center"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <div
                        className="text-2xl font-bold"
                        style={{ color: "var(--accent-blue)" }}
                      >
                        {stats.ilvl !== null ? stats.ilvl.toFixed(2) : "—"}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Item Level
                      </div>
                    </div>
                    <div
                      className="flex-1 rounded-xl p-3 text-center"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <div
                        className="text-2xl font-bold"
                        style={{ color: "var(--accent-orange)" }}
                      >
                        {stats.rioScore !== null
                          ? Math.round(stats.rioScore)
                          : "—"}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Raider.IO
                      </div>
                    </div>
                    {stats.raidProgress && (
                      <div
                        className="flex-1 rounded-xl p-3 text-center"
                        style={{ background: "var(--surface-2)" }}
                      >
                        <div
                          className="text-2xl font-bold"
                          style={{ color: "var(--accent-purple)" }}
                        >
                          {stats.raidProgress}
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Raid
                        </div>
                      </div>
                    )}
                  </div>
                  {stats.errors.length > 0 && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {stats.errors.join(" · ")}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Lookup tool */}
          <div
            className="rounded-2xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h2 className="font-semibold mb-3">Character Lookup</h2>
            <form onSubmit={lookupCharacter} className="space-y-2">
              <input
                required
                placeholder="Name"
                value={lookupForm.name}
                onChange={(e) => setLookupForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              />
              <input
                required
                placeholder="Realm"
                value={lookupForm.realm}
                onChange={(e) =>
                  setLookupForm((f) => ({ ...f, realm: e.target.value }))
                }
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              />
              <select
                value={lookupForm.region}
                onChange={(e) =>
                  setLookupForm((f) => ({ ...f, region: e.target.value }))
                }
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="eu">EU</option>
                <option value="us">US</option>
                <option value="kr">KR</option>
                <option value="tw">TW</option>
              </select>
              <button
                type="submit"
                className="w-full py-1.5 rounded-lg text-sm"
                style={{ background: "var(--accent-purple)", color: "#fff" }}
              >
                Look up
              </button>
            </form>

            {lookupResult && (
              <div className="mt-4 rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
                <p className="font-medium capitalize mb-2">{lookupResult.name}</p>
                <div className="flex flex-wrap gap-2 text-sm">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: "var(--accent-blue)22", color: "var(--accent-blue)" }}
                  >
                    {lookupResult.ilvl !== null ? lookupResult.ilvl.toFixed(2) : "—"} ilvl
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: "var(--accent-orange)22", color: "var(--accent-orange)" }}
                  >
                    {lookupResult.rioScore !== null
                      ? Math.round(lookupResult.rioScore)
                      : "—"} rio
                  </span>
                  {lookupResult.raidProgress && (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ background: "var(--accent-purple)22", color: "var(--accent-purple)" }}
                    >
                      {lookupResult.raidProgress}
                    </span>
                  )}
                </div>
                {lookupResult.errors.length > 0 && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {lookupResult.errors.join(" · ")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Gear Wishlist ──────────────────────────────────────────────────── */}
      {selectedChar && (
        <div
          className="rounded-2xl p-5 mt-6"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold capitalize">
              {selectedChar.name} — Items to Get
            </h2>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {gearWishlist.filter((i) => i.obtained).length}/{gearWishlist.length} obtained
            </span>
          </div>

          <div className="flex gap-6">
            {[GEAR_SLOTS.slice(0, 8), GEAR_SLOTS.slice(8, 16)].map((col, colIdx) => (
              <div key={colIdx} className="flex-1 min-w-0">
                {col.map((slotInfo) => {
                  const item = gearWishlist.find((i) => i.slot === slotInfo.id) ?? {
                    id: null, characterId: selectedChar.id, slot: slotInfo.id, itemName: "", obtained: false,
                  };
                  const editVal = gearEdits[slotInfo.id] ?? "";
                  const hasItem = editVal.trim() !== "";
                  return (
                    <div key={slotInfo.id} className="flex items-center gap-2.5 py-1 border-b" style={{ borderColor: "var(--border)" }}>
                      {/* WoW-style slot box */}
                      <div
                        className="flex-shrink-0 rounded flex items-center justify-center font-bold text-xs select-none"
                        style={{
                          width: 34,
                          height: 34,
                          background: item.obtained
                            ? "var(--accent-green)33"
                            : hasItem
                              ? "var(--accent-purple)22"
                              : "var(--surface-2)",
                          border: `1px solid ${item.obtained
                            ? "var(--accent-green)"
                            : hasItem
                              ? "var(--accent-purple)55"
                              : "var(--border)"}`,
                          color: item.obtained ? "var(--accent-green)" : "var(--text-muted)",
                          boxShadow: item.obtained ? "0 0 6px var(--accent-green)44" : "none",
                        }}
                      >
                        {item.obtained ? "✓" : slotInfo.abbr}
                      </div>

                      {/* Slot name + item name input */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] leading-none mb-0.5" style={{ color: "var(--text-muted)" }}>
                          {slotInfo.label}
                        </p>
                        <input
                          value={editVal}
                          onChange={(e) =>
                            setGearEdits((prev) => ({ ...prev, [slotInfo.id]: e.target.value }))
                          }
                          onBlur={() => saveGearItemName(slotInfo.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          placeholder="—"
                          className="block w-full text-xs bg-transparent outline-none"
                          style={{
                            color: item.obtained ? "var(--text-muted)" : "var(--text)",
                            textDecoration: item.obtained ? "line-through" : "none",
                          }}
                        />
                      </div>

                      {/* Obtained toggle — only active when an item name is set */}
                      <button
                        onClick={() => hasItem && toggleGearObtained(slotInfo.id)}
                        title={!hasItem ? "Enter an item name first" : item.obtained ? "Mark as needed" : "Mark as obtained"}
                        className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-bold transition-all"
                        style={{
                          background: item.obtained ? "var(--accent-green)" : "var(--surface-2)",
                          border: `1px solid ${item.obtained ? "var(--accent-green)" : "var(--border)"}`,
                          color: item.obtained ? "#fff" : "var(--border)",
                          opacity: hasItem ? 1 : 0.3,
                          cursor: hasItem ? "pointer" : "not-allowed",
                        }}
                      >
                        ✓
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
