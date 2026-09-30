"use client";

import { useEffect, useState } from "react";
import { PanelIntro, HelpDetails, LocalOnlyNote, Steps } from "@/components/settings/SettingsHelp";

/**
 * Calendar settings panel for the unified settings modal. De-hardcodes the
 * calendar sources that used to live in `.env.local` + `app/api/calendar`:
 *   • ICS feed URLs (read-only calendars like the SDU timetable)
 *   • iCloud CalDAV credentials (Apple ID + app-specific password)
 *   • the CalDAV include-list (which iCloud calendars to surface + rename)
 *
 * The password is write-only — the API returns `hasPassword` instead of the
 * value, and an empty password field on save keeps the stored one. Persists
 * to `calendar-feeds.json` (gitignored). Uses an explicit Save button since a
 * multi-row form is awkward to save per-blur.
 */

interface IcsFeed { name: string; url: string }
interface CalDAVInclude { match: string; display?: string }
interface PublicCfg {
  icsFeeds: IcsFeed[];
  caldav: { user: string; hasPassword: boolean; includes: CalDAVInclude[] };
}

const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

export default function CalendarSettings() {
  const [cfg, setCfg] = useState<PublicCfg | null>(null);
  const [feeds, setFeeds] = useState<IcsFeed[]>([]);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [includes, setIncludes] = useState<CalDAVInclude[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");

  function hydrate(c: PublicCfg) {
    setCfg(c);
    setFeeds(c.icsFeeds.length ? c.icsFeeds : []);
    setUser(c.caldav.user);
    setIncludes(c.caldav.includes);
    setPass(""); // never prefill — write-only
  }

  useEffect(() => {
    fetch("/api/calendar/config").then((r) => r.json()).then(hydrate).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const body: Record<string, unknown> = {
        icsFeeds: feeds.filter((f) => f.name.trim()),
        caldav: {
          user: user.trim(),
          includes: includes.filter((i) => i.match.trim()),
          // Only send pass when the user actually typed one.
          ...(pass.trim() ? { pass } : {}),
        },
      };
      const res = await fetch("/api/calendar/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.ok) {
        hydrate(d);
        setStatus("Saved ✓");
      } else {
        setStatus(d.error || "Save failed");
      }
    } catch (err) {
      setStatus(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>;

  return (
    <div className="space-y-6">
      <PanelIntro accent="var(--accent-pink)">
        Show your calendars on the dashboard. There are <strong>two kinds</strong> you can add:
        <ul className="mt-1.5 space-y-1 pl-4 list-disc" style={{ color: "var(--text-muted)" }}>
          <li><strong style={{ color: "var(--text)" }}>ICS feed</strong> — a read-only link to a calendar (a school timetable, a shared Google/Outlook calendar). You can see it, but not add or delete events.</li>
          <li><strong style={{ color: "var(--text)" }}>iCloud calendar</strong> — your Apple calendars, connected with your Apple ID. These are <em>writeable</em>: you can quick-add and delete events right from the dashboard.</li>
        </ul>
        Add either, both, or neither — the dashboard works fine without a calendar.
      </PanelIntro>

      {/* ── ICS feeds ─────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>ICS feeds (read-only)</h3>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
          Subscription URLs (e.g. a university timetable). Shown as calendars but not editable from the app.
        </p>
        <HelpDetails summary="Where do I find an ICS link?">
          <p>An ICS link usually ends in <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>.ics</code> or starts with <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>webcal://</code>. To get one:</p>
          <ul className="space-y-1 pl-4 list-disc">
            <li><strong>Google Calendar:</strong> Settings → your calendar → “Integrate calendar” → copy the <em>Secret address in iCal format</em>.</li>
            <li><strong>Outlook:</strong> Calendar → Share → Publish → copy the <em>ICS</em> link.</li>
            <li><strong>iCloud (public):</strong> Calendar app → share a calendar → “Public Calendar” → copy the link.</li>
          </ul>
          <p>Paste it below with a short name. It refreshes automatically.</p>
        </HelpDetails>
        <div className="space-y-2">
          {feeds.map((f, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                placeholder="Name"
                value={f.name}
                onChange={(e) => setFeeds((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                className="w-32 rounded-lg px-2 py-1.5 text-sm flex-shrink-0"
                style={inputStyle}
              />
              <input
                placeholder="https://… or webcal://…"
                value={f.url}
                onChange={(e) => setFeeds((prev) => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                className="flex-1 rounded-lg px-2 py-1.5 text-sm"
                style={inputStyle}
              />
              <button
                onClick={() => setFeeds((prev) => prev.filter((_, j) => j !== i))}
                className="text-xs px-2 py-1.5 rounded-lg flex-shrink-0"
                style={{ background: "var(--surface-2)", color: "var(--accent-red)", border: "1px solid var(--border)" }}
                title="Remove feed"
              >✕</button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setFeeds((prev) => [...prev, { name: "", url: "" }])}
          className="text-xs mt-2 px-3 py-1.5 rounded-lg"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px dashed var(--border)" }}
        >+ Add feed</button>
      </section>

      {/* ── iCloud CalDAV ─────────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>iCloud calendars (writeable)</h3>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
          Connect your Apple calendars with your Apple ID and a one-off <strong>app-specific password</strong>.
          New to this? Follow the steps below — it takes about two minutes.
        </p>

        <HelpDetails summary="How do I connect iCloud? (step-by-step)">
          <p><strong>Why an “app-specific password”?</strong> Apple doesn’t let other apps use your normal Apple password. Instead you generate a separate 16-character password just for this dashboard — you can revoke it any time without changing your real password.</p>
          <Steps>
            <li>
              Go to{" "}
              <a href="https://appleid.apple.com/account/manage" target="_blank" rel="noreferrer" style={{ color: "var(--accent-blue)" }}>
                appleid.apple.com
              </a>{" "}and sign in with your Apple ID.
            </li>
            <li>Open <strong>Sign-In and Security</strong> → <strong>App-Specific Passwords</strong>.</li>
            <li>Click <strong>+ Generate an app-specific password</strong>, name it <em>“Dashboard”</em>, and confirm.</li>
            <li>Apple shows a password like <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>abcd-efgh-ijkl-mnop</code>. Copy it.</li>
            <li>Below, enter your <strong>Apple ID email</strong> and paste that generated password (<em>not</em> your normal Apple password).</li>
            <li>Save. Then pick which calendars to show in the next section.</li>
          </Steps>
          <p style={{ color: "var(--text-muted)" }}>Two-factor authentication must be on for your Apple ID (it usually is) — that’s what enables app-specific passwords.</p>
        </HelpDetails>

        <label className="block text-sm mb-1 mt-3">Apple ID (email)</label>
        <input
          type="email" placeholder="you@icloud.com"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          className="w-full rounded-lg px-2 py-1.5 text-sm mb-3"
          style={inputStyle}
        />
        <label className="block text-sm mb-1">App-specific password</label>
        <input
          type="password"
          placeholder={cfg.caldav.hasPassword ? "•••••••• (leave blank to keep current)" : "xxxx-xxxx-xxxx-xxxx"}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          className="w-full rounded-lg px-2 py-1.5 text-sm"
          style={inputStyle}
        />
        {cfg.caldav.hasPassword && (
          <p className="text-xs mt-1" style={{ color: "var(--accent-green)" }}>A password is stored. Type a new one to replace it.</p>
        )}
        <LocalOnlyNote file="calendar-feeds.json" />
      </section>

      {/* ── CalDAV includes ───────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>iCloud calendars to show</h3>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
          After connecting, list which iCloud calendars to surface. <strong>Match</strong> is the start of the calendar’s
          name (first match wins — put longer prefixes first). <strong>Display</strong> optionally gives it a friendlier
          name in the app — e.g. match <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>Work</code> →
          display <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>My job</code>. Leave this empty to hide all iCloud calendars.
        </p>
        <div className="space-y-2">
          {includes.map((inc, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                placeholder="Match (e.g. Kalender)"
                value={inc.match}
                onChange={(e) => setIncludes((prev) => prev.map((x, j) => (j === i ? { ...x, match: e.target.value } : x)))}
                className="flex-1 rounded-lg px-2 py-1.5 text-sm"
                style={inputStyle}
              />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>→</span>
              <input
                placeholder="Display (optional)"
                value={inc.display ?? ""}
                onChange={(e) => setIncludes((prev) => prev.map((x, j) => (j === i ? { ...x, display: e.target.value } : x)))}
                className="flex-1 rounded-lg px-2 py-1.5 text-sm"
                style={inputStyle}
              />
              <button
                onClick={() => setIncludes((prev) => prev.filter((_, j) => j !== i))}
                className="text-xs px-2 py-1.5 rounded-lg flex-shrink-0"
                style={{ background: "var(--surface-2)", color: "var(--accent-red)", border: "1px solid var(--border)" }}
                title="Remove"
              >✕</button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setIncludes((prev) => [...prev, { match: "", display: "" }])}
          className="text-xs mt-2 px-3 py-1.5 rounded-lg"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px dashed var(--border)" }}
        >+ Add calendar</button>
      </section>

      {/* ── Save ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="text-sm px-4 py-2 rounded-lg font-medium"
          style={{ background: "var(--accent-pink)22", color: "var(--accent-pink)", border: "1px solid var(--accent-pink)" }}
        >{saving ? "Saving…" : "Save calendar settings"}</button>
        {status && (
          <span className="text-xs" style={{ color: status.startsWith("Saved") ? "var(--accent-green)" : "var(--accent-red)" }}>{status}</span>
        )}
      </div>
    </div>
  );
}
