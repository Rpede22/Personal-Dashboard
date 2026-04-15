import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const DB_URL = `file:${path.join(process.cwd(), "dev.db")}`;
const adapter = new PrismaBetterSqlite3({ url: DB_URL });
const prisma = new PrismaClient({ adapter });

const DEFAULT_WOW_TASKS = [
  { task: "Great Vault", isDefault: true },
  { task: "Mythic+ Key (x8)", isDefault: true },
  { task: "Raid — Normal", isDefault: true },
  { task: "Raid — Heroic", isDefault: true },
  { task: "World Bosses", isDefault: true },
  { task: "Delves (Tier 8+)", isDefault: true },
  { task: "Conquest Cap", isDefault: true },
];

async function main() {
  for (const template of DEFAULT_WOW_TASKS) {
    await prisma.wowChecklistTemplate.upsert({
      where: { task: template.task },
      update: {},
      create: template,
    });
  }
  console.log("Seeded WoW checklist templates.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
