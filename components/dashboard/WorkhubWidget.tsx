"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

/** Monday of the local ISO week for a Date, formatted YYYY-MM-DD. */
function mondayKey(d: Date): string {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const day = c.getDay(); // 0=Sun … 6=Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  c.setDate(c.getDate() + mondayOffset);
  return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`;
}

/** Days until the next occurrence of `dayOfMonth` (1..31), inclusive of today.
 *  If the target day doesn't exist in the current month (e.g. 31 in Feb) we
 *  clamp to the last day of that month before deciding whether to roll over. */
function daysUntilPayday(dayOfMonth: number, now: Date = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysInThisMonth = new Date(y, m + 1, 0).getDate();
  const clampedThis = Math.min(dayOfMonth, daysInThisMonth);
  const today = new Date(y, m, now.getDate());
  today.setHours(0, 0, 0, 0);
  const thisMonthTarget = new Date(y, m, clampedThis);
  thisMonthTarget.setHours(0, 0, 0, 0);
  if (thisMonthTarget >= today) {
    return Math.round((thisMonthTarget.getTime() - today.getTime()) / 86400000);
  }
  const daysInNextMonth = new Date(y, m + 2, 0).getDate();
  const clampedNext = Math.min(dayOfMonth, daysInNextMonth);
  const nextMonthTarget = new Date(y, m + 1, clampedNext);
  nextMonthTarget.setHours(0, 0, 0, 0);
  return Math.round((nextMonthTarget.getTime() - today.getTime()) / 86400000);
}

interface WorkConfig {
  payday: number | null;
  hoursByWeek: Record<string, number>;
}

export default function WorkhubWidget() {
  const [config, setConfig] = useState<WorkConfig | null>(null);
  const [weekKey, setWeekKey] = useState(mondayKey(new Date()));
  const [hoursDraft, setHoursDraft] = useState<string>("");
  const [paydayDraft, setPaydayDraft] = useState<string>("");
  const [editingHours, setEditingHours] = useState(false);
  const [editingPayday, setEditingPayday] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWeekKey(mondayKey(new Date()));
    fetch("/api/work").then((r) => r.json()).then((d: WorkConfig) => {
      setConfig(d);
      setPaydayDraft(d.payday != null ? String(d.payday) : "");
    }).catch(() => setConfig({ payday: null, hoursByWeek: {} }));
  }, []);

  useEffect(() => {
    if (config) {
      const h = config.hoursByWeek[weekKey];
      setHoursDraft(h != null ? String(h) : "");
    }
  }, [config, weekKey]);

  async function saveHours(next: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: weekKey, hours: next === "" ? null : next }),
      });
      if (res.ok) setConfig(await res.json());
    } finally {
      setSaving(false);
      setEditingHours(false);
    }
  }

  async function savePayday(next: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payday: next === "" ? null : next }),
      });
      if (res.ok) setConfig(await res.json());
    } finally {
      setSaving(false);
      setEditingPayday(false);
    }
  }

  const hoursThisWeek = config?.hoursByWeek[weekKey];
  const payday = config?.payday ?? null;
  const paydayDays = payday != null ? daysUntilPayday(payday) : null;

  return (
    <Card accentColor="var(--accent-cyan)">
      <CardHeader
        icon="💼"
        title="Work Hours"
        subtitle="Daily reminder"
        accentColor="var(--accent-cyan)"
        showArrow={false}
      />

      {/* Stats row: this-week hours + payday countdown */}
      <div className="flex flex-wrap gap-2 mb-3 justify-center">
        {/* This week hours pill */}
        {editingHours ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="number"
              step="0.5"
              min="0"
              max="168"
              value={hoursDraft}
              onChange={(e) => setHoursDraft(e.target.value)}
              onBlur={() => saveHours(hoursDraft)}
              onKeyDown={(e) => { if (e.key === "Enter") saveHours(hoursDraft); if (e.key === "Escape") setEditingHours(false); }}
              autoFocus
              disabled={saving}
              className="text-xs w-16 px-2 py-1 rounded-md"
              style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--accent-cyan)" }}
            />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>h this week</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setEditingHours(true); }}
            className="text-xs px-2 py-1 rounded-md"
            style={{
              background: "var(--surface-2)",
              color: hoursThisWeek != null ? "var(--accent-cyan)" : "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
            title="Click to log hours worked this week"
          >
            {hoursThisWeek != null ? `${hoursThisWeek}h this week` : "+ log hours"}
          </button>
        )}

        {/* Payday countdown pill */}
        {editingPayday ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Payday day</span>
            <input
              type="number"
              min="1"
              max="31"
              value={paydayDraft}
              onChange={(e) => setPaydayDraft(e.target.value)}
              onBlur={() => savePayday(paydayDraft)}
              onKeyDown={(e) => { if (e.key === "Enter") savePayday(paydayDraft); if (e.key === "Escape") setEditingPayday(false); }}
              autoFocus
              disabled={saving}
              className="text-xs w-14 px-2 py-1 rounded-md"
              style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--accent-cyan)" }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setEditingPayday(true); }}
            className="text-xs px-2 py-1 rounded-md"
            style={{
              background: "var(--surface-2)",
              color: payday != null ? "var(--accent-cyan)" : "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
            title="Click to set payday (day of month)"
          >
            {paydayDays != null
              ? paydayDays === 0 ? "Payday today 🎉" : `Payday in ${paydayDays}d`
              : "+ set payday"}
          </button>
        )}
      </div>

      <div className="flex justify-around items-end w-full">
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
            Remember to log your hours
          </p>
          <a
            href="https://profil.cand.dk/work/register"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: "var(--accent-cyan)22",
              color: "var(--accent-cyan)",
              border: "1px solid var(--accent-cyan)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            Register hours →
          </a>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
            View your payslips
          </p>
          <a
            href="https://intect.app/selfservice/payslip"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: "var(--accent-cyan)22",
              color: "var(--accent-cyan)",
              border: "1px solid var(--accent-cyan)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            View payslips →
          </a>
        </div>
      </div>
    </Card>
  );
}
