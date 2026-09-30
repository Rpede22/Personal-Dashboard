"use client";

import { useEffect, useState } from "react";

/** Slim top-of-dashboard strip: pinned important dates with a live countdown.
 *  Deliberately lighter than the Calendar — for race day, trips, holidays.
 *  Persists to `countdowns.json` via /api/countdowns. Sorted soonest-first;
 *  past events auto-drop the day after. */

interface Countdown {
  id: string;
  label: string;
  date: string; // YYYY-MM-DD
}

function daysUntil(date: string): number {
  const target = new Date(date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function countdownLabel(days: number): { text: string; color: string } {
  if (days < 0) return { text: "past", color: "var(--text-muted)" };
  if (days === 0) return { text: "Today", color: "var(--accent-green)" };
  if (days === 1) return { text: "Tomorrow", color: "var(--accent-orange)" };
  return { text: `in ${days} days`, color: days <= 7 ? "var(--accent-orange)" : "var(--text)" };
}

export default function CountdownStrip() {
  const [items, setItems] = useState<Countdown[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/countdowns");
      const j = await res.json();
      setItems(j.countdowns ?? []);
    } catch {
      setItems([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!label.trim() || !date) return;
    setSaving(true);
    try {
      await fetch("/api/countdowns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), date }),
      });
      setLabel(""); setDate(""); setAdding(false);
      await load();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    await fetch(`/api/countdowns?id=${id}`, { method: "DELETE" });
    await load();
  }

  if (items === null) return null;

  // Hide events more than a day past.
  const visible = items.filter((c) => daysUntil(c.date) >= -1);

  // Empty + not adding → a single slim "add" affordance so it isn't dead space.
  if (visible.length === 0 && !adding) {
    return (
      <div className="mb-4">
        <button
          onClick={() => setAdding(true)}
          className="text-xs px-3 py-1.5 rounded-lg hover:brightness-110"
          style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px dashed var(--border)" }}
        >
          ⏳ + Add a countdown
        </button>
      </div>
    );
  }

  return (
    <div
      className="mb-4 rounded-2xl px-3 py-2 flex items-center gap-2 flex-wrap"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <span className="text-xs uppercase tracking-wide pr-1" style={{ color: "var(--text-muted)" }}>⏳ Countdown</span>
      {visible.map((c) => {
        const d = daysUntil(c.date);
        const { text, color } = countdownLabel(d);
        return (
          <span
            key={c.id}
            className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1"
            style={{ background: "var(--surface-2)", border: `1px solid ${color}33` }}
            title={new Date(c.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          >
            <span className="text-sm font-medium truncate max-w-[160px]">{c.label}</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color }}>{text}</span>
            <button
              onClick={() => remove(c.id)}
              className="text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100"
              style={{ color: "var(--accent-red)" }}
              title="Remove"
            >✕</button>
          </span>
        );
      })}

      {adding ? (
        <span className="flex items-center gap-1">
          <input
            placeholder="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-32 rounded-lg px-2 py-1 text-xs"
            style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
            autoFocus
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg px-2 py-1 text-xs"
            style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
          />
          <button
            onClick={add}
            disabled={saving || !label.trim() || !date}
            className="text-xs px-2 py-1 rounded-lg disabled:opacity-40"
            style={{ background: "var(--accent-green)22", color: "var(--accent-green)", border: "1px solid var(--accent-green)" }}
          >Add</button>
          <button onClick={() => { setAdding(false); setLabel(""); setDate(""); }} className="text-xs" style={{ color: "var(--text-muted)" }}>✕</button>
        </span>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs px-2 py-1 rounded-lg opacity-60 hover:opacity-100"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px dashed var(--border)" }}
          title="Add a countdown"
        >+</button>
      )}
    </div>
  );
}
