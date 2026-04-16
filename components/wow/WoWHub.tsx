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

// Cache stats per character key to avoid re-fetching
const statsCache = new Map<string, CharacterStats>();

function getMPlusNumber(task: string): number | null {
  const m = task.match(/^M\+\s+Run\s+(\d+)$/i);
  return m ? parseInt(m[1]) : null;
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
    const key = `${char.region}-${char.realm}-${char.name}`.toLowerCase();
    const cached = statsCache.get(key);
    if (cached) {
      setCharStats((prev) => new Map(prev).set(char.id, cached));
      return cached;
    }
    try {
      const res = await fetch(
        `/api/wow/character?name=${encodeURIComponent(char.name)}&realm=${encodeURIComponent(char.realm)}&region=${char.region}`
      );
      const data = await res.json();
      statsCache.set(key, data);
      setCharStats((prev) => new Map(prev).set(char.id, data));
      return data;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    loadCharacters();
  }, []);

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
    const sorted = [...characters].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((c) => c.id === char.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const other = sorted[swapIdx];
    const myOrder = char.sortOrder;
    const otherOrder = other.sortOrder;

    // Swap sortOrders
    await Promise.all([
      fetch("/api/wow/character", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: char.id, sortOrder: otherOrder }),
      }),
      fetch("/api/wow/character", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: other.id, sortOrder: myOrder }),
      }),
    ]);
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

  // Separate M+ runs (1-8) from custom tasks
  const mplusTasks = checklist.filter((item) => getMPlusNumber(item.task) !== null);
  const customTasks = checklist.filter((item) => getMPlusNumber(item.task) === null);
  const mplusDone = mplusTasks.filter((t) => t.done).length;

  // Build an 8-slot M+ grid (slots 1-8)
  const mplusGrid: (ChecklistItem | null)[] = Array.from({ length: 8 }, (_, i) => {
    return mplusTasks.find((t) => getMPlusNumber(t.task) === i + 1) ?? null;
  });

  const doneCount = checklist.filter((c) => c.done).length;
  const pct = checklist.length > 0 ? Math.round((doneCount / checklist.length) * 100) : 0;

  const sortedCharacters = [...characters].sort((a, b) => a.sortOrder - b.sortOrder);

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
                              {s.ilvl} ilvl
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
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {doneCount}/{checklist.length}
                </span>
              </div>

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
                <>
                  {/* M+ 4×2 grid */}
                  {mplusGrid.some((slot) => slot !== null) && (
                    <div className="mb-4">
                      <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
                        M+ Runs ({mplusDone}/8)
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {mplusGrid.map((item, i) => (
                          <button
                            key={i}
                            onClick={() => item && toggleTask(item)}
                            disabled={!item}
                            className="h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all"
                            style={{
                              background: item?.done
                                ? "var(--accent-green)"
                                : item
                                ? "var(--surface-2)"
                                : "var(--surface-2)",
                              border: item?.done
                                ? "1px solid var(--accent-green)"
                                : "1px solid var(--border)",
                              color: item?.done
                                ? "#fff"
                                : item
                                ? "var(--text)"
                                : "var(--border)",
                              opacity: item ? 1 : 0.4,
                            }}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom tasks */}
                  {customTasks.length > 0 && (
                    <div className="space-y-1.5">
                      {customTasks.map((item) => (
                        <div key={item.id} className="flex items-center gap-3">
                          <button
                            onClick={() => toggleTask(item)}
                            className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-all"
                            style={{
                              background: item.done
                                ? "var(--accent-green)"
                                : "var(--surface-2)",
                              border: `1px solid ${item.done ? "var(--accent-green)" : "var(--border)"}`,
                            }}
                          >
                            {item.done && (
                              <span className="text-white text-xs">✓</span>
                            )}
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
                            style={{
                              color: "var(--accent-red)",
                              border: "1px solid var(--accent-red)",
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
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
                        {stats.ilvl ?? "—"}
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
                    {lookupResult.ilvl ?? "—"} ilvl
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
    </div>
  );
}
