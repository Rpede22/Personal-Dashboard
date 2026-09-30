"use client";

import { useEffect, useState } from "react";
import { PanelIntro } from "@/components/settings/SettingsHelp";
import { formatDkk } from "@/lib/payday";
import { useCurrency } from "@/lib/dashboard-settings";
import { CYCLES, cycleLabel, type Cycle } from "@/lib/subscriptions";

/**
 * Subscriptions settings panel (#5) — seed recurring expenses (Netflix, gym, …)
 * so the Subscriptions widget/hub + the Budget "sync subscriptions" line have
 * data from the start. Shares the `/api/subscriptions` endpoints with the hub.
 */

interface Sub { id: string; name: string; amount: number; cycle: Cycle; nextCharge: string; category?: string }
const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

export default function SubscriptionsSettings() {
  useCurrency();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [nextCharge, setNextCharge] = useState("");
  const [status, setStatus] = useState("");

  function load() {
    fetch("/api/subscriptions").then((r) => r.json()).then((d) => {
      setSubs(d.subscriptions ?? []);
      setMonthlyTotal(d.monthlyTotal ?? 0);
    }).catch(() => {});
  }
  useEffect(load, []);

  async function add() {
    if (!name.trim() || !(Number(amount) > 0) || !nextCharge) { setStatus("Fill in name, amount and next charge date"); return; }
    setStatus("");
    const res = await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), amount: Number(amount), cycle, nextCharge }) });
    if (res.ok) { setName(""); setAmount(""); setNextCharge(""); load(); } else setStatus("Couldn't add");
  }
  async function remove(id: string) {
    await fetch(`/api/subscriptions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <PanelIntro accent="var(--accent-cyan)">
        Track recurring bills — streaming, gym, insurance — and see your monthly/yearly total. It also feeds the Budget hub
        (one click to add the total as a budget line). Add a few here; manage them fully in the Subscriptions hub.
      </PanelIntro>

      {subs.length > 0 && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
          {subs.length} subscription{subs.length === 1 ? "" : "s"} · <strong style={{ color: "var(--text)" }}>{formatDkk(Math.round(monthlyTotal))}</strong>/month
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <input placeholder="Name (e.g. Netflix)" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
        <input type="number" min="0" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
        <select value={cycle} onChange={(e) => setCycle(e.target.value as Cycle)} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle}>
          {CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input type="date" value={nextCharge} onChange={(e) => setNextCharge(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle} title="Next charge date" />
      </div>
      <div className="flex items-center gap-3">
        <button onClick={add} className="text-sm px-4 py-2 rounded-lg font-medium" style={{ background: "var(--accent-cyan)22", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }}>+ Add subscription</button>
        {status && <span className="text-xs" style={{ color: "var(--accent-red)" }}>{status}</span>}
      </div>

      {subs.length > 0 && (
        <div className="space-y-1.5">
          {subs.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
              <span className="font-medium flex-1 truncate">{s.name}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{formatDkk(s.amount)} · {cycleLabel(s.cycle)}</span>
              <button onClick={() => remove(s.id)} className="text-xs" style={{ color: "var(--accent-red)" }} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
