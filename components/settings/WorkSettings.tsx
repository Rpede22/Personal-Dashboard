"use client";

import { useEffect, useState } from "react";
import { PanelIntro } from "@/components/settings/SettingsHelp";
import { formatDkk } from "@/lib/payday";
import { useCurrency } from "@/lib/dashboard-settings";

/**
 * Work settings panel for the unified settings modal. Owns the de-hardcoded
 * bits: enable/disable hour tracking (+ the monthly-hours fallback used when
 * off), the external register/payslip links, and **multiple income sources**
 * (#8 — job + SU etc.). Payday + pay-term editors stay in the Work hub itself.
 */

interface FixedIncome { id: string; label: string; amountPerMonth: number; taxed: boolean }
interface BreakdownItem { label: string; taxed: boolean; net: number }
interface WorkCfg {
  enabled: boolean;
  monthlyHoursFallback: number;
  registerUrl: string;
  payslipUrl: string;
  multipleIncomes: boolean;
  incomes: FixedIncome[];
  monthlyNetIncome: number;
  incomeBreakdown: { jobNet: number; fixed: BreakdownItem[] };
}

/** Explicit two-button Yes / No control (clearer than a single label-flipping
 *  toggle — round-4 feedback). */
function YesNo({ value, onChange, accent = "var(--accent-green)", disabled }: { value: boolean; onChange: (v: boolean) => void; accent?: string; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--border)" }}>
      {([["Yes", true], ["No", false]] as const).map(([label, val]) => {
        const on = value === val;
        return (
          <button key={label} disabled={disabled} onClick={() => { if (!on) onChange(val); }} className="text-xs px-4 py-1.5"
            style={{ background: on ? `${accent}22` : "var(--surface-2)", color: on ? accent : "var(--text-muted)", fontWeight: on ? 600 : 400 }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function fromResponse(d: Record<string, unknown>): WorkCfg {
  return {
    enabled: d.enabled !== false,
    monthlyHoursFallback: (d.monthlyHoursFallback as number) ?? 160,
    registerUrl: (d.registerUrl as string) ?? "",
    payslipUrl: (d.payslipUrl as string) ?? "",
    multipleIncomes: Boolean(d.multipleIncomes),
    incomes: Array.isArray(d.incomes) ? (d.incomes as FixedIncome[]) : [],
    monthlyNetIncome: (d.monthlyNetIncome as number) ?? 0,
    incomeBreakdown: (d.incomeBreakdown as WorkCfg["incomeBreakdown"]) ?? { jobNet: 0, fixed: [] },
  };
}

export default function WorkSettings() {
  useCurrency();
  const [cfg, setCfg] = useState<WorkCfg | null>(null);
  const [saving, setSaving] = useState(false);
  const [hoursDraft, setHoursDraft] = useState("");
  const [registerDraft, setRegisterDraft] = useState("");
  const [payslipDraft, setPayslipDraft] = useState("");

  useEffect(() => {
    fetch("/api/work").then((r) => r.json()).then((d) => {
      const c = fromResponse(d);
      setCfg(c);
      setHoursDraft(String(c.monthlyHoursFallback));
      setRegisterDraft(c.registerUrl);
      setPayslipDraft(c.payslipUrl);
    }).catch(() => {});
  }, []);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) setCfg(fromResponse(await res.json()));
    } finally { setSaving(false); }
  }

  function saveIncomes(next: FixedIncome[]) {
    // optimistic — reflect the edit immediately, then persist + refresh totals
    setCfg((c) => (c ? { ...c, incomes: next } : c));
    patch({ incomes: next });
  }

  if (!cfg) return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>;

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <div className="space-y-5">
      <PanelIntro accent="var(--accent-cyan)">
        Track your work hours and pay. Turn on hour tracking to log sessions and see pay-term totals, or turn it off and
        just set a flat monthly-hours figure. You can also set links to your time-register and payslip sites. Payday and
        pay-term dates are edited in the Work hub itself.
      </PanelIntro>
      <section>
        <div className="flex items-start justify-between gap-4 py-2">
          <div>
            <div className="text-sm font-medium">Hour tracking</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Off = other views assume a flat monthly figure instead of logged sessions. For fixed-salary work.
            </div>
          </div>
          <YesNo value={cfg.enabled} onChange={(v) => patch({ enabled: v })} disabled={saving} />
        </div>

        {!cfg.enabled && (
          <div className="flex items-center gap-2 py-2">
            <label className="text-sm">Assumed hours / month</label>
            <input
              type="number" min="0" max="744"
              value={hoursDraft}
              onChange={(e) => setHoursDraft(e.target.value)}
              onBlur={() => { const n = Number(hoursDraft); if (Number.isFinite(n) && n >= 0 && n <= 744) patch({ monthlyHoursFallback: n }); }}
              className="w-20 rounded-lg px-2 py-1 text-sm text-center"
              style={inputStyle}
            />
          </div>
        )}
      </section>

      {/* ── Income sources (#8) ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-start justify-between gap-4 py-2">
          <div>
            <div className="text-sm font-medium">Do you have more than one income?</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Add fixed monthly incomes on top of your hourly job — e.g. SU. The Budget hub&apos;s &ldquo;Use Work income&rdquo; then pulls the combined total.
            </div>
          </div>
          <YesNo value={cfg.multipleIncomes} onChange={(v) => patch({ multipleIncomes: v })} accent="var(--accent-cyan)" disabled={saving} />
        </div>

        {cfg.multipleIncomes && (
          <div className="space-y-2 pt-1">
            {cfg.incomes.map((inc, i) => (
              <div key={inc.id} className="flex flex-wrap items-center gap-2">
                <input
                  placeholder="Label (e.g. SU)"
                  value={inc.label}
                  onChange={(e) => saveIncomes(cfg.incomes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  className="flex-1 min-w-[7rem] rounded-lg px-2 py-1.5 text-sm"
                  style={inputStyle}
                />
                <input
                  type="number" min="0" placeholder="kr/month"
                  value={inc.amountPerMonth || ""}
                  onChange={(e) => saveIncomes(cfg.incomes.map((x, j) => (j === i ? { ...x, amountPerMonth: Number(e.target.value) || 0 } : x)))}
                  className="w-28 rounded-lg px-2 py-1.5 text-sm text-right"
                  style={inputStyle}
                />
                <button
                  onClick={() => saveIncomes(cfg.incomes.map((x, j) => (j === i ? { ...x, taxed: !x.taxed } : x)))}
                  className="text-xs px-2 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: "var(--surface-2)", color: inc.taxed ? "var(--accent-orange)" : "var(--accent-green)", border: "1px solid var(--border)" }}
                  title={inc.taxed ? "Gross — taxed like job pay" : "Net — paid after tax (e.g. SU)"}
                >{inc.taxed ? "gross (taxed)" : "net (SU-style)"}</button>
                <button
                  onClick={() => saveIncomes(cfg.incomes.filter((_, j) => j !== i))}
                  className="text-xs px-2 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: "var(--surface-2)", color: "var(--accent-red)", border: "1px solid var(--border)" }}
                  title="Remove"
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => saveIncomes([...cfg.incomes, { id: Math.random().toString(36).slice(2, 10), label: "", amountPerMonth: 0, taxed: false }])}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px dashed var(--border)" }}
            >+ Add income source</button>

            {/* Breakdown → "Job Xkr + SU Ykr = Zkr net" */}
            {(cfg.incomeBreakdown.jobNet > 0 || cfg.incomeBreakdown.fixed.length > 0) && (
              <div className="rounded-lg px-3 py-2 mt-1 text-xs" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                <span>Job {formatDkk(Math.round(cfg.incomeBreakdown.jobNet))}</span>
                {cfg.incomeBreakdown.fixed.map((f, i) => (
                  <span key={i}> + {f.label || "Income"} {formatDkk(Math.round(f.net))}</span>
                ))}
                <span style={{ color: "var(--accent-green)" }}> = {formatDkk(Math.round(cfg.monthlyNetIncome))} net / month</span>
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>External links</h3>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Leave blank to hide the button in the Work hub.</p>
        <label className="block text-sm mb-1">Register hours URL</label>
        <input
          type="url" placeholder="https://…"
          value={registerDraft}
          onChange={(e) => setRegisterDraft(e.target.value)}
          onBlur={() => { if (registerDraft.trim() === "" || /^https?:\/\//i.test(registerDraft.trim())) patch({ registerUrl: registerDraft.trim() }); }}
          className="w-full rounded-lg px-2 py-1.5 text-sm mb-3"
          style={inputStyle}
        />
        <label className="block text-sm mb-1">Payslip URL</label>
        <input
          type="url" placeholder="https://…"
          value={payslipDraft}
          onChange={(e) => setPayslipDraft(e.target.value)}
          onBlur={() => { if (payslipDraft.trim() === "" || /^https?:\/\//i.test(payslipDraft.trim())) patch({ payslipUrl: payslipDraft.trim() }); }}
          className="w-full rounded-lg px-2 py-1.5 text-sm"
          style={inputStyle}
        />
      </section>
    </div>
  );
}
