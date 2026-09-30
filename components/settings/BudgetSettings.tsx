"use client";

import { useEffect, useState } from "react";
import { PanelIntro } from "@/components/settings/SettingsHelp";
import { formatDkk } from "@/lib/payday";
import { useCurrency } from "@/lib/dashboard-settings";

/**
 * Budget settings panel (#5) — set the **default monthly budget** so the Budget
 * hub + widget have a target from day one. Everything else (per-month overrides,
 * categories, plans) stays in the hub; this is the one value worth pre-setting.
 * Persists via `/api/budget` `setDefaultBudget`.
 */

const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

export default function BudgetSettings() {
  useCurrency();
  const [current, setCurrent] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/budget").then((r) => r.json()).then((d) => {
      setCurrent(typeof d.defaultBudget === "number" ? d.defaultBudget : 0);
    }).catch(() => {});
  }, []);

  async function save() {
    const amount = Number(value);
    if (!isFinite(amount) || amount < 0) { setStatus("Enter a number"); return; }
    setSaving(true); setStatus("");
    try {
      const res = await fetch("/api/budget", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setDefaultBudget", amount }),
      });
      const d = await res.json();
      if (res.ok) { setCurrent(d.defaultBudget ?? amount); setValue(""); setStatus("Saved ✓"); }
      else setStatus(d.error || "Save failed");
    } catch (e) { setStatus(String(e)); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <PanelIntro accent="var(--accent-green)">
        Set your <strong>default monthly budget</strong> — the amount you plan to spend in a typical month. The Budget hub
        uses it as the baseline for every month (you can override individual months later), and the dashboard widget shows
        how much you have left. Add categories and planned expenses in the Budget hub itself.
      </PanelIntro>

      {current !== null && current > 0 && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--accent-green)15", border: "1px solid var(--accent-green)55", color: "var(--accent-green)" }}>
          ✓ Current default budget: <strong>{formatDkk(current)}</strong> / month
        </div>
      )}

      <div>
        <label className="block text-sm mb-1">Default monthly budget</label>
        <input
          type="number" min={0} inputMode="decimal"
          placeholder={current ? String(current) : "e.g. 12000"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-40 rounded-lg px-2 py-1.5 text-sm"
          style={inputStyle}
        />
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>In your chosen display currency (change it in General → Currency).</p>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving || !value.trim()} className="text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-40"
          style={{ background: "var(--accent-green)22", color: "var(--accent-green)", border: "1px solid var(--accent-green)" }}>
          {saving ? "Saving…" : "Save"}
        </button>
        {status && <span className="text-xs" style={{ color: status.startsWith("Saved") ? "var(--accent-green)" : "var(--accent-red)" }}>{status}</span>}
      </div>
    </div>
  );
}
