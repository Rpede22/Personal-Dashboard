"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface WowCharacter {
  id: number;
  name: string;
  realm: string;
  region: string;
}

interface ChecklistItem {
  id: number;
  task: string;
  done: boolean;
}

interface CharacterStats {
  ilvl: number | null;
  rioScore: number | null;
  errors: string[];
}

export default function WoWHub() {
  const [characters, setCharacters] = useState<WowCharacter[]>([]);
  const [selectedChar, setSelectedChar] = useState<WowCharacter | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [stats, setStats] = useState<CharacterStats | null>(null);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [addCharForm, setAddCharForm] = useState({ name: "", realm: "", region: "eu" });
  const [showAddChar, setShowAddChar] = useState(false);
  const [lookupForm, setLookupForm] = useState({ name: "", realm: "", region: "eu" });
  const [lookupResult, setLookupResult] = useState<(CharacterStats & { name: string }) | null>(null);

  async function loadCharacters() {
    const res = await fetch("/api/wow/character");
    const data = await res.json();
    setCharacters(data.characters ?? []);
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
      const data = await res.json();
      setChecklist(data.checklist ?? []);
    } finally {
      setLoadingChecklist(false);
    }
    // Load stats in parallel
    setLoadingStats(true);
    try {
      const res = await fetch(
        `/api/wow/character?name=${encodeURIComponent(char.name)}&realm=${encodeURIComponent(char.realm)}&region=${char.region}`
      );
      const data = await res.json();
      setStats(data);
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

  async function lookupCharacter(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(
      `/api/wow/character?name=${encodeURIComponent(lookupForm.name)}&realm=${encodeURIComponent(lookupForm.realm)}&region=${lookupForm.region}`
    );
    const data = await res.json();
    setLookupResult({ ...data, name: lookupForm.name });
  }

  const doneCount = checklist.filter((c) => c.done).length;
  const pct = checklist.length > 0 ? Math.round((doneCount / checklist.length) * 100) : 0;

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

          <div className="space-y-2">
            {characters.map((char) => (
              <div
                key={char.id}
                className="flex items-center gap-2 rounded-xl p-2.5 cursor-pointer transition-all"
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize">{char.name}</p>
                  <p className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>
                    {char.realm} · {char.region.toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCharacter(char.id);
                  }}
                  className="text-xs"
                  style={{ color: "var(--accent-red)" }}
                >
                  ✕
                </button>
              </div>
            ))}
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
                <div className="space-y-1.5">
                  {checklist.map((item) => (
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
                        className="text-xs opacity-0 hover:opacity-100 transition-opacity"
                        style={{ color: "var(--accent-red)" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
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
                  <div className="flex gap-4">
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
                <div className="flex gap-4 text-sm">
                  <span>
                    ilvl:{" "}
                    <strong style={{ color: "var(--accent-blue)" }}>
                      {lookupResult.ilvl ?? "—"}
                    </strong>
                  </span>
                  <span>
                    Raider.IO:{" "}
                    <strong style={{ color: "var(--accent-orange)" }}>
                      {lookupResult.rioScore !== null
                        ? Math.round(lookupResult.rioScore)
                        : "—"}
                    </strong>
                  </span>
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
