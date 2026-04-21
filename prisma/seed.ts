import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const DB_URL = `file:${path.join(process.cwd(), "dev.db")}`;
const adapter = new PrismaBetterSqlite3({ url: DB_URL });
const prisma = new PrismaClient({ adapter });

// 8 individual M+ dungeon run slots
const MPLUS_TASKS = Array.from({ length: 8 }, (_, i) => ({
  task: `M+ Run ${i + 1}`,
  isDefault: true,
}));

// 9 boss kills per difficulty (Midnight Season 1 — 3 raids combined: Dreamrift + Voidspire + March on Quel'Danas = 9 bosses)
// RIO reports them under a single tier key `tier-mn-1` with total_bosses=9, so we track them as a single 1–9 grid per difficulty.
const BOSS_COUNT = 9;
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
