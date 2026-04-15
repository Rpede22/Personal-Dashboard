"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface RunLog {
  id: number;
  date: string;
  distance: number;
  duration: number;
  feel: string | null;
  notes: string | null;
}

const FEEL_OPTIONS = ["easy", "moderate", "hard"] as const;
const FEEL_COLOR: Record<string, string> = {
  easy: "var(--accent-green)",
  moderate: "var(--accent-orange)",
  hard: "var(--accent-red)",
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pace(distKm: number, durationSec: number): string {
  if (distKm === 0) return "—";
  const secPerKm = durationSec / distKm;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export default function RunningHub() {
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [raceDate, setRaceDate] = useState("");
  const [raceDateInput, setRaceDateInput] = useState("");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    distanceKm: "",
    durationMin: "",
    durationSec: "",
    feel: "moderate",
    notes: "",
  });

  async function loadRuns() {
    setLoading(true);
    try {
      const res = await fetch("/api/running?limit=30");
      const data = await res.json();
      setRuns(data.runs ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    const res = await fetch("/api/running/summary");
    const data = await res.json();
    setRaceDate(data.raceDate ?? "");
    setRaceDateInput(data.raceDate ?? "");
  }

  useEffect(() => {
    loadRuns();
    loadSummary();
  }, []);

  async function logRun(e: React.FormEvent) {
    e.preventDefault();
    const durationSec =
      parseInt(form.durationMin || "0") * 60 + parseInt(form.durationSec || "0");
    await fetch("/api/running", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        distance: parseFloat(form.distanceKm),
        duration: durationSec,
        feel: form.feel,
        notes: form.notes || null,
      }),
    });
    setForm({
      date: new Date().toISOString().slice(0, 10),
      distanceKm: "",
      durationMin: "",
      durationSec: "",
      feel: "moderate",
      notes: "",
    });
    setShowForm(false);
    loadRuns();
  }

  async function deleteRun(id: number) {
    await fetch(`/api/running/${id}`, { method: "DELETE" });
    setRuns((prev) => prev.filter((r) => r.id !== id));
  }

  async function saveRaceDate() {
    await fetch("/api/running/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceDate: raceDateInput }),
    });
    setRaceDate(raceDateInput);
  }

  const daysToRace = raceDate
    ? Math.ceil((new Date(raceDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // Weekly mileage
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const weeklyKm = runs
    .filter((r) => new Date(r.date) >= monday)
    .reduce((sum, r) => sum + r.distance, 0);

  // Total km logged
  const totalKm = runs.reduce((sum, r) => sum + r.distance, 0);

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--background)" }}>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--accent-green)" }}>
          🏃 Running Hub
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="ml-auto px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "var(--accent-green)", color: "#fff" }}
        >
          + Log Run
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "This week", value: `${weeklyKm.toFixed(1)} km`, color: "var(--accent-green)" },
          { label: "Total logged", value: `${totalKm.toFixed(1)} km`, color: "var(--accent-blue)" },
          { label: "Total runs", value: runs.length.toString(), color: "var(--accent-purple)" },
          {
            label: "Days to race",
            value: daysToRace !== null ? daysToRace.toString() : "—",
            color: "var(--accent-orange)",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl p-4 text-center"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="text-2xl font-bold" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Race date config */}
      <div
        className="rounded-2xl p-4 mb-6 flex flex-wrap items-end gap-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Race date
          </label>
          <input
            type="date"
            value={raceDateInput}
            onChange={(e) => setRaceDateInput(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{
              background: "var(--surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              colorScheme: "dark",
            }}
          />
        </div>
        <button
          onClick={saveRaceDate}
          className="px-4 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--accent-green)", color: "#fff" }}
        >
          Save
        </button>
        {raceDate && (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {new Date(raceDate).toLocaleDateString("en-GB", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        )}
      </div>

      {/* Log run form */}
      {showForm && (
        <form
          onSubmit={logRun}
          className="rounded-2xl p-5 mb-6 space-y-3"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <h3 className="font-semibold">Log a Run</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                Date
              </label>
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  colorScheme: "dark",
                }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                Distance (km)
              </label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 10.5"
                value={form.distanceKm}
                onChange={(e) => setForm((f) => ({ ...f, distanceKm: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                Duration
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  placeholder="min"
                  value={form.durationMin}
                  onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                  className="flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="sec"
                  value={form.durationSec}
                  onChange={(e) => setForm((f) => ({ ...f, durationSec: e.target.value }))}
                  className="flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                How did it feel?
              </label>
              <div className="flex gap-2">
                {FEEL_OPTIONS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setForm((form) => ({ ...form, feel: f }))}
                    className="flex-1 py-2 rounded-lg text-sm capitalize"
                    style={{
                      background:
                        form.feel === f ? FEEL_COLOR[f] : "var(--surface-2)",
                      color: form.feel === f ? "#fff" : "var(--text-muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{
              background: "var(--surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent-green)", color: "#fff" }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Run log */}
      <h3 className="font-semibold mb-3">Run Log</h3>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : runs.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-lg mb-2">No runs logged yet</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Click &quot;+ Log Run&quot; to add your first run
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Date", "Distance", "Duration", "Pace", "Feel", "Notes", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td className="px-4 py-3">
                    {new Date(run.date).toLocaleDateString("en-GB", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: "var(--accent-green)" }}>
                    {run.distance.toFixed(2)} km
                  </td>
                  <td className="px-4 py-3">{formatDuration(run.duration)}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {pace(run.distance, run.duration)}
                  </td>
                  <td className="px-4 py-3">
                    {run.feel ? (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full capitalize"
                        style={{
                          background: `${FEEL_COLOR[run.feel]}22`,
                          color: FEEL_COLOR[run.feel],
                        }}
                      >
                        {run.feel}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-xs max-w-40 truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {run.notes ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteRun(run.id)}
                      className="text-xs"
                      style={{ color: "var(--accent-red)" }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
