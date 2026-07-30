"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { predictRaceTime, formatDuration, formatPace, type RunEntry, type RacePrediction } from "@/lib/training-planner";

interface Summary {
  raceDate: string | null;
  raceDistance: number | null;
  weeklyKm: number;
}
interface Run { date: string; distance: number; duration: number }

function daysUntil(iso: string): number {
  const t = new Date(iso).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.round((t - today) / 86400000);
}

export default function RaceCountdown() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prediction, setPrediction] = useState<RacePrediction | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [sumRes, runsRes] = await Promise.all([
          fetch("/api/running/summary").then((r) => r.json()) as Promise<Summary>,
          fetch("/api/running").then((r) => r.json()) as Promise<{ runs: Run[] }>,
        ]);
        if (cancelled) return;
        setSummary(sumRes);
        if (sumRes.raceDate && sumRes.raceDistance) {
          const entries: RunEntry[] = (runsRes.runs ?? []).map((r) => ({
            date: new Date(r.date).toISOString(),
            distance: r.distance,
            duration: r.duration,
          }));
          setPrediction(predictRaceTime(entries, sumRes.raceDistance, new Date(sumRes.raceDate)));
        }
      } catch { /* ignore */ }
    }
    load();
    const iv = setInterval(load, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  if (!summary?.raceDate || !summary?.raceDistance) return null;
  const days = daysUntil(summary.raceDate);
  if (days < 0) return null; // race has passed

  const raceDate = new Date(summary.raceDate);
  const dateLabel = raceDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const confidenceColor =
    prediction?.confidence === "high" ? "var(--accent-green)"
    : prediction?.confidence === "medium" ? "var(--accent-orange)"
    : "var(--accent-red)";

  return (
    <Link
      href="/running"
      className="block mb-6 rounded-2xl px-5 py-4 hover:brightness-110"
      style={{ background: "var(--surface)", border: "1px solid var(--accent-green)66" }}
    >
      <div className="flex items-center gap-6 flex-wrap">
        {/* Big countdown */}
        <div className="flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Race day</div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold" style={{ color: "var(--accent-green)" }}>
              {days === 0 ? "Today" : days}
            </span>
            {days > 0 && <span className="text-sm" style={{ color: "var(--text-muted)" }}>{days === 1 ? "day" : "days"}</span>}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {summary.raceDistance} km · {dateLabel}
          </div>
        </div>

        {/* Divider */}
        <div className="h-12 w-px" style={{ background: "var(--border)" }} />

        {/* Predicted finish */}
        {prediction ? (
          <div className="flex-1 min-w-[180px]">
            <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Predicted finish</div>
            <div className="text-2xl font-bold" style={{ color: "var(--text)" }}>{formatDuration(prediction.predictedSeconds)}</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {formatPace(prediction.predictedPaceSecPerKm)} ·{" "}
              <span style={{ color: confidenceColor }}>{prediction.confidence} confidence</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-[180px]">
            <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Predicted finish</div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>Log a run ≥ {(summary.raceDistance * 0.2).toFixed(1)} km to unlock a prediction.</div>
          </div>
        )}

        {/* Weekly volume */}
        <div className="flex-shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>This week</div>
          <div className="text-2xl font-bold" style={{ color: "var(--text)" }}>{summary.weeklyKm.toFixed(1)} <span className="text-sm">km</span></div>
        </div>
      </div>
    </Link>
  );
}
