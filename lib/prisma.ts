import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

// In production (packaged Electron app), DATABASE_PATH is set by the main process
// pointing to ~/Library/Application Support/Dashboard/dashboard.db
// In dev, fall back to ./dev.db in the project root
function getDbUrl(): string {
  if (process.env.DATABASE_PATH) {
    return `file:${process.env.DATABASE_PATH}`;
  }
  return `file:${path.join(process.cwd(), "dev.db")}`;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: getDbUrl() });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
