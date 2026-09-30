"use client";

import { useEffect, useState } from "react";
import { PanelIntro } from "@/components/settings/SettingsHelp";

/**
 * Countdowns settings panel (#5) — add pinned dates (a trip, race day, a
 * birthday) that show a live day-countdown in the top-of-dashboard strip.
 * Same `/api/countdowns` endpoints as the strip's inline add, so they stay in
 * sync. The Countdown strip must be enabled in General → sections to be visible.
 */

interface Countdown { id: string; label: string; date: string }
const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

export default function CountdownsSettings() {
  const [items, setItems] = useState<Countdown[]>([]);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");

  function load() {
    fetch("/api/countdowns").then((r) => r.json()).then((d) => setItems(d.countdowns ?? [])).catch(() => {});
  }
  useEffect(load, []);

  async function add() {
    if (!label.trim() || !date) { setStatus("Add a label and a date"); return; }
    setStatus("");
    const res = await fetch("/api/countdowns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: label.trim(), date }) });
    if (res.ok) { setLabel(""); setDate(""); load(); } else setStatus("Couldn't add");
  }
  async function remove(id: string) {
    await fetch(`/api/countdowns?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <PanelIntro accent="var(--accent-cyan)">
        Pin important dates — a holiday, race day, an exam — and see a live <strong>“in N days”</strong> countdown at the
        top of the dashboard. Events drop off automatically the day after they pass.
      </PanelIntro>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[10rem]">
          <label className="block text-sm mb-1">Label</label>
          <input placeholder="e.g. Trip to Rome" value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="block text-sm mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
        </div>
        <button onClick={add} className="text-sm px-4 py-2 rounded-lg font-medium" style={{ background: "var(--accent-cyan)22", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }}>Add</button>
      </div>
      {status && <p className="text-xs" style={{ color: "var(--accent-red)" }}>{status}</p>}

      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
              <span className="font-medium">{c.label}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{c.date}</span>
              <button onClick={() => remove(c.id)} className="ml-auto text-xs" style={{ color: "var(--accent-red)" }} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Tip: enable the <strong>Countdown</strong> strip in General → Top-of-dashboard sections to see these.
      </p>
    </div>
  );
}
