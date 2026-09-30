import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
// Single source of truth for the current tier — see lib/wow-tier.ts. Imported
// directly (relative) because the seed runner doesn't share the `@/` alias.
import tier from "../wow-tier.json";

const DB_URL = `file:${path.join(process.cwd(), "dev.db")}`;
const adapter = new PrismaBetterSqlite3({ url: DB_URL });
const prisma = new PrismaClient({ adapter });

// 8 individual M+ dungeon run slots
const MPLUS_TASKS = Array.from({ length: 8 }, (_, i) => ({
  task: `M+ Run ${i + 1}`,
  isDefault: true,
}));

// Boss kills per difficulty for the current tier. Count comes from wow-tier.json
// (Midnight S1 = 3 raids combined into a single 1–N grid per difficulty, as RIO
// reports them under one tier key with a combined total_bosses).
const BOSS_COUNT = tier.bossCount;
const BOSS_TASKS = [
  ...Array.from({ length: BOSS_COUNT }, (_, i) => ({ task: `Normal Boss ${i + 1}`, isDefault: true })),
  ...Array.from({ length: BOSS_COUNT }, (_, i) => ({ task: `Heroic Boss ${i + 1}`, isDefault: true })),
  ...Array.from({ length: BOSS_COUNT }, (_, i) => ({ task: `Mythic Boss ${i + 1}`, isDefault: true })),
];

const DEFAULT_WOW_TASKS = [...MPLUS_TASKS, ...BOSS_TASKS];

async function main() {
  // Clear old templates and re-seed fresh
  await prisma.wowChecklistTemplate.deleteMany();
  for (const template of DEFAULT_WOW_TASKS) {
    await prisma.wowChecklistTemplate.create({ data: template });
  }
  console.log(
    `Seeded ${DEFAULT_WOW_TASKS.length} WoW checklist templates (8 M+ runs + ${BOSS_COUNT * 3} boss kills — ${BOSS_COUNT} per difficulty, Midnight S1).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
