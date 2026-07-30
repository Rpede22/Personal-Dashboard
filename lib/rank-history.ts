import { prisma } from "@/lib/prisma";

const TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] as const;
const DIV_ORDER: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 };

/**
 * Convert a Riot rank into a single LP-equivalent number so sparklines can
 * plot a monotonic ladder. IRON IV 0 LP = 0, DIAMOND IV 0 LP = 2400,
 * MASTER 0 LP = 2800, and above master `leaguePoints` accumulate on top.
 */
export function rankToLadderPoints(tier: string, division: string, leaguePoints: number): number {
  const tIdx = TIER_ORDER.indexOf(tier.toUpperCase() as (typeof TIER_ORDER)[number]);
  if (tIdx < 0) return leaguePoints;
  if (tIdx >= 7) {
    // Master / GM / Challenger share the ladder above Diamond I.
    return 2800 + leaguePoints;
  }
  const dIdx = DIV_ORDER[division?.toUpperCase()] ?? 0;
  return tIdx * 400 + dIdx * 100 + leaguePoints;
}

interface RankEntry {
  queueType: string;
  tier: string;
  rank: string; // Riot uses "rank" for the roman-numeral division
  leaguePoints: number;
  wins: number;
  losses: number;
}

const MIN_SNAPSHOT_GAP_MS = 6 * 60 * 60 * 1000; // 6 h — keep the table sparse

/**
 * Persist a rank snapshot for each ranked queue if the most recent snapshot
 * for that (account, queue) is older than MIN_SNAPSHOT_GAP_MS. Silent on error
 * — never blocks the caller's response.
 */
export async function snapshotRanksIfDue(accountId: number, ranks: RankEntry[]): Promise<void> {
  try {
    for (const r of ranks) {
      const last = await prisma.lolRankSnapshot.findFirst({
        where: { accountId, queueType: r.queueType },
        orderBy: { capturedAt: "desc" },
      });
      if (last && Date.now() - last.capturedAt.getTime() < MIN_SNAPSHOT_GAP_MS) continue;
      await prisma.lolRankSnapshot.create({
        data: {
          accountId,
          queueType: r.queueType,
          tier: r.tier,
          division: r.rank ?? "",
          leaguePoints: r.leaguePoints,
          wins: r.wins,
          losses: r.losses,
        },
      });
    }
  } catch { /* ignore — snapshots are best-effort */ }
}
