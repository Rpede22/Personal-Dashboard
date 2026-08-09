"use client";

import { useEffect, useMemo, useState } from "react";
import HubShell from "@/components/HubShell";
import {
  type Payday,
  currentPayTerm,
  dateKey,
  daysUntilPayday,
  formatPaydayLabel,
  nextPayday,
  previousPayTerm,
  resolvePayday,
  sumHoursInTerm,
} from "@/lib/payday";

interface WorkSession { date: string; hours: number; note?: string }
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

export default function WorkHub() {
  const [config, setConfig] = useState<WorkConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  const [addDate, setAddDate] = useState<string>(todayKey());
  const [addHours, setAddHours] = useState<string>("");
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
    const h = Number(addHours);
    if (!addDate || !Number.isFinite(h) || h <= 0) return;
    await post({ session: { date: addDate, hours: h, note: addNote || undefined } });
    setAddHours(""); setAddNote(""); setAddDate(todayKey());
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
              {termHours.toFixed(1)}<span className="text-lg font-semibold"> h</span>
            </div>

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
                {prevTermHours.toFixed(1)}<span className="text-base font-semibold"> h</span>
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Reflected on your most recent payslip.</div>
            </div>
          )}

          {nextTermPreview && nextTermPreviewHours > 0 && (
            <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Next pay-term (already logged)</div>
              <div className="text-sm mb-1">{formatShortDate(dateKey(nextTermPreview.start))} → {formatShortDate(dateKey(nextTermPreview.end))}</div>
              <div className="text-xl font-bold" style={{ color: "var(--text-muted)" }}>
                {nextTermPreviewHours.toFixed(1)}<span className="text-sm font-semibold"> h</span>
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
              <input
                type="number" step="0.25" min="0" max="24" placeholder="hrs"
                value={addHours} onChange={(e) => setAddHours(e.target.value)}
                className="text-sm w-20 px-2 py-1.5 rounded-md"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
              <input
                type="text" placeholder="note (optional)"
                value={addNote} onChange={(e) => setAddNote(e.target.value)}
                className="text-sm flex-1 min-w-[160px] px-2 py-1.5 rounded-md"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              />
              <button
                onClick={addSession} disabled={saving || !addHours}
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
                    <span className="tabular-nums font-semibold" style={{ color: "var(--accent-cyan)" }}>{session.hours.toFixed(1)}h</span>
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
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>Total: <span className="font-semibold" style={{ color: "var(--accent-cyan)" }}>{totalAll.toFixed(1)}h</span></div>
          </div>
          {allSessionsWithIdx.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing logged yet — add sessions from the Overview tab.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="text-left py-1">Date</th>
                  <th className="text-right py-1">Hours</th>
                  <th className="text-left py-1 pl-3">Note</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {allSessionsWithIdx.map(({ session, realIdx }) => (
                  <tr key={realIdx} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5">{formatShortDate(session.date)}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: "var(--accent-cyan)" }}>{session.hours.toFixed(1)}</td>
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
