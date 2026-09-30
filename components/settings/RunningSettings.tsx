"use client";

import { useEffect, useState } from "react";
import { PanelIntro } from "@/components/settings/SettingsHelp";

/**
 * Running settings panel — just the **Strava connection** (one-click OAuth).
 * The goal race (date + distance) lives in the Running hub itself, so this
 * panel no longer duplicates it.
 */

interface StravaStatus { connected: boolean; athleteId: number | null; hasCredentials: boolean }

export default function RunningSettings() {
  const [strava, setStrava] = useState<StravaStatus | null>(null);

  useEffect(() => {
    fetch("/api/strava").then((r) => r.json()).then(setStrava).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <PanelIntro accent="var(--accent-green)">
        Connect <strong>Strava</strong> to import your runs automatically — no manual logging. Your goal race (date +
        distance) and everything else lives in the Running hub itself.
      </PanelIntro>

      <div>
        <h3 className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Strava</h3>
        {strava?.connected ? (
          <div className="rounded-lg px-3 py-2 text-sm inline-flex flex-col gap-0.5" style={{ background: "var(--accent-green)15", border: "1px solid var(--accent-green)55" }}>
            <span style={{ color: "var(--accent-green)" }}>✓ Connected to Strava</span>
            <a href="/api/strava/auth" className="text-xs" style={{ color: "var(--accent-blue)" }}>Reconnect a different account →</a>
          </div>
        ) : (
          <>
            <a href="/api/strava/auth" className="inline-block text-sm px-4 py-2 rounded-lg font-medium" style={{ background: "#FC4C02", color: "#fff" }}>
              Connect Strava →
            </a>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              One click — log in and approve on Strava. No developer account needed.
              {strava && !strava.hasCredentials && <span style={{ color: "var(--accent-orange)" }}> (Strava keys aren&apos;t set up in this build yet.)</span>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
