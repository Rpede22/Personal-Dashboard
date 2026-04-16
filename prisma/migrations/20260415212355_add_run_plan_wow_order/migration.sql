/*
  Warnings:

  - You are about to drop the column `feel` on the `RunLog` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "RunPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "distance" REAL,
    "type" TEXT NOT NULL,
    "notes" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RunLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "distance" REAL NOT NULL,
    "duration" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_RunLog" ("createdAt", "date", "distance", "duration", "id", "notes") SELECT "createdAt", "date", "distance", "duration", "id", "notes" FROM "RunLog";
DROP TABLE "RunLog";
ALTER TABLE "new_RunLog" RENAME TO "RunLog";
CREATE TABLE "new_WowCharacter" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "realm" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'eu',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_WowCharacter" ("createdAt", "id", "name", "realm", "region") SELECT "createdAt", "id", "name", "realm", "region" FROM "WowCharacter";
DROP TABLE "WowCharacter";
ALTER TABLE "new_WowCharacter" RENAME TO "WowCharacter";
CREATE UNIQUE INDEX "WowCharacter_name_realm_region_key" ON "WowCharacter"("name", "realm", "region");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
