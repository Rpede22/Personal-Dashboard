"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface ChecklistSummary {
  character: string;
  total: number;
  done: number;
}

export default function WoWWidget() {
  const [summaries, setSummaries] = useState<ChecklistSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/wow/checklist?summary=true")
      .then((r) => r.json())
      .then((d) => setSummaries(d.summaries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card accentColor="var(--accent-purple)">
      <CardHeader
        icon="🧙"
        title="World of Warcraft"
        subtitle="Weekly reset checklist"
        accentColor="var(--accent-purple)"
      />

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : summaries.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No characters added yet
        </p>
      ) : (
        <div className="space-y-2">
          {summaries.map((s) => {
            const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
            return (
              <div key={s.character}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{s.character}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {s.done}/{s.total}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: pct === 100 ? "var(--accent-green)" : "var(--accent-purple)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
