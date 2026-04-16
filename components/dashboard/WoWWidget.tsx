"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface ChecklistSummary {
  character: string;
  characterId: number;
  total: number;
  done: number;
}

interface ChecklistItem {
  id: number;
  task: string;
  done: boolean;
}

interface CharMPlus {
  characterId: number;
  mplusDone: number;
}

function getMPlusNumber(task: string): number | null {
  const m = task.match(/^M\+\s+Run\s+(\d+)$/i);
  return m ? parseInt(m[1]) : null;
}

export default function WoWWidget() {
  const [summaries, setSummaries] = useState<ChecklistSummary[]>([]);
  const [mplusData, setMplusData] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/wow/checklist?summary=true")
      .then((r) => r.json())
      .then(async (d) => {
        const sums: ChecklistSummary[] = d.summaries ?? [];
        setSummaries(sums);

        // Fetch per-character M+ counts
        const mplusMap = new Map<number, number>();
        await Promise.all(
          sums.map(async (s) => {
            try {
              const res = await fetch(`/api/wow/checklist?characterId=${s.characterId}`);
              const data = await res.json();
              const items: ChecklistItem[] = data.checklist ?? [];
              const done = items.filter(
                (item) => getMPlusNumber(item.task) !== null && item.done
              ).length;
              mplusMap.set(s.characterId, done);
            } catch {
              mplusMap.set(s.characterId, 0);
            }
          })
        );
        setMplusData(new Map(mplusMap));
      })
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
        <div className="space-y-3">
          {summaries.map((s) => {
            const mplusDone = mplusData.get(s.characterId) ?? 0;
            const pct = Math.round((mplusDone / 8) * 100);
            return (
              <div key={s.character}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium capitalize">{s.character}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    M+ {mplusDone}/8
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
