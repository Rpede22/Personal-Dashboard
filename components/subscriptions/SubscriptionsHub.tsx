"use client";

import { useEffect, useMemo, useState } from "react";
import HubShell from "@/components/HubShell";
import { formatDkk } from "@/lib/payday";
import { useCurrency } from "@/lib/dashboard-settings";
import { CYCLES, cycleLabel, monthlyAmount, daysUntil, type Cycle, type Subscription } from "@/lib/subscriptions";

const ACCENT = "var(--accent-cyan)";

interface ApiPayload { subscriptions: Subscription[]; monthlyTotal: number; next: Subscription | null }

const emptyForm = { name: "", amount: "", cycle: "monthly" as Cycle, nextCharge: "", category: "" };

function chargeLabel(dateStr: string): { text: string; soon: boolean } {
  const d = daysUntil(dateStr);
  if (isNaN(d)) return { text: dateStr, soon: false };
  if (d < 0) return { text: "due", soon: true };
  if (d === 0) return { text: "today", soon: true };
  if (d === 1) return { text: "tomorrow", soon: true };
  if (d <= 7) return { text: `in ${d} days`, soon: true };
  return { text: `in ${d} days`, soon: false };
}

export default function SubscriptionsHub() {
  const currency = useCurrency(); // re-render money on currency change
  const [data, setData] = useState<ApiPayload | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/subscriptions");
      setData(await res.json());
    } catch { setData({ subscriptions: [], monthlyTotal: 0, next: null }); }
  }
  useEffect(() => { load(); }, []);

  function resetForm() { setForm(emptyForm); setEditingId(null); setError(""); }

  async function submit() {
    setError("");
    const amount = Number(form.amount);
    if (!form.name.trim()) return setError("Name is required.");
    if (!Number.isFinite(amount) || amount < 0) return setError("Amount must be a positive number.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.nextCharge)) return setError("Pick the next charge date.");
    setSaving(true);
    try {
      const body = {
        ...(editingId ? { id: editingId } : {}),
        name: form.name.trim(),
        amount,
        cycle: form.cycle,
        nextCharge: form.nextCharge,
        category: form.category.trim() || undefined,
      };
      const res = await fetch("/api/subscriptions", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.ok) { setData(d); resetForm(); }
      else setError(d.error || "Save failed");
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this subscription?")) return;
    const res = await fetch(`/api/subscriptions?id=${id}`, { method: "DELETE" });
    if (res.ok) setData(await res.json());
    if (editingId === id) resetForm();
  }

  function startEdit(s: Subscription) {
    setEditingId(s.id);
    setForm({ name: s.name, amount: String(s.amount), cycle: s.cycle, nextCharge: s.nextCharge, category: s.category ?? "" });
    setError("");
  }

  const subs = data?.subscriptions ?? [];
  const monthly = data?.monthlyTotal ?? 0;
  const yearly = monthly * 12;

  // Group by category for the list.
  const grouped = useMemo(() => {
    const map = new Map<string, Subscription[]>();
    for (const s of subs) {
      const key = s.category?.trim() || "Uncategorised";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [subs]);

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <HubShell title="Subscriptions" emoji="💳" color={ACCENT}>
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: `1px solid ${ACCENT}44` }}>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Per month</div>
          <div className="text-2xl font-bold" style={{ color: ACCENT }}>{formatDkk(monthly)}</div>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Per year</div>
          <div className="text-2xl font-bold" style={{ color: "var(--text)" }}>{formatDkk(yearly)}</div>
        </div>
        <div className="rounded-2xl p-4 col-span-2 sm:col-span-1" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Next charge</div>
          {data?.next ? (
            <div className="text-sm mt-1">
              <span className="font-semibold" style={{ color: "var(--text)" }}>{data.next.name}</span>
              <span style={{ color: "var(--text-muted)" }}> · {formatDkk(data.next.amount)} · {chargeLabel(data.next.nextCharge).text}</span>
            </div>
          ) : <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>—</div>}
        </div>
      </div>

      {/* Add / edit form */}
      <div className="rounded-2xl p-4 mb-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>{editingId ? "Edit subscription" : "Add a subscription"}</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input placeholder="Name (e.g. Netflix)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg px-2 py-1.5 text-sm lg:col-span-2" style={inputStyle} />
          <input type="number" min="0" step="0.01" placeholder={`Amount (${currency})`} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle} />
          <select value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value as Cycle })} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle}>
            {CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input type="date" value={form.nextCharge} onChange={(e) => setForm({ ...form, nextCharge: e.target.value })} className="rounded-lg px-2 py-1.5 text-sm" style={inputStyle} title="Next charge date" />
          <input placeholder="Category (optional)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-lg px-2 py-1.5 text-sm lg:col-span-2" style={inputStyle} />
        </div>
        {error && <p className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>{error}</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={submit} disabled={saving} className="text-sm px-4 py-2 rounded-lg font-medium" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>
            {saving ? "Saving…" : editingId ? "Save changes" : "+ Add subscription"}
          </button>
          {editingId && <button onClick={resetForm} className="text-sm px-3 py-2 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Cancel</button>}
        </div>
      </div>

      {/* List grouped by category */}
      {subs.length === 0 ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          No subscriptions yet — add one above to start tracking your recurring spend.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([cat, items]) => {
            const catMonthly = items.reduce((s, x) => s + monthlyAmount(x.amount, x.cycle), 0);
            return (
              <div key={cat} className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="px-4 py-2 flex items-baseline justify-between" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                  <span className="text-xs uppercase tracking-wide font-semibold" style={{ color: "var(--text-muted)" }}>{cat}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{formatDkk(catMonthly)}/mo</span>
                </div>
                <ul>
                  {items.map((s) => {
                    const cl = chargeLabel(s.nextCharge);
                    return (
                      <li key={s.id} className="px-4 py-3 flex items-center gap-3 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{s.name}</div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {formatDkk(s.amount)} · {cycleLabel(s.cycle)} · ≈ {formatDkk(monthlyAmount(s.amount, s.cycle))}/mo
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs" style={{ color: cl.soon ? "var(--accent-orange)" : "var(--text-muted)" }}>{s.nextCharge}</div>
                          <div className="text-[11px]" style={{ color: cl.soon ? "var(--accent-orange)" : "var(--text-muted)" }}>{cl.text}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => startEdit(s)} className="text-xs px-2 py-1 rounded" style={{ color: "var(--text-muted)" }} title="Edit">✎</button>
                          <button onClick={() => remove(s.id)} className="text-xs px-2 py-1 rounded" style={{ color: "var(--accent-red)" }} title="Delete">✕</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs mt-4 text-center" style={{ color: "var(--text-muted)" }}>
        Recurring spend is normalised to a monthly average — this feeds the Finance category (and the Budget hub, when it lands).
      </p>
    </HubShell>
  );
}
