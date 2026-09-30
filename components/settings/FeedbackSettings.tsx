"use client";

import { useEffect, useState } from "react";

const ACCENT = "var(--accent-green)";
type Kind = "bug" | "suggestion";

/**
 * Feedback panel for the unified Settings modal. Composes a prefilled email to
 * the configured recipient and hands it to the OS mail client via a `mailto:`
 * link — the app never sends mail itself. The recipient is a config value
 * (`feedback.json`), editable here, so nothing is hardcoded.
 */
export default function FeedbackSettings() {
  const [email, setEmail] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [kind, setKind] = useState<Kind>("bug");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/feedback/config").then((r) => r.json()).then((d) => {
      setEmail(d.email ?? "");
      setEmailDraft(d.email ?? "");
      if (!d.email) setEditingEmail(true);
    }).catch(() => setEmail(""));
  }, []);

  async function saveEmail() {
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/feedback/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: emailDraft.trim() }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't save."); return; }
      setEmail(j.email);
      setEditingEmail(!j.email);
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  const subject = `[Dashboard ${kind === "bug" ? "Bug" : "Suggestion"}] `;
  const mailto = `mailto:${encodeURIComponent(email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  const canSend = !!email && text.trim().length > 0;

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Found a bug or have an idea? Compose it here — it opens a prefilled email in your mail app (nothing is sent automatically).
      </p>

      {/* Recipient */}
      {email !== null && (
        editingEmail ? (
          <div className="rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Send feedback to</div>
            <div className="flex gap-2">
              <input type="email" placeholder="you@example.com" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)}
                className="text-sm px-2 py-1.5 rounded-md flex-1" style={inputStyle} />
              <button onClick={saveEmail} disabled={saving} className="text-sm px-3 py-1.5 rounded-md disabled:opacity-40"
                style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>Save</button>
            </div>
            {error && <div className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>{error}</div>}
          </div>
        ) : (
          <div className="text-xs flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <span>Feedback goes to <span style={{ color: "var(--text)" }}>{email}</span></span>
            <button onClick={() => setEditingEmail(true)} style={{ color: ACCENT }}>Change</button>
          </div>
        )
      )}

      {/* Compose */}
      <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex gap-1 mb-2">
          {([["bug", "🐛 Bug"], ["suggestion", "💡 Suggestion"]] as const).map(([k, label]) => {
            const on = kind === k;
            return (
              <button key={k} onClick={() => setKind(k)} className="text-xs px-2.5 py-1.5 rounded-md font-medium"
                style={{ background: on ? `${ACCENT}22` : "var(--surface-2)", color: on ? ACCENT : "var(--text-muted)", border: `1px solid ${on ? ACCENT : "var(--border)"}` }}>{label}</button>
            );
          })}
        </div>
        <textarea
          placeholder={kind === "bug" ? "What went wrong? Steps to reproduce help." : "What would make the dashboard better?"}
          value={text} onChange={(e) => setText(e.target.value)} rows={5}
          className="text-sm px-2 py-1.5 rounded-md w-full resize-y" style={inputStyle}
        />
        <div className="mt-2 flex items-center gap-3">
          <a
            href={canSend ? mailto : undefined}
            aria-disabled={!canSend}
            onClick={(e) => { if (!canSend) e.preventDefault(); }}
            className="text-sm px-4 py-2 rounded-lg font-medium inline-block"
            style={{ background: canSend ? `${ACCENT}22` : "var(--surface-2)", color: canSend ? ACCENT : "var(--text-muted)", border: `1px solid ${canSend ? ACCENT : "var(--border)"}`, pointerEvents: canSend ? "auto" : "none", opacity: canSend ? 1 : 0.5 }}
          >📧 Open email</a>
          {!email && <span className="text-xs" style={{ color: "var(--accent-orange)" }}>Set a recipient above first.</span>}
        </div>
      </div>
    </div>
  );
}
