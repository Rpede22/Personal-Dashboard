"use client";

import { useEffect, useMemo, useState } from "react";
import HubShell from "@/components/HubShell";
import {
  type Payday,
  computeEarnings,
  currentPayTerm,
  dateKey,
  daysUntilPayday,
  formatDkk,
  formatPaydayLabel,
  nextPayday,
  previousPayTerm,
  resolvePayday,
  sumEarningsInTerm,
  sumHoursInTerm,
} from "@/lib/payday";

interface WorkSession { date: string; hours: number; hourlyRate?: number; note?: string }
interface WorkConfig {
  payday: Payday;
  hoursByWeek: Record<string, number>;
  sessions: WorkSession[];
}

type Tab = "overview" | "entries";

function todayKey(): string { return dateKey(new Date()); }

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** "1h 30m" — from a decimal-hour value. Whole hours drop the minute half
 *  ("2h"), fractional-only shifts drop the hour half ("45m"). */
function formatHoursMinutes(decimalHours: number): string {
  const totalMin = Math.round(decimalHours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function WorkHub() {
  const [config, setConfig] = useState<WorkConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  const [addDate, setAddDate] = useState<string>(todayKey());
  // Split into hours + minutes so short shifts don't force a fiddly `0.75`
  // decimal — combined into a fractional hour before persisting to keep the
  // storage shape (Float) unchanged.
  const [addHrs, setAddHrs] = useState<string>("");
  const [addMins, setAddMins] = useState<string>("");
  const [addRate, setAddRate] = useState<string>("");
  const [addNote, setAddNote] = useState<string>("");

  const [editingPayday, setEditingPayday] = useState(false);
  const [paydayDraft, setPaydayDraft] = useState<string>("");

  useEffect(() => {
    fetch("/api/work").then((r) => r.json()).then((d: WorkConfig) => {
      setConfig({ ...d, sessions: d.sessions ?? [] });
      setPaydayDraft(d.payday == null ? "" : d.payday === "last-weekday" ? "last-weekday" : String(d.payday));
    }).catch(() => setConfig({ payday: null, hoursByWeek: {}, sessions: [] }));
  }, []);

  const now = useMemo(() => new Date(), [config]);
  const payday = config?.payday ?? null;
  const term = payday != null ? currentPayTerm(payday, now) : null;
  const prevTerm = payday != null ? previousPayTerm(payday, now) : null;
  const daysLeft = payday != null ? daysUntilPayday(payday, now) : null;
  const next = payday != null ? nextPayday(payday, now) : null;

  const sessions = config?.sessions ?? [];
  const termHours = term ? sumHoursInTerm(sessions, term) : 0;
  const prevTermHours = prevTerm ? sumHoursInTerm(sessions, prevTerm) : 0;

  // Most recent session's rate is the sensible default when logging a new one
  // — a raise still needs one manual override, but the common case is nothing
  // changed since last shift. Empty when no rate has ever been logged.
  const lastKnownRate = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
    for (const s of sorted) if (typeof s.hourlyRate === "number") return s.hourlyRate;
    return null;
  }, [sessions]);

  const termGross = term ? sumEarningsInTerm(sessions, term) : 0;
  const prevTermGross = prevTerm ? sumEarningsInTerm(sessions, prevTerm) : 0;
  const termEarnings = computeEarnings(termGross);
  const prevTermEarnings = computeEarnings(prevTermGross);

  // Preview of the pay-term that STARTS after `next`. Useful during the first
  // couple of days after payday, when sessions logged today already count
  // toward the upcoming payslip.
  const nextTermPreview = useMemo(() => {
    if (!payday || !next) return null;
    const start = new Date(next);
    start.setDate(start.getDate() + 1);
    const end = resolvePayday(payday, next.getFullYear(), next.getMonth() + 1);
    if (!end) return null;
    return { start, end };
  }, [payday, next]);
  const nextTermPreviewHours = nextTermPreview ? sumHoursInTerm(sessions, nextTermPreview) : 0;

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/work", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) setConfig(await res.json());
    } finally { setSaving(false); }
  }

  async function addSession() {
    const hrs = addHrs === "" ? 0 : Number(addHrs);
    const mins = addMins === "" ? 0 : Number(addMins);
    if (!addDate || !Number.isFinite(hrs) || !Number.isFinite(mins)) return;
    if (mins < 0 || mins >= 60) return;
    const total = hrs + mins / 60;
    if (total <= 0) return;
    // Rate: use the input if set, else fall back to the most recent known rate
    // so the user doesn't have to retype it every shift.
    const rateStr = addRate.trim() !== "" ? addRate : (lastKnownRate != null ? String(lastKnownRate) : "");
    const rateNum = rateStr === "" ? undefined : Number(rateStr);
    await post({ session: { date: addDate, hours: total, hourlyRate: rateNum, note: addNote || undefined } });
    setAddHrs(""); setAddMins(""); setAddNote(""); setAddDate(todayKey());
    // Keep addRate as-is so the next log defaults to the same value without retyping.
  }

  async function deleteSession(realIdx: number) {
    if (realIdx < 0) return;
    await post({ deleteSessionIndex: realIdx });
  }

  async function savePayday(draft: string) {
    const val: Payday = draft === "" ? null : draft === "last-weekday" ? "last-weekday" : Number(draft);
    await post({ payday: val });
    setEditingPayday(false);
  }

  // Sessions in the current pay-term (indexed pointers back to `sessions` so
  // delete-by-index still works after sorting).
  const currentTermSessionsWithIdx = useMemo(() => {
    if (!term) return [];
    const s = dateKey(term.start), e = dateKey(term.end);
    const out: Array<{ session: WorkSession; realIdx: number }> = [];
    sessions.forEach((sess, i) => { if (sess.date >= s && sess.date <= e) out.push({ session: sess, realIdx: i }); });
    out.sort((a, b) => b.session.date.localeCompare(a.session.date));
    return out;
  }, [sessions, term]);

  const allSessionsWithIdx = useMemo(() => {
    const withIdx = sessions.map((sess, i) => ({ session: sess, realIdx: i }));
    withIdx.sort((a, b) => b.session.date.localeCompare(a.session.date));
    return withIdx;
  }, [sessions]);

  const totalAll = sessions.reduce((s, x) => s + x.hours, 0);
  const grossAll = sessions.reduce((s, x) => s + (typeof x.hourlyRate === "number" ? x.hours * x.hourlyRate : 0), 0);

  const termLabel = term ? `${formatShortDate(dateKey(term.start))} → ${formatShortDate(dateKey(term.end))}` : "no payday set";
  const prevTermLabel = prevTerm ? `${formatShortDate(dateKey(prevTerm.start))} → ${formatShortDate(dateKey(prevTerm.end))}` : null;

  return (
    <HubShell
      title="Work"
      emoji="💼"
      color="var(--accent-cyan)"
      tabs={
        <div className="flex gap-2">
          {(["overview", "entries"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium capitalize"
              style={{
                background: tab === t ? "var(--accent-cyan)22" : "var(--surface)",
                color: tab === t ? "var(--accent-cyan)" : "var(--text-muted)",
                border: `1px solid ${tab === t ? "var(--accent-cyan)" : "var(--border)"}`,
              }}
            >{t}</button>
          ))}
        </div>
      }
    >
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Pay-term summary */}
          <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex flex-wrap items-baseline justify-between mb-2 gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Current pay-term</div>
                <div className="text-sm">{termLabel}</div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayday(true)}
                className="text-xs px-2 py-1 rounded-md"
                style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                title={`Payday: ${formatPaydayLabel(payday)}`}
              >
                {daysLeft == null ? "Set payday" : daysLeft === 0 ? "Payday today 🎉" : `Payday in ${daysLeft}d`}
              </button>
            </div>
            <div className="text-3xl font-bold" style={{ color: "var(--accent-cyan)" }}>
              {formatHoursMinutes(termHours)}
            </div>

            {termGross > 0 && (
              <EarningsBreakdown label="This term" e={termEarnings} accent="var(--accent-cyan)" />
            )}

            {editingPayday && (
              <div
                className="mt-3 flex items-center gap-2 p-2 rounded-lg"
                style={{ background: "var(--surface-2)", border: "1px solid var(--accent-cyan)" }}
              >
                <select
                  value={paydayDraft === "last-weekday" ? "last-weekday" : paydayDraft === "" ? "" : "day"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "last-weekday") setPaydayDraft("last-weekday");
                    else if (v === "") setPaydayDraft("");
                    else setPaydayDraft(paydayDraft && paydayDraft !== "last-weekday" ? paydayDraft : "23");
                  }}
                  className="text-sm px-2 py-1 rounded"
                  style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
                >
                  <option value="">off</option>
                  <option value="day">day of month</option>
                  <option value="last-weekday">last weekday</option>
                </select>
                {paydayDraft !== "last-weekday" && paydayDraft !== "" && (
                  <input
                    type="number" min="1" max="31"
                    value={paydayDraft}
                    onChange={(e) => setPaydayDraft(e.target.value)}
                    className="text-sm w-16 px-2 py-1 rounded"
                    style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
                  />
                )}
                <button onClick={() => savePayday(paydayDraft)} disabled={saving} className="text-sm px-2 py-1 rounded"
                        style={{ background: "var(--accent-cyan)22", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }}>Save</button>
                <button onClick={() => setEditingPayday(false)} className="text-xs" style={{ color: "var(--text-muted)" }}>Cancel</button>
              </div>
            )}
          </div>

          {/* Previous pay-term — always visible when one exists, so the payslip
              stays checkable for a while after the 23rd. */}
          {prevTerm && (
            <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Last pay-term</div>
              <div className="text-sm mb-1">{prevTermLabel}</div>
              <div className="text-2xl font-bold" style={{ color: "var(--text)" }}>
                {formatHoursMinutes(prevTermHours)}
              </div>
              {prevTermGross > 0 && (
                <EarningsBreakdown label="Last payslip" e={prevTermEarnings} accent="var(--text)" />
              )}
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Reflected on your most recent payslip.</div>
            </div>
          )}

          {nextTermPreview && nextTermPreviewHours > 0 && (
            <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Next pay-term (already logged)</div>
              <div className="text-sm mb-1">{formatShortDate(dateKey(nextTermPreview.start))} → {formatShortDate(dateKey(nextTermPreview.end))}</div>
              <div className="text-xl font-bold" style={{ color: "var(--text-muted)" }}>
                {formatHoursMinutes(nextTermPreviewHours)}
              </div>
            </div>
          )}

          {/* Log a session */}
          <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Log a session</div>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)}
                className="text-sm px-2 py-1.5 rounded-md"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
              <div className="flex items-center gap-1">
                <input
                  type="number" min="0" max="24" placeholder="h"
                  value={addHrs} onChange={(e) => setAddHrs(e.target.value)}
                  className="text-sm w-14 px-2 py-1.5 rounded-md"
                  style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>h</span>
                <input
                  type="number" min="0" max="59" placeholder="m"
                  value={addMins} onChange={(e) => setAddMins(e.target.value)}
                  className="text-sm w-14 px-2 py-1.5 rounded-md"
                  style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>m</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number" min="0" max="10000" step="0.01"
                  placeholder={lastKnownRate != null ? String(lastKnownRate) : "rate"}
                  value={addRate} onChange={(e) => setAddRate(e.target.value)}
                  className="text-sm w-20 px-2 py-1.5 rounded-md"
                  style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                  title="Hourly rate in kr — defaults to last-used"
                />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>kr/h</span>
              </div>
              <input
                type="text" placeholder="note (optional)"
                value={addNote} onChange={(e) => setAddNote(e.target.value)}
                className="text-sm flex-1 min-w-[140px] px-2 py-1.5 rounded-md"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
              <button
                onClick={addSession} disabled={saving || (!addHrs && !addMins)}
                className="text-sm px-3 py-1.5 rounded-md"
                style={{ background: "var(--accent-cyan)22", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }}
              >Add</button>
            </div>
          </div>

          {/* Current-term sessions */}
          <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
              Sessions this term · {currentTermSessionsWithIdx.length}
            </div>
            {currentTermSessionsWithIdx.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>No hours logged yet.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {currentTermSessionsWithIdx.map(({ session, realIdx }) => (
                  <li key={realIdx} className="flex items-center gap-3 rounded-md px-2 py-1" style={{ background: "var(--surface-2)" }}>
                    <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{formatShortDate(session.date)}</span>
                    <span className="tabular-nums font-semibold" style={{ color: "var(--accent-cyan)" }}>{formatHoursMinutes(session.hours)}</span>
                    {typeof session.hourlyRate === "number" && (
                      <span className="tabular-nums text-xs" style={{ color: "var(--text-muted)" }}>
                        @ {session.hourlyRate} kr/h · {formatDkk(session.hours * session.hourlyRate)}
                      </span>
                    )}
                    {session.note && <span className="truncate" style={{ color: "var(--text-muted)" }}>· {session.note}</span>}
                    <button onClick={() => deleteSession(realIdx)} disabled={saving} className="ml-auto text-xs" style={{ color: "var(--accent-red)" }}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            <a href="https://profil.cand.dk/work/register" target="_blank" rel="noopener noreferrer"
               className="text-sm font-semibold px-3 py-1.5 rounded-lg"
               style={{ background: "var(--accent-cyan)22", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }}>
              Register hours →
            </a>
            <a href="https://intect.app/selfservice/payslip" target="_blank" rel="noopener noreferrer"
               className="text-sm font-semibold px-3 py-1.5 rounded-lg"
               style={{ background: "var(--accent-cyan)22", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }}>
              View payslips →
            </a>
          </div>
        </div>
      )}

      {tab === "entries" && (
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>All entries · {sessions.length}</div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Total: <span className="font-semibold" style={{ color: "var(--accent-cyan)" }}>{formatHoursMinutes(totalAll)}</span>
              {grossAll > 0 && <> · gross <span className="font-semibold" style={{ color: "var(--text)" }}>{formatDkk(grossAll)}</span></>}
            </div>
          </div>
          {allSessionsWithIdx.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing logged yet — add sessions from the Overview tab.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="text-left py-1">Date</th>
                  <th className="text-right py-1">Hours</th>
                  <th className="text-right py-1 pl-3">Rate</th>
                  <th className="text-right py-1 pl-3">Gross</th>
                  <th className="text-left py-1 pl-3">Note</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {allSessionsWithIdx.map(({ session, realIdx }) => (
                  <tr key={realIdx} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5">{formatShortDate(session.date)}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: "var(--accent-cyan)" }}>{formatHoursMinutes(session.hours)}</td>
                    <td className="py-1.5 pl-3 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {typeof session.hourlyRate === "number" ? `${session.hourlyRate} kr/h` : "—"}
                    </td>
                    <td className="py-1.5 pl-3 text-right tabular-nums" style={{ color: "var(--text)" }}>
                      {typeof session.hourlyRate === "number" ? formatDkk(session.hours * session.hourlyRate) : "—"}
                    </td>
                    <td className="py-1.5 pl-3" style={{ color: "var(--text-muted)" }}>{session.note ?? ""}</td>
                    <td className="py-1.5 text-right"><button onClick={() => deleteSession(realIdx)} className="text-xs" style={{ color: "var(--accent-red)" }}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </HubShell>
  );
}

/** Compact gross → AM-bidrag → A-skat → net breakdown used under the term
 *  totals. Shown only when there's a gross amount to break down. */
function EarningsBreakdown({ label, e, accent }: { label: string; e: import("@/lib/payday").Earnings; accent: string }) {
  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      <div className="rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
        <div style={{ color: "var(--text-muted)" }}>{label} gross</div>
        <div className="tabular-nums font-semibold" style={{ color: accent }}>{formatDkk(e.gross)}</div>
      </div>
      <div className="rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
        <div style={{ color: "var(--text-muted)" }}>AM-bidrag (8%)</div>
        <div className="tabular-nums" style={{ color: "var(--accent-red)" }}>−{formatDkk(e.amBidrag)}</div>
      </div>
      <div className="rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
        <div style={{ color: "var(--text-muted)" }}>A-skat (38%)</div>
        <div className="tabular-nums" style={{ color: "var(--accent-red)" }}>−{formatDkk(e.aSkat)}</div>
      </div>
      <div className="rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
        <div style={{ color: "var(--text-muted)" }}>Net</div>
        <div className="tabular-nums font-semibold" style={{ color: "var(--accent-green)" }}>{formatDkk(e.net)}</div>
      </div>
    </div>
  );
}
