import { prisma } from "@/lib/prisma";
import { CURRENT_TIER_BOSS_COUNT } from "@/lib/wow-tier";

const MPLUS_RUNS = 8;

/**
 * The checklist templates the current tier should have: 8 M+ runs + N bosses ×
 * 3 difficulties (N from wow-tier.json). The seed creates these on a fresh DB,
 * but an existing user's DB keeps whatever count it was seeded with — so when a
 * boss is added mid-season (bossCount 9 → 10) the new "Boss 10" rows never
 * appear. Both the checklist + sync routes call this to upsert the expected
 * rows by their unique `task` before reading them, creating any that are
 * missing without touching the user's ticks.
 */
export function expectedWowTemplateTasks(): string[] {
  const tasks: string[] = [];
  for (let i = 1; i <= MPLUS_RUNS; i++) tasks.push(`M+ Run ${i}`);
  for (const diff of ["Normal", "Heroic", "Mythic"]) {
    for (let i = 1; i <= CURRENT_TIER_BOSS_COUNT; i++) tasks.push(`${diff} Boss ${i}`);
  }
  return tasks;
}

let lastEnsured = 0;
const ENSURE_TTL = 60 * 1000; // at most once a minute per server process

export async function ensureWowTemplates(): Promise<void> {
  // Cheap guard so we don't run a dozen upserts on every checklist poll.
  if (Date.now() - lastEnsured < ENSURE_TTL) return;
  try {
    const existing = new Set((await prisma.wowChecklistTemplate.findMany({ select: { task: true } })).map((t) => t.task));
    const missing = expectedWowTemplateTasks().filter((task) => !existing.has(task));
    for (const task of missing) {
      await prisma.wowChecklistTemplate.upsert({
        where: { task },
        update: {},
        create: { task, isDefault: true },
      });
    }
    lastEnsured = Date.now();
  } catch {
    /* best-effort — the route still works off whatever templates exist */
  }
}
