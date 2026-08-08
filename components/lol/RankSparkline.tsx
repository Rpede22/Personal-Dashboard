"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cdragonRankedEmblem } from "@/lib/riot";

interface Point {
  t: number;
  lp: number;
  tier: string;
  division: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

interface Data { queues: Record<string, Point[]> }

const QUEUE_LABEL: Record<string, string> = {
  RANKED_SOLO_5x5: "Solo/Duo",
  RANKED_FLEX_SR: "Flex",
};

// Tier ladder anchors — matches rankToLadderPoints in lib/rank-history.ts.
// Each entry is the LP-equivalent at the *bottom* of a tier (division IV, 0 LP).
const TIER_ANCHORS: Array<{ tier: string; lp: number }> = [
  { tier: "IRON",       lp: 0 },
  { tier: "BRONZE",     lp: 400 },
  { tier: "SILVER",     lp: 800 },
  { tier: "GOLD",       lp: 1200 },
  { tier: "PLATINUM",   lp: 1600 },
  { tier: "EMERALD",    lp: 2000 },
  { tier: "DIAMOND",    lp: 2400 },
  { tier: "MASTER",     lp: 2800 },
];

const W = 300;
const H = 180;
const PAD_LEFT = 40;   // room for tier icons on Y-axis
const PAD_RIGHT = 8;
const PAD_Y = 14;

/**
 * LP-trend chart per queue for one LoL account, rendered in the LoL Hub
 * sidebar under the accounts list. Larger than the old sparkline: shows 30d
 * and 7d deltas as pills at the top, tier-emblem icons on the Y-axis at the
 * visible tier boundaries, and a smooth gradient line + area fill.
 */
export default function RankSparkline({ accountId }: { accountId: number }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lol/rank-history?accountId=${accountId}&days=60`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ queues: {} }); });
    return () => { cancelled = true; };
  }, [accountId]);

  const queues = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.queues)
      .filter(([, pts]) => pts.length >= 2)
      .sort(([a], [b]) => (a === "RANKED_SOLO_5x5" ? -1 : b === "RANKED_SOLO_5x5" ? 1 : 0));
  }, [data]);

  if (!data) return null;
  if (queues.length === 0) {
    return (
      <div className="text-xs px-3 py-3 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
        Rank history builds up over time — check back in a few days.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {queues.map(([queueType, points]) => (
        <RankChart key={queueType} label={QUEUE_LABEL[queueType] ?? queueType} points={points} />
      ))}
    </div>
  );
}

function pickDelta(points: Point[], windowMs: number): { delta: number; hasWindow: boolean } {
  if (points.length < 2) return { delta: 0, hasWindow: false };
  const last = points[points.length - 1];
  const cutoff = last.t - windowMs;
  // First point at or after cutoff — that's the "start" of the window.
  const startIdx = points.findIndex((p) => p.t >= cutoff);
  if (startIdx < 0) return { delta: 0, hasWindow: false };
  const start = points[startIdx];
  return { delta: last.lp - start.lp, hasWindow: startIdx > 0 || points[0].t >= cutoff };
}

function DeltaPill({ label, delta, hasWindow }: { label: string; delta: number; hasWindow: boolean }) {
  if (!hasWindow) {
    return (
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {label} <span style={{ color: "var(--text)" }}>—</span>
      </span>
    );
  }
  const up = delta > 0;
  const down = delta < 0;
  const color = up ? "var(--accent-green)" : down ? "var(--accent-red)" : "var(--text-muted)";
  const arrow = up ? "▲" : down ? "▼" : "•";
  return (
    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
      {label}{" "}
      <span className="font-semibold" style={{ color }}>{arrow} {delta > 0 ? "+" : ""}{delta} LP</span>
    </span>
  );
}

/** Smoothed monotone path — quadratic through midpoints so peaks aren't cusps. */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    d += ` Q ${p0.x.toFixed(1)} ${p0.y.toFixed(1)}, ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  d += ` T ${pts[pts.length - 1].x.toFixed(1)} ${pts[pts.length - 1].y.toFixed(1)}`;
  return d;
}

function tierShort(tier: string, division: string): string {
  const t = tier.slice(0, 1).toUpperCase() + tier.slice(1).toLowerCase();
  return tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER" ? t : `${t} ${division}`;
}

function formatDay(t: number): string {
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function RankChart({ label, points }: { label: string; points: Point[] }) {
  const gradId = useId();
  const areaGradId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const lps = points.map((p) => p.lp);
  const rawMin = Math.min(...lps);
  const rawMax = Math.max(...lps);
  // Pad the Y range so peaks aren't at the very top/bottom edge.
  const pad = Math.max(30, (rawMax - rawMin) * 0.15);
  const minLp = Math.max(0, rawMin - pad);
  const maxLp = rawMax + pad;
  const range = Math.max(1, maxLp - minLp);
  const t0 = points[0].t;
  const tN = points[points.length - 1].t;
  const tRange = Math.max(1, tN - t0);

  const xAt = (t: number) => PAD_LEFT + ((t - t0) / tRange) * (W - PAD_LEFT - PAD_RIGHT);
  const yAt = (lp: number) => H - PAD_Y - ((lp - minLp) / range) * (H - PAD_Y * 2);

  const svgPts = points.map((p) => ({ x: xAt(p.t), y: yAt(p.lp) }));
  const linePath = smoothPath(svgPts);
  const areaPath = `${linePath} L ${xAt(tN).toFixed(1)} ${H - PAD_Y} L ${xAt(t0).toFixed(1)} ${H - PAD_Y} Z`;

  // Which tier anchors are visible? Draw an icon + gridline for each.
  const visibleTiers = TIER_ANCHORS.filter((a) => a.lp >= minLp - 200 && a.lp <= maxLp + 200);

  const first = points[0];
  const last = points[points.length - 1];
  const trendUp = last.lp >= first.lp;
  // Two-stop gradient — brighter at the recent end.
  const stopA = trendUp ? "var(--accent-green)" : "var(--accent-red)";
  const stopB = trendUp ? "var(--accent-cyan)" : "var(--accent-orange)";

  const d30 = pickDelta(points, 30 * 86400000);
  const d7  = pickDelta(points, 7 * 86400000);

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</span>
        <div className="flex items-center gap-3">
          <DeltaPill label="Last 30d" delta={d30.delta} hasWindow={d30.hasWindow} />
          <DeltaPill label="Last 7d" delta={d7.delta} hasWindow={d7.hasWindow} />
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        style={{ display: "block", cursor: "crosshair" }}
        onMouseMove={(e) => {
          const svg = svgRef.current;
          if (!svg) return;
          const rect = svg.getBoundingClientRect();
          // Convert client px → viewBox coords (preserveAspectRatio=none stretches x).
          const vx = ((e.clientX - rect.left) / rect.width) * W;
          // Nearest point by x.
          let bestIdx = 0;
          let bestDx = Infinity;
          for (let i = 0; i < svgPts.length; i++) {
            const dx = Math.abs(svgPts[i].x - vx);
            if (dx < bestDx) { bestDx = dx; bestIdx = i; }
          }
          setHoverIdx(bestIdx);
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={stopA} />
            <stop offset="100%" stopColor={stopB} />
          </linearGradient>
          <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={stopA} stopOpacity="0.30" />
            <stop offset="100%" stopColor={stopA} stopOpacity="0.00" />
          </linearGradient>
        </defs>

        {/* Tier gridlines + icons */}
        {visibleTiers.map((a) => {
          const y = yAt(a.lp);
          if (y < PAD_Y / 2 || y > H - PAD_Y / 2) return null;
          return (
            <g key={a.tier}>
              <line x1={PAD_LEFT - 2} y1={y} x2={W - PAD_RIGHT} y2={y} stroke="var(--border)" strokeWidth={0.6} strokeDasharray="2 4" opacity={0.6} />
              <image
                href={cdragonRankedEmblem(a.tier)}
                x={0}
                y={y - 14}
                width={28}
                height={28}
                preserveAspectRatio="xMidYMid meet"
              />
            </g>
          );
        })}

        {/* Area fill + line */}
        <path d={areaPath} fill={`url(#${areaGradId})`} />
        <path d={linePath} fill="none" stroke={`url(#${gradId})`} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Hover guide + focus dot + tooltip */}
        {hoverIdx !== null && (() => {
          const p = points[hoverIdx];
          const x = svgPts[hoverIdx].x;
          const y = svgPts[hoverIdx].y;
          const boxW = 120;
          const boxH = 44;
          // Flip left if near right edge so the tooltip stays inside the chart.
          const flip = x + boxW + 8 > W - PAD_RIGHT;
          const boxX = flip ? x - boxW - 8 : x + 8;
          const boxY = Math.max(2, Math.min(H - boxH - 2, y - boxH / 2));
          const wl = `${p.wins}W ${p.losses}L`;
          return (
            <g pointerEvents="none">
              <line x1={x} y1={PAD_Y} x2={x} y2={H - PAD_Y} stroke="var(--text-muted)" strokeWidth={0.7} strokeDasharray="3 3" opacity={0.6} />
              <circle cx={x} cy={y} r={3.5} fill="var(--text)" stroke={`url(#${gradId})`} strokeWidth={1.5} />
              <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={5} fill="var(--surface-2)" stroke="var(--border)" strokeWidth={0.7} opacity={0.98} />
              <text x={boxX + 8} y={boxY + 14} fontSize={10} fill="var(--text-muted)">{formatDay(p.t)}</text>
              <text x={boxX + 8} y={boxY + 27} fontSize={11} fontWeight={600} fill="var(--text)">
                {tierShort(p.tier, p.division)} · {p.leaguePoints} LP
              </text>
              <text x={boxX + 8} y={boxY + 39} fontSize={10} fill="var(--text-muted)">{wl}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
