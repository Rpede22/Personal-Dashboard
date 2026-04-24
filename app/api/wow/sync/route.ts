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

// ── POST — sync character ─────────────────────────────────────────────────────
export async function POST(request: Request) {
  const { characterId } = await request.json();
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 });

  const char = await prisma.wowCharacter.findUnique({ where: { id: parseInt(characterId) } });
  if (!char) return NextResponse.json({ error: "Character not found" }, { status: 404 });

  // Fetch from Raider.IO — include last_crawled_at for freshness info
  const rioRes = await fetch(
    `https://raider.io/api/v1/characters/profile?region=${char.region}&realm=${encodeURIComponent(char.realm)}&name=${encodeURIComponent(char.name)}&fields=mythic_plus_recent_runs,mythic_plus_weekly_highest_level_runs,raid_progression`
  );

  if (!rioRes.ok) {
    return NextResponse.json({ error: `Raider.IO ${rioRes.status}` }, { status: 502 });
  }

  const rioData = await rioRes.json();

  // Raider.IO returns last_crawled_at in the top-level response on some endpoints
  const lastCrawledAt: string | null = rioData.last_crawled_at ?? null;

  const weekStart = currentWeekStart();
  const weekKey = weekStart.toISOString().slice(0, 10);
  // Include raid tier in key so changing tier forces a fresh baseline
  const baselineKey = `${char.name}-${char.realm}-${char.region}-${weekKey}-${CURRENT_RAID_TIER}`;

  // ── M+ runs this week ──────────────────────────────────────────────────────
  const weeklyRuns: Array<{ completed_at: string }> =
    rioData.mythic_plus_weekly_highest_level_runs ?? [];
  const recentRuns: Array<{ completed_at: string }> =
    rioData.mythic_plus_recent_runs ?? [];

  const weekStartMs = weekStart.getTime();
  const recentThisWeek = recentRuns.filter(
    (r) => new Date(r.completed_at).getTime() >= weekStartMs
  );
  const mplusCount = Math.max(weeklyRuns.length, recentThisWeek.length);

  // ── Raid boss kills THIS WEEK (delta from weekly baseline) ────────────────
  const raidProg = rioData.raid_progression as Record<
    string,
    { normal_bosses_killed: number; heroic_bosses_killed: number; mythic_bosses_killed: number; total_bosses: number }
  > | null;

  let currentNormal = 0, currentHeroic = 0, currentMythic = 0, totalBosses = 0;
  if (raidProg) {
    // Prefer the known current tier; fall back to the first available entry
    const currentTier = raidProg[CURRENT_RAID_TIER] ?? Object.values(raidProg)[0];
    if (currentTier) {
      currentNormal  = currentTier.normal_bosses_killed  ?? 0;
      currentHeroic  = currentTier.heroic_bosses_killed  ?? 0;
      currentMythic  = currentTier.mythic_bosses_killed  ?? 0;
      totalBosses    = currentTier.total_bosses ?? 9;
    }
  }

  // Load / compute baseline delta
  const baselines = loadBaseline();
  const weekBaseline = baselines[baselineKey];

  let normalKills: number, heroicKills: number, mythicKills: number;

  if (!weekBaseline) {
    // First sync this week for this tier — store current counts as baseline
    baselines[baselineKey] = {
      normalKills: currentNormal,
      heroicKills: currentHeroic,
      mythicKills: currentMythic,
      recordedAt: new Date().toISOString(),
    };
    saveBaseline(baselines);
    // Can't distinguish kills from before vs after reset — report 0 new kills
    normalKills = 0;
    heroicKills = 0;
    mythicKills = 0;
  } else {
    // Delta = kills since the reset baseline
    normalKills = Math.max(0, currentNormal - weekBaseline.normalKills);
    heroicKills = Math.max(0, currentHeroic - weekBaseline.heroicKills);
    mythicKills = Math.max(0, currentMythic - weekBaseline.mythicKills);
  }

  // ── Update checklist ───────────────────────────────────────────────────────
  let checklist = await prisma.wowChecklist.findMany({
    where: { characterId: char.id, weekStart },
  });

  // Auto-seed this week's checklist from templates if it hasn't been created yet.
  // Normally the GET /api/wow/checklist endpoint does this, but a user who syncs
  // before ever opening the checklist tab would find 0 items and nothing would tick.
  if (checklist.length === 0) {
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
  }

  const updates: { id: number; done: boolean }[] = [];

  for (const item of checklist) {
    const mplusMatch  = item.task.match(/^M\+\s+Run\s+(\d+)$/i);
    const normalMatch = item.task.match(/^Normal Boss (\d+)$/i);
    const heroicMatch = item.task.match(/^Heroic Boss (\d+)$/i);
    const mythicMatch = item.task.match(/^Mythic Boss (\d+)$/i);

    let shouldBeDone: boolean | null = null;

    if (mplusMatch)  shouldBeDone = parseInt(mplusMatch[1])  <= mplusCount;
    if (normalMatch) shouldBeDone = parseInt(normalMatch[1]) <= normalKills;
    if (heroicMatch) shouldBeDone = parseInt(heroicMatch[1]) <= heroicKills;
    if (mythicMatch) shouldBeDone = parseInt(mythicMatch[1]) <= mythicKills;

    if (shouldBeDone !== null && item.done !== shouldBeDone) {
      updates.push({ id: item.id, done: shouldBeDone });
    }
  }

  for (const u of updates) {
    await prisma.wowChecklist.update({ where: { id: u.id }, data: { done: u.done } });
  }

  // Warn if RIO data is stale (crawled >2 hours ago)
  const crawledMs = lastCrawledAt ? new Date(lastCrawledAt).getTime() : null;
  const staleData = crawledMs !== null && (Date.now() - crawledMs) > 2 * 60 * 60 * 1000;

  return NextResponse.json({
    ok: true,
    character: char.name,
    firstSync: !weekBaseline,
    raidTier: CURRENT_RAID_TIER,
    lastCrawledAt,
    staleData,
    checklistSeeded: checklist.length > 0,
    synced: { mplusCount, normalKills, heroicKills, mythicKills, totalBosses },
    updated: updates.length,
  });
}

// ── DELETE — reset baseline for a character this week ─────────────────────────
// Use when baseline was set before you raided (e.g. after fixing the tier constant).
// After reset, sync immediately → new baseline = 0; sync after raiding → correct delta.
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
