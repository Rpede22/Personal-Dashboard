"use client";

import { type ReactNode } from "react";

/**
 * Shared plain-language helpers for the settings panels + onboarding steps
 * (#5). Every panel opens with a `PanelIntro` (what this is / why / what you
 * need); fiddly fields get a `HelpDetails` expander ("Where do I get this?");
 * anything that stores a secret gets a `LocalOnlyNote`. Kept dependency-free so
 * both the Settings modal and the onboarding wizard can reuse them.
 */

/** Plain-language intro block shown at the top of a settings panel. */
export function PanelIntro({ children, accent = "var(--accent-cyan)" }: { children: ReactNode; accent?: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-sm leading-relaxed"
      style={{ background: `${accent}12`, border: `1px solid ${accent}33`, color: "var(--text)" }}
    >
      {children}
    </div>
  );
}

/** Collapsible "?" / "Where do I get this?" help. Closed by default. */
export function HelpDetails({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group text-xs mt-1" style={{ color: "var(--text-muted)" }}>
      <summary className="cursor-pointer select-none inline-flex items-center gap-1 hover:brightness-125" style={{ color: "var(--accent-cyan)" }}>
        <span className="inline-block transition-transform group-open:rotate-90">▸</span>
        {summary}
      </summary>
      <div className="mt-2 pl-3 space-y-2 leading-relaxed" style={{ borderLeft: "2px solid var(--border)" }}>
        {children}
      </div>
    </details>
  );
}

/** Small "stored on your device only" reassurance for secret fields. */
export function LocalOnlyNote({ file }: { file?: string }) {
  return (
    <p className="text-xs mt-1 inline-flex items-center gap-1" style={{ color: "var(--accent-green)" }}>
      🔒 Stored only on this computer{file ? <> (<code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>{file}</code>)</> : null} — never uploaded anywhere.
    </p>
  );
}

/** Numbered step list for the illustrated guides. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-1.5 pl-5 list-decimal">{children}</ol>;
}

/**
 * Placeholder for a "settings" panel that has nothing to pre-configure — the
 * feature is just a list of your own content managed in its hub (Tasks,
 * Countdowns, Watchlist, Subscriptions). Rather than duplicate the hub's
 * add/remove UI inside Settings, we point there. The hub opens from its
 * dashboard widget (the Electron window has no address bar).
 */
export function HubPlaceholder({ emoji, name, widget, blurb }: { emoji: string; name: string; widget?: string; blurb?: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg px-4 py-6 text-center" style={{ background: "var(--surface-2)", border: "1px dashed var(--border)" }}>
        <div className="text-3xl mb-2">{emoji}</div>
        <div className="text-sm font-medium mb-1">Manage {name} in the {name} hub</div>
        <p className="text-xs leading-relaxed mx-auto" style={{ color: "var(--text-muted)", maxWidth: "26rem" }}>
          {blurb ?? `There's nothing to pre-configure here — ${name} is just a list you build as you go.`} Open it from the{" "}
          <span style={{ color: "var(--text)" }}>{widget ?? name}</span> widget on your dashboard to add, edit, or remove entries.
        </p>
      </div>
    </div>
  );
}
