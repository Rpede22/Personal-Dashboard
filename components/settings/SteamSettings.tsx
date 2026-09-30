"use client";

import { useEffect, useState } from "react";
import { PanelIntro, HelpDetails } from "@/components/settings/SettingsHelp";

/**
 * Steam settings panel (#5) — set the SteamID / profile so the Steam widget +
 * hub can show your wishlist (and, with a key, playtime). Mirrors the hub's
 * setup box but lives in Settings + onboarding. Persists via `/api/steam/config`
 * (accepts a SteamID64, a profile URL, or a custom-URL name when a key is set).
 */

const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

export default function SteamSettings() {
  const [value, setValue] = useState("");
  const [country, setCountry] = useState("dk");
  const [saved, setSaved] = useState<{ steamId: string; hasKey?: boolean } | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/steam/config").then((r) => r.json()).then((d) => {
      setSaved(d);
      if (d.countryCode) setCountry(d.countryCode);
    }).catch(() => {});
  }, []);

  async function save() {
    setSaving(true); setStatus("");
    try {
      const res = await fetch("/api/steam/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamId: value.trim(), countryCode: country }),
      });
      const d = await res.json();
      if (res.ok) { setSaved(d); setValue(""); setStatus(d.steamId ? "Saved ✓" : "Couldn't resolve that — check the ID/URL"); }
      else setStatus(d.error || "Save failed");
    } catch (e) { setStatus(String(e)); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <PanelIntro accent="var(--accent-blue)">
        Track your <strong>Steam wishlist</strong> and spot when wishlisted games go on sale, right on the dashboard.
        Just tell it which Steam account is yours. The wishlist works with no key; playtime stats need the author&apos;s
        Steam key (already bundled in this build).
      </PanelIntro>

      {saved?.steamId && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--accent-green)15", border: "1px solid var(--accent-green)55", color: "var(--accent-green)" }}>
          ✓ Connected · SteamID <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>{saved.steamId}</code>
        </div>
      )}

      <div>
        <label className="block text-sm mb-1">SteamID64, profile URL, or custom name</label>
        <input
          placeholder="76561198… or steamcommunity.com/id/yourname"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg px-2 py-1.5 text-sm"
          style={inputStyle}
        />
        <HelpDetails summary="How do I find my SteamID?">
          <p>Your <strong>profile URL</strong> is the easiest: open Steam → click your name → copy the page URL (e.g. <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>steamcommunity.com/id/yourname</code>). Paste it above.</p>
          <p>Or get the numeric <strong>SteamID64</strong> (a 17-digit number starting <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>7656…</code>) from{" "}
            <a href="https://steamdb.info/calculator/" target="_blank" rel="noreferrer" style={{ color: "var(--accent-blue)" }}>steamdb.info/calculator</a>.</p>
          <p>Your <strong>profile and game details must be public</strong> for the wishlist and playtime to load (Steam → Edit Profile → Privacy).</p>
        </HelpDetails>
      </div>

      <div>
        <label className="block text-sm mb-1">Store region</label>
        <input
          placeholder="dk"
          value={country}
          onChange={(e) => setCountry(e.target.value.toLowerCase().slice(0, 2))}
          className="w-24 rounded-lg px-2 py-1.5 text-sm"
          style={inputStyle}
        />
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Two-letter country code — sets the currency/prices for sale alerts.</p>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving || !value.trim()} className="text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-40"
          style={{ background: "var(--accent-blue)22", color: "var(--accent-blue)", border: "1px solid var(--accent-blue)" }}>
          {saving ? "Saving…" : "Save"}
        </button>
        {status && <span className="text-xs" style={{ color: status.startsWith("Saved") ? "var(--accent-green)" : "var(--accent-red)" }}>{status}</span>}
      </div>
    </div>
  );
}
