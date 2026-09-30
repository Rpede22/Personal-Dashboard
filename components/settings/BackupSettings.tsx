"use client";

import { useState } from "react";
import { serializeSettings, importSettings } from "@/lib/settings-backup";

const ACCENT = "var(--accent-cyan)";

/**
 * Backup / Share panel for the unified Settings modal. Exports the dashboard's
 * view preferences (theme, layout, widget order, category, weather cities, …) as
 * a shareable JSON blob and imports one back. It only touches `dashboard.*`
 * localStorage prefs — no credentials or accounts are ever in scope, so an export
 * is always safe to hand to someone else. See [lib/settings-backup.ts].
 */
export default function BackupSettings() {
  const [exported, setExported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  function doExport() {
    setExported(serializeSettings());
    setCopied(false);
  }

  async function copyExport() {
    if (!exported) return;
    try {
      await navigator.clipboard.writeText(exported);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — the textarea is selectable as a fallback */ }
  }

  function doImport() {
    if (!window.confirm("Overwrite this device's matching settings from the pasted blob, then reload?")) return;
    const result = importSettings(importText.trim());
    if (!result.ok) {
      setStatus({ ok: false, msg: result.error ?? "Import failed." });
      return;
    }
    setStatus({ ok: true, msg: `Imported ${result.imported} setting${result.imported === 1 ? "" : "s"}. Reloading…` });
    setTimeout(() => window.location.reload(), 700);
  }

  const boxStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Back up or share your dashboard layout and preferences. This covers only your
        view settings — theme, widget layout, categories, weather cities, and the
        like. No passwords, API keys, or accounts are included, so an export is safe
        to share.
      </p>

      {/* Export */}
      <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Export</div>
          <div className="flex gap-2">
            {exported && (
              <button onClick={copyExport} className="text-xs px-2.5 py-1.5 rounded-md font-medium"
                style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            )}
            <button onClick={doExport} className="text-xs px-2.5 py-1.5 rounded-md font-medium"
              style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>
              {exported ? "Regenerate" : "Generate blob"}
            </button>
          </div>
        </div>
        {exported ? (
          <textarea readOnly value={exported} rows={7} onFocus={(e) => e.currentTarget.select()}
            className="text-xs px-2 py-1.5 rounded-md w-full resize-y font-mono" style={boxStyle} />
        ) : (
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Click “Generate blob” to snapshot your current settings.
          </div>
        )}
      </div>

      {/* Import */}
      <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Import</div>
        <textarea
          placeholder="Paste an exported settings blob here…"
          value={importText} onChange={(e) => { setImportText(e.target.value); setStatus(null); }} rows={5}
          className="text-xs px-2 py-1.5 rounded-md w-full resize-y font-mono" style={boxStyle}
        />
        <div className="mt-2 flex items-center gap-3">
          <button onClick={doImport} disabled={importText.trim().length === 0}
            className="text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-40"
            style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>
            Apply &amp; reload
          </button>
          {status && (
            <span className="text-xs" style={{ color: status.ok ? "var(--accent-green)" : "var(--accent-red)" }}>
              {status.msg}
            </span>
          )}
        </div>
        <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          Importing overwrites the matching settings on this device, then reloads.
        </div>
      </div>
    </div>
  );
}
