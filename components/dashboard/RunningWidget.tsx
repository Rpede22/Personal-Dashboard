"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface RunSummary {
  lastRun: { date: string; distance: number; feel: string | null } | null;
  weeklyKm: number;
  raceDate: string | null;
}

export default function RunningWidget() {
  const [data, setData] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/running/summary")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const daysToRace =
    data?.raceDate
      ? Math.ceil((new Date(data.raceDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

  return (
    <Card accentColor="var(--accent-green)">
      <CardHeader
        icon="🏃"
        title="Running"
        subtitle="Half marathon training"
        accentColor="var(--accent-green)"
      />

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-4">
            <div
              className="flex-1 rounded-xl p-3 text-center"
              style={{ background: "var(--surface-2)" }}
            >
              <div
                className="text-2xl font-bold"
                style={{ color: "var(--accent-green)" }}
              >
                {data?.weeklyKm?.toFixed(1) ?? "0.0"}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                km this week
              </div>
            </div>
            {daysToRace !== null && (
              <div
                className="flex-1 rounded-xl p-3 text-center"
                style={{ background: "var(--surface-2)" }}
              >
                <div
                  className="text-2xl font-bold"
                  style={{ color: "var(--accent-orange)" }}
                >
                  {daysToRace}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  days to race
                </div>
              </div>
            )}
          </div>

          {data?.lastRun ? (
            <div
              className="text-sm rounded-xl p-2.5 flex justify-between items-center"
              style={{ background: "var(--surface-2)" }}
            >
              <span style={{ color: "var(--text-muted)" }}>Last run</span>
              <span className="font-medium">{data.lastRun.distance.toFixed(1)} km</span>
              <span style={{ color: "var(--text-muted)" }}>
                {new Date(data.lastRun.date).toLocaleDateString("en-GB", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No runs logged yet
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
