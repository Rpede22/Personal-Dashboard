"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const RunMap = dynamic(() => import("./RunMap"), { ssr: false });

interface RunLog {
  id: number;
  date: string;
  distance: number;
  duration: number;
  notes: string | null;
  stravaId: string | null;
}

interface StravaActivity {
  name: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  map?: { summary_polyline?: string; polyline?: string };
  splits_metric?: Array<{
    distance: number;
    moving_time: number;
    elevation_difference: number;
    average_heartrate?: number;
    average_cadence?: number;
  }>;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pace(distKm: number, durationSec: number): string {
  if (distKm === 0) return "—";
  const secPerKm = durationSec / distKm;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export default function RunDetailModal({
  run,
  onClose,
}: {
  run: RunLog;
  onClose: () => void;
}) {
  const [activity, setActivity] = useState<StravaActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!run.stravaId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/strava/activity/${run.stravaId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Strava API ${r.status}`);
        return r.json();
      })
      .then((data) => setActivity(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [run.stravaId]);

  const polyline = activity?.map?.polyline ?? activity?.map?.summary_polyline ?? "";
  const distKm = run.distance;
  const durationSec = run.duration;
  const runDate = new Date(run.date).toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-2xl w-full max-w-3xl flex flex-col overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          maxHeight: "88vh",
        }}
      >
        {/* Header — always visible, never scrolls */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-5 py-4 rounded-t-2xl"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <div className="font-semibold" style={{ color: "var(--accent-green)" }}>
              {activity?.name ?? `Run — ${runDate}`}
            </div>
            {activity?.name && (
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {runDate}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-lg px-2 py-1 rounded-lg"
            style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Map */}
          {loading && (
            <div className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
              Loading Strava data…
            </div>
          )}
          {error && (
            <div className="text-sm text-center py-4" style={{ color: "var(--accent-red)" }}>
              Could not load Strava details: {error}
            </div>
          )}
          {polyline && <RunMap polyline={polyline} />}

          {/* Core stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Distance", value: `${distKm.toFixed(2)} km`, color: "var(--accent-green)" },
              { label: "Duration", value: formatDuration(durationSec), color: "var(--text)" },
              { label: "Avg Pace", value: pace(distKm, durationSec), color: "var(--accent-blue)" },
              {
                label: "Elevation",
                value: activity ? `${Math.round(activity.total_elevation_gain)} m` : "—",
                color: "var(--accent-orange)",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl p-3 text-center"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div className="text-lg font-bold" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* HR + cadence (Strava only) */}
          {activity && (activity.average_heartrate || activity.average_cadence) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {activity.average_heartrate && (
                <div
                  className="rounded-xl p-3 text-center"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                >
                  <div className="text-lg font-bold" style={{ color: "var(--accent-red)" }}>
                    {Math.round(activity.average_heartrate)} bpm
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Avg HR</div>
                </div>
              )}
              {activity.max_heartrate && (
                <div
                  className="rounded-xl p-3 text-center"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                >
                  <div className="text-lg font-bold" style={{ color: "var(--accent-red)" }}>
                    {Math.round(activity.max_heartrate)} bpm
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Max HR</div>
                </div>
              )}
              {activity.average_cadence && (
                <div
                  className="rounded-xl p-3 text-center"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                >
                  <div className="text-lg font-bold" style={{ color: "var(--accent-purple)" }}>
                    {Math.round(activity.average_cadence * 2)} spm
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Cadence</div>
                </div>
              )}
            </div>
          )}

          {/* Splits table */}
          {activity?.splits_metric && activity.splits_metric.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
                Splits
              </h4>
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--border)" }}
              >
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                      {["km", "Pace", "Elev", "HR"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activity.splits_metric!.map((split, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <td className="px-3 py-2 font-semibold" style={{ color: "var(--accent-green)" }}>
                          {i + 1}
                        </td>
                        <td className="px-3 py-2">
                          {pace(split.distance / 1000, split.moving_time)}
                        </td>
                        <td className="px-3 py-2" style={{ color: split.elevation_difference >= 0 ? "var(--accent-orange)" : "var(--accent-blue)" }}>
                          {split.elevation_difference >= 0 ? "+" : ""}
                          {Math.round(split.elevation_difference)} m
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                          {split.average_heartrate ? `${Math.round(split.average_heartrate)} bpm` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes */}
          {run.notes && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              {run.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
