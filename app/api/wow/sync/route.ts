import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const BASELINE_PATH = path.join(process.cwd(), ".wow-raid-baseline.json");

// ── Current raid tier ─────────────────────────────────────────────────────────
// Update this slug when a new tier releases.
// Raider.IO slug format: e.g. "liberation-of-undermine", "nerub-ar-palace",
// "tier-mn-1" (Midnight Season 1 — 3 raids combined: Dreamrift + Voidspire + March on Quel'Danas, 9 bosses total)
const CURRENT_RAID_TIER = "tier-mn-1";

// Blizzard API instance names (en_US) for the current tier — used to filter encounters/raids response
// to only the correct raids. If none match (tier not in API yet), Blizzard path returns null → RIO fallback.
// Update alongside CURRENT_RAID_TIER.
const CURRENT_TIER_INSTANCES = ["Dreamrift", "Voidspire", "March on Quel'Danas"];

// Total boss count for the current tier (all difficulties share the same encounters).
const CURRENT_TIER_BOSS_COUNT = 9;

interface RaidBaselineEntry {
  normalKills: number;
  heroicKills: number;
  mythicKills: number;
  recordedAt: string;
}
interface RaidBaseline {
  // Key format: "{charName}-{realm}-{region}-{weekStart}-{raidTier}"
  [key: string]: RaidBaselineEntry;
}

function loadBaseline(): RaidBaseline {
  try { return JSON.parse(readFileSync(BASELINE_PATH, "utf-8")); }
  catch { return {}; }
}

function saveBaseline(data: RaidBaseline) {
  writeFileSync(BASELINE_PATH, JSON.stringify(data, null, 2));
}

function currentWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 3=Wed
  const daysSinceWed = (day - 3 + 7) % 7;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysSinceWed);
  weekStart.setUTCHours(6, 0, 0, 0);
  return weekStart;
}

// ── Blizzard API — per-boss kill detection ────────────────────────────────────
// Uses client_credentials grant (no user login required). Set BLIZZARD_CLIENT_ID
// and BLIZZARD_CLIENT_SECRET in .env.local. Register at develop.battle.net.
// Provides accurate per-boss kill timestamps for the current week reset.
let _blizzardToken: { token: string; expiresAt: number } | null = null;

async function getBlizzardToken(region: string): Promise<string | null> {
  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (_blizzardToken && Date.now() < _blizzardToken.expiresAt) return _blizzardToken.token;

  try {
    const res = await fetch(`https://${region.toLowerCase()}.battle.net/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = await res.json();
    _blizzardToken = {
      token: data.access_token,
      // Cache for 5 min less than the actual TTL to avoid edge-case expiry mid-request
      expiresAt: Date.now() + Math.max(0, (data.expires_in - 300)) * 1000,
    };
    return _blizzardToken.token;
  } catch { return null; }
}

interface PerBoss {
  normal: boolean[]; // index = boss position (0-based), true = killed this reset
  heroic: boolean[];
  mythic: boolean[];
}

interface BlizzardRaidResult {
  normalKills: number;
  heroicKills: number;
  mythicKills: number;
  totalBosses: number;
  perBoss: PerBoss;
  instanceNames: string[]; // debug: order in which instances were found + processed
}

async function fetchRaidKillsFromBlizzard(
  char: { name: string; realm: string; region: string },
  weekStart: Date
): Promise<BlizzardRaidResult | null> {
  const region = char.region.toLowerCase();
  const token = await getBlizzardToken(region);
  if (!token) return null;

  // Blizzard realm slug: lowercase, no apostrophes, spaces → hyphens
  const realmSlug = char.realm.toLowerCase().replace(/'/g, "").replace(/\s+/g, "-");
  const charName = char.name.toLowerCase();
  const weekStartMs = weekStart.getTime();

  try {
    const url =
      `https://${region}.api.blizzard.com/profile/wow/character/` +
      `${encodeURIComponent(realmSlug)}/${encodeURIComponent(charName)}/encounters/raids` +
      `?namespace=profile-${region}&locale=en_US`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();

    const expansions: Array<unknown> = data.expansions ?? [];
    if (expansions.length === 0) return null;

    // Search ALL expansions for instances matching the current tier's known raid names.
    // This handles both "same expansion" and "new expansion" API structures.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchedInstances: Array<any> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const expansion of expansions as Array<any>) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const inst of (expansion.instances ?? []) as Array<any>) {
        const instName: string = inst.instance?.name ?? "";
        if (CURRENT_TIER_INSTANCES.some(n =>
          instName.toLowerCase().includes(n.toLowerCase())
        )) {
          matchedInstances.push(inst);
        }
      }
    }

    // If no matching instances found, the current tier raids aren't in the Blizzard
    // encounters API yet (e.g., Midnight raids not released in API while TWW data is
    // still returned). Return null → caller falls back to RIO baseline.
    if (matchedInstances.length === 0) return null;

    // Sort instances by the defined tier order so boss indices 0-N are always consistent,
    // regardless of the order the Blizzard API returns them.
    matchedInstances.sort((a, b) => {
      const nameA: string = (a.instance?.name ?? "").toLowerCase();
      const nameB: string = (b.instance?.name ?? "").toLowerCase();
      const idxA = CURRENT_TIER_INSTANCES.findIndex((n) => nameA.includes(n.toLowerCase()));
      const idxB = CURRENT_TIER_INSTANCES.findIndex((n) => nameB.includes(n.toLowerCase()));
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });

    // Deduplicate — the Blizzard API returns the same raid instance once per expansion entry,
    // so searching all expansions collects duplicates. Keep only the first occurrence of each name.
    const _seenInstances = new Set<string>();
    const uniqueInstances = matchedInstances.filter((inst) => {
      const name: string = (inst.instance?.name ?? "").toLowerCase();
      if (_seenInstances.has(name)) return false;
      _seenInstances.add(name);
      return true;
    });

    // Collect per-boss kill booleans across unique instances in tier order
    const normal: boolean[] = [];
    const heroic: boolean[] = [];
    const mythic: boolean[] = [];

    for (const instance of uniqueInstances) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const mode of (instance.modes ?? []) as Array<any>) {
        const diffType: string = mode.difficulty?.type ?? "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const encounters: Array<any> = mode.progress?.encounters ?? [];

        const target =
          diffType === "NORMAL" ? normal :
          diffType === "HEROIC" ? heroic :
          diffType === "MYTHIC" ? mythic : null;

        if (!target) continue;

        for (const enc of encounters) {
          // last_kill_timestamp is in ms; if >= weekStart this boss was killed this reset
          const killedThisWeek =
            typeof enc.last_kill_timestamp === "number" &&
            enc.last_kill_timestamp >= weekStartMs;
          target.push(killedThisWeek);
        }
      }
    }

    // Cap arrays to exactly CURRENT_TIER_BOSS_COUNT — the Blizzard API sometimes
    // returns extra encounters (e.g. a 10th entry) that don't exist in our checklist.
    const cNormal = normal.slice(0, CURRENT_TIER_BOSS_COUNT);
    const cHeroic = heroic.slice(0, CURRENT_TIER_BOSS_COUNT);
    const cMythic = mythic.slice(0, CURRENT_TIER_BOSS_COUNT);

    return {
      normalKills: cNormal.filter(Boolean).length,
      heroicKills: cHeroic.filter(Boolean).length,
      mythicKills: cMythic.filter(Boolean).length,
      totalBosses: CURRENT_TIER_BOSS_COUNT,
      perBoss: { normal: cNormal, heroic: cHeroic, mythic: cMythic },
      instanceNames: uniqueInstances.map((i) => i.instance?.name ?? "unknown"),
    };
  } catch { return null; }
}

// ── POST — sync character ─────────────────────────────────────────────────────
export async function POST(request: Request) {
  const { characterId } = await request.json();
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 });

  const char = await prisma.wowCharacter.findUnique({ where: { id: parseInt(characterId) } });
  if (!char) return NextResponse.json({ error: "Character not found" }, { status: 404 });

  // ── Fetch from Raider.IO — M+ runs + raid progression (fallback) ───────────
  const rioRes = await fetch(
    `https://raider.io/api/v1/characters/profile?region=${char.region}&realm=${encodeURIComponent(char.realm)}&name=${encodeURIComponent(char.name)}&fields=mythic_plus_recent_runs,mythic_plus_weekly_highest_level_runs,raid_progression`
  );

  if (!rioRes.ok) {
    return NextResponse.json({ error: `Raider.IO ${rioRes.status}` }, { status: 502 });
  }

  const rioData = await rioRes.json();
  const lastCrawledAt: string | null = rioData.last_crawled_at ?? null;

  const weekStart = currentWeekStart();
  const weekKey = weekStart.toISOString().slice(0, 10);

  // ── M+ runs this week (always from RIO) ───────────────────────────────────
  const weeklyRuns: Array<{ completed_at: string }> =
    rioData.mythic_plus_weekly_highest_level_runs ?? [];
  const recentRuns: Array<{ completed_at: string }> =
    rioData.mythic_plus_recent_runs ?? [];

  const weekStartMs = weekStart.getTime();
  const recentThisWeek = recentRuns.filter(
    (r) => new Date(r.completed_at).getTime() >= weekStartMs
  );
  const mplusCount = Math.max(weeklyRuns.length, recentThisWeek.length);

  // ── Raid boss kills THIS WEEK ──────────────────────────────────────────────
  // Primary: Blizzard API (per-boss kill timestamps, no baseline needed)
  // Fallback: RIO baseline delta (requires sync before raiding to set baseline)
  const blizzardKills = await fetchRaidKillsFromBlizzard(char, weekStart);

  let normalKills: number, heroicKills: number, mythicKills: number, totalBosses: number;
  let perBoss: PerBoss | null = null;
  let raidDataSource: "blizzard" | "raider-io-baseline";

  if (blizzardKills) {
    // ── Blizzard path (preferred) ──────────────────────────────────────────
    normalKills  = blizzardKills.normalKills;
    heroicKills  = blizzardKills.heroicKills;
    mythicKills  = blizzardKills.mythicKills;
    totalBosses  = blizzardKills.totalBosses;
    perBoss      = blizzardKills.perBoss;
    raidDataSource = "blizzard";
  } else {
    // ── RIO baseline fallback ──────────────────────────────────────────────
    raidDataSource = "raider-io-baseline";
    const baselineKey = `${char.name}-${char.realm}-${char.region}-${weekKey}-${CURRENT_RAID_TIER}`;

    const raidProg = rioData.raid_progression as Record<
      string,
      { normal_bosses_killed: number; heroic_bosses_killed: number; mythic_bosses_killed: number; total_bosses: number }
    > | null;

    let currentNormal = 0, currentHeroic = 0, currentMythic = 0;
    totalBosses = CURRENT_TIER_BOSS_COUNT;
    if (raidProg) {
      const currentTier = raidProg[CURRENT_RAID_TIER] ?? Object.values(raidProg)[0];
      if (currentTier) {
        currentNormal  = currentTier.normal_bosses_killed  ?? 0;
        currentHeroic  = currentTier.heroic_bosses_killed  ?? 0;
        currentMythic  = currentTier.mythic_bosses_killed  ?? 0;
        totalBosses    = CURRENT_TIER_BOSS_COUNT; // use known count, not RIO's total_bosses
      }
    }

    const baselines = loadBaseline();
    const weekBaseline = baselines[baselineKey];

    if (!weekBaseline) {
      baselines[baselineKey] = {
        normalKills: currentNormal,
        heroicKills: currentHeroic,
        mythicKills: currentMythic,
        recordedAt: new Date().toISOString(),
      };
      saveBaseline(baselines);
      normalKills = 0;
      heroicKills = 0;
      mythicKills = 0;
    } else {
      normalKills = Math.max(0, currentNormal - weekBaseline.normalKills);
      heroicKills = Math.max(0, currentHeroic - weekBaseline.heroicKills);
      mythicKills = Math.max(0, currentMythic - weekBaseline.mythicKills);
    }
  }

  // ── Update checklist ───────────────────────────────────────────────────────
  let checklist = await prisma.wowChecklist.findMany({
    where: { characterId: char.id, weekStart },
  });

  // Always sync checklist with current templates — adds missing tasks without touching ticked ones.
  // Handles mid-week template changes (e.g. boss count update) and first-load seeding.
  const templates = await prisma.wowChecklistTemplate.findMany();
  if (templates.length > 0) {
    for (const t of templates) {
      await prisma.wowChecklist.upsert({
        where: { characterId_weekStart_task: { characterId: char.id, weekStart, task: t.task } },
        update: {},
        create: { characterId: char.id, weekStart, task: t.task, done: false },
      });
    }
    checklist = await prisma.wowChecklist.findMany({ where: { characterId: char.id, weekStart } });
  }

  const updates: { id: number; done: boolean }[] = [];

  for (const item of checklist) {
    const mplusMatch  = item.task.match(/^M\+\s+Run\s+(\d+)$/i);
    const normalMatch = item.task.match(/^Normal Boss (\d+)$/i);
    const heroicMatch = item.task.match(/^Heroic Boss (\d+)$/i);
    const mythicMatch = item.task.match(/^Mythic Boss (\d+)$/i);

    let shouldBeDone: boolean | null = null;

    if (mplusMatch) shouldBeDone = parseInt(mplusMatch[1]) <= mplusCount;

    if (perBoss) {
      // Blizzard: per-boss accuracy — each boss tracked individually by position
      if (normalMatch) {
        const idx = parseInt(normalMatch[1]) - 1; // checklist is 1-indexed
        shouldBeDone = idx < perBoss.normal.length ? perBoss.normal[idx] : false;
      }
      if (heroicMatch) {
        const idx = parseInt(heroicMatch[1]) - 1;
        shouldBeDone = idx < perBoss.heroic.length ? perBoss.heroic[idx] : false;
      }
      if (mythicMatch) {
        const idx = parseInt(mythicMatch[1]) - 1;
        shouldBeDone = idx < perBoss.mythic.length ? perBoss.mythic[idx] : false;
      }
    } else {
      // RIO fallback: count-based (bosses 1-N are marked done up to kill count)
      if (normalMatch) shouldBeDone = parseInt(normalMatch[1]) <= normalKills;
      if (heroicMatch) shouldBeDone = parseInt(heroicMatch[1]) <= heroicKills;
      if (mythicMatch) shouldBeDone = parseInt(mythicMatch[1]) <= mythicKills;
    }

    if (shouldBeDone !== null && item.done !== shouldBeDone) {
      updates.push({ id: item.id, done: shouldBeDone });
    }
  }

  for (const u of updates) {
    await prisma.wowChecklist.update({ where: { id: u.id }, data: { done: u.done } });
  }

  // Warn if RIO data is stale (crawled >2 hours ago) — only relevant for RIO path
  const crawledMs = lastCrawledAt ? new Date(lastCrawledAt).getTime() : null;
  const staleData = raidDataSource === "raider-io-baseline" &&
    crawledMs !== null && (Date.now() - crawledMs) > 2 * 60 * 60 * 1000;

  return NextResponse.json({
    ok: true,
    character: char.name,
    raidTier: CURRENT_RAID_TIER,
    raidDataSource,
    lastCrawledAt,
    staleData,
    checklistSeeded: checklist.length > 0,
    synced: { mplusCount, normalKills, heroicKills, mythicKills, totalBosses },
    updated: updates.length,
    // Debug — shows exactly what Blizzard reported so boss-mapping issues can be diagnosed.
    // perBoss arrays are 0-indexed: index 0 = checklist box 1, etc.
    blizzardDebug: blizzardKills
      ? { instanceOrder: blizzardKills.instanceNames, perBoss: blizzardKills.perBoss }
      : null,
  });
}

// ── DELETE — reset RIO baseline for a character this week ─────────────────────
// Only needed when using the RIO-baseline fallback (no Blizzard credentials).
// With Blizzard credentials configured this is unnecessary.
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const characterId = searchParams.get("characterId");
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 });

  const char = await prisma.wowCharacter.findUnique({ where: { id: parseInt(characterId) } });
  if (!char) return NextResponse.json({ error: "Character not found" }, { status: 404 });

  const weekStart = currentWeekStart();
  const weekKey = weekStart.toISOString().slice(0, 10);
  const baselineKey = `${char.name}-${char.realm}-${char.region}-${weekKey}-${CURRENT_RAID_TIER}`;

  const baselines = loadBaseline();
  delete baselines[baselineKey];
  saveBaseline(baselines);

  return NextResponse.json({ ok: true, character: char.name, clearedKey: baselineKey });
}
