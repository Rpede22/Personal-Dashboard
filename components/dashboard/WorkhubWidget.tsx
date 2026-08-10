"use client";

import { useEffect, useMemo, useState } from "react";
import Card, { CardHeader } from "@/components/Card";
import {
  type Payday,
  currentPayTerm,
  dateKey,
  daysUntilPayday,
  previousPayTerm,
  sumHoursInTerm,
} from "@/lib/payday";

interface WorkSession { date: string; hours: number; note?: string }
interface WorkConfig {
  payday: Payday;
  hoursByWeek: Record<string, number>;
  sessions: WorkSession[];
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "1h 30m" / "45m" / "2h" — from decimal hours. Same shape as the hub's
 *  helper so the number reads identically everywhere. */
function formatHoursMinutes(decimalHours: number): string {
  const totalMin = Math.round(decimalHours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function WorkhubWidget() {
  const [config, setConfig] = useState<WorkConfig | null>(null);

  useEffect(() => {
    fetch("/api/work").then((r) => r.json()).then((d: WorkConfig) => {
      setConfig({ ...d, sessions: d.sessions ?? [] });
    }).catch(() => setConfig({ payday: null, hoursByWeek: {}, sessions: [] }));
  }, []);

  const now = useMemo(() => new Date(), [config]);
  const payday = config?.payday ?? null;
  const term = payday != null ? currentPayTerm(payday, now) : null;
  const prevTerm = payday != null ? previousPayTerm(payday, now) : null;
  const daysLeft = payday != null ? daysUntilPayday(payday, now) : null;
  const sessions = config?.sessions ?? [];
  const termHours = term ? sumHoursInTerm(sessions, term) : 0;
  const prevTermHours = prevTerm ? sumHoursInTerm(sessions, prevTerm) : 0;

  // Last few sessions, newest first. Same "recent activity" pattern as the
  // running widget's last-3-runs strip.
  const recent = useMemo(() => {
    return [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  }, [sessions]);

  const termLabel = term
    ? `${formatShortDate(dateKey(term.start))} – ${formatShortDate(dateKey(term.end))}`
    : "no payday set";

  return (
    <Card accentColor="var(--accent-cyan)">
      <CardHeader icon="💼" title="Work Hours" subtitle={termLabel} accentColor="var(--accent-cyan)" />

        <div className="flex gap-3 mb-3">
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "var(--surface-2)" }}>
            <div className="text-2xl font-bold" style={{ color: "var(--accent-cyan)" }}>
              {formatHoursMinutes(termHours)}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>this pay-term</div>
          </div>
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "var(--surface-2)" }}>
            <div className="text-2xl font-bold" style={{ color: "var(--text)" }}>
              {daysLeft == null ? "—" : daysLeft === 0 ? "Today 🎉" : `${daysLeft}d`}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>to payday</div>
          </div>
        </div>

        {/* Last pay-term keeps showing after payday so you can still eyeball
            the payslip total for a few days without leaving the dashboard. */}
        {prevTerm && (
          <div className="text-xs mb-2 flex items-baseline justify-between" style={{ color: "var(--text-muted)" }}>
            <span>Last pay-term</span>
            <span className="tabular-nums font-semibold" style={{ color: "var(--text)" }}>{formatHoursMinutes(prevTermHours)}</span>
          </div>
        )}

        {/* Recent entries — mirrors RunningWidget's "recent runs" strip. */}
        {recent.length > 0 ? (
          <div>
            <p className="text-xs mb-1.5 font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Recent entries
            </p>
            <div className="space-y-1">
              {recent.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg px-2.5 py-1.5" style={{ background: "var(--surface-2)" }}>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{formatShortDate(s.date)}</span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--accent-cyan)" }}>{formatHoursMinutes(s.hours)}</span>
                  <span className="text-xs truncate max-w-[40%]" style={{ color: "var(--text-muted)" }}>{s.note ?? ""}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No sessions logged yet — open the hub to add one.</p>
        )}
    </Card>
  );
}
