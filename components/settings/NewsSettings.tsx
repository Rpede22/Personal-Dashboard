"use client";

import { useEffect, useState } from "react";

/**
 * News settings panel for the unified modal — pick the headline source. The
 * catalogue comes from `GET /api/news/config`; selecting one POSTs it back.
 */
export default function NewsSettings() {
  const [sources, setSources] = useState<Array<{ id: string; label: string }>>([]);
  const [current, setCurrent] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/news/config").then((r) => r.json()).then((d) => {
      setSources(d.sources ?? []);
      setCurrent(d.source ?? "");
    }).catch(() => {});
  }, []);

  async function pick(id: string) {
    setSaving(true);
    setCurrent(id);
    try {
      await fetch("/api/news/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: id }) });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Where the News widget + hub pull headlines from. Danish (TV2, DR) and English (BBC, The Guardian).
      </p>
      <div className="space-y-1">
        {sources.map((s) => {
          const on = current === s.id;
          return (
            <button
              key={s.id}
              onClick={() => pick(s.id)}
              disabled={saving}
              className="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between"
              style={{
                background: on ? "var(--accent-orange)22" : "var(--surface-2)",
                color: on ? "var(--accent-orange)" : "var(--text)",
                border: `1px solid ${on ? "var(--accent-orange)" : "var(--border)"}`,
              }}
            >
              <span className="text-sm">{s.label}</span>
              {on && <span className="text-xs">✓ selected</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
