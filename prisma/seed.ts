import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const DB_URL = `file:${path.join(process.cwd(), "dev.db")}`;
const adapter = new PrismaBetterSqlite3({ url: DB_URL });
const prisma = new PrismaClient({ adapter });

// 8 individual M+ dungeon run slots — displayed as a grid of 8 tick-boxes in the UI
const DEFAULT_WOW_TASKS = Array.from({ length: 8 }, (_, i) => ({
  task: `M+ Run ${i + 1}`,
  isDefault: true,
}));

async function main() {
  // Clear old templates and re-seed fresh
  await prisma.wowChecklistTemplate.deleteMany();
  for (const template of DEFAULT_WOW_TASKS) {
    await prisma.wowChecklistTemplate.create({ data: template });
  }
  console.log("Seeded WoW checklist templates (8 M+ runs).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
