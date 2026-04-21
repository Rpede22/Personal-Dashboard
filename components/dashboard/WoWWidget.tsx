"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface WowCharacter {
  id: number;
  name: string;
  realm: string;
  region: string;
}

interface CharStats {
  ilvl: number | null;
  rioScore: number | null;
}

interface ChecklistItem {
  id: number;
  task: string;
  done: boolean;
}

interface CustomTask {
  name: string;
  done: boolean;
}

interface CharData {
  char: WowCharacter;
  stats: CharStats;
  mplusDone: number;
  normalDone: number;
  heroicDone: number;
  mythicDone: number;
  customTasks: CustomTask[];
}

function getMPlusNumber(task: string): number | null {
  const m = task.match(/^M\+\s+Run\s+(\d+)$/i);
  return m ? parseInt(m[1]) : null;
}
function getBossNumber(task: string, diff: string): number | null {
  const m = task.match(new RegExp(`^${diff} Boss (\\d+)$`, "i"));
  return m ? parseInt(m[1]) : null;
}

export default function WoWWidget() {
  const [charData, setCharData] = useState<CharData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const charsRes = await fetch("/api/wow/character");
        const charsJson = await charsRes.json();
        const chars: WowCharacter[] = charsJson.characters ?? [];

        const data = await Promise.all(
          chars.map(async (char) => {
            // Fetch stats and checklist in parallel
            const [statsRes, checkRes] = await Promise.all([
              fetch(`/api/wow/character?name=${encodeURIComponent(char.name)}&realm=${encodeURIComponent(char.realm)}&region=${char.region}`),
              fetch(`/api/wow/checklist?characterId=${char.id}`),
            ]);
            const statsJson = await statsRes.json();
            const checkJson = await checkRes.json();

            const items: ChecklistItem[] = checkJson.checklist ?? [];
            const mplusDone = items.filter(i => getMPlusNumber(i.task) !== null && i.done).length;
            const normalDone = items.filter(i => getBossNumber(i.task, "Normal") !== null && i.done).length;
            const heroicDone = items.filter(i => getBossNumber(i.task, "Heroic") !== null && i.done).length;
            const mythicDone = items.filter(i => getBossNumber(i.task, "Mythic") !== null && i.done).length;
            const customTasks = items
              .filter(i => getMPlusNumber(i.task) === null && getBossNumber(i.task, "Normal") === null && getBossNumber(i.task, "Heroic") === null && getBossNumber(i.task, "Mythic") === null)
              .map(i => ({ name: i.task, done: i.done }));

            return {
              char,
              stats: { ilvl: statsJson.ilvl ?? null, rioScore: statsJson.rioScore ?? null },
              mplusDone,
              normalDone,
              heroicDone,
              mythicDone,
              customTasks,
            };
          })
        );
        setCharData(data);
      } catch {}
      setLoading(false);
    })();
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
      ) : charData.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No characters added yet
        </p>
      ) : (
        <div className="space-y-2.5">
          {charData.map((d) => (
            <div key={d.char.id} className="rounded-lg px-2.5 py-2" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold capitalize">{d.char.name}</span>
                <div className="flex gap-2">
                  {d.stats.ilvl !== null && (
                    <span className="text-xs font-medium" style={{ color: "var(--accent-blue)" }}>
                      {d.stats.ilvl.toFixed(2)} ilvl
                    </span>
                  )}
                  {d.stats.rioScore !== null && (
                    <span className="text-xs font-medium" style={{ color: "var(--accent-orange)" }}>
                      {Math.round(d.stats.rioScore)} rio
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <span style={{ color: d.mplusDone === 8 ? "var(--accent-green)" : undefined }}>
                  M+ {d.mplusDone}/8
                </span>
                <span>·</span>
                <span style={{ color: d.normalDone === 9 ? "var(--accent-green)" : undefined }}>
                  N {d.normalDone}/9
                </span>
                <span>·</span>
                <span style={{ color: d.heroicDone === 9 ? "var(--accent-green)" : undefined }}>
                  H {d.heroicDone}/9
                </span>
                <span>·</span>
                <span style={{ color: d.mythicDone === 9 ? "var(--accent-green)" : undefined }}>
                  M {d.mythicDone}/9
                </span>
                {d.customTasks.map((ct) => (
                  <span key={ct.name}>
                    <span>·</span>{" "}
                    <span style={{ color: ct.done ? "var(--accent-green)" : undefined }}>
                      {ct.name} {ct.done ? "✓" : "✗"}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
