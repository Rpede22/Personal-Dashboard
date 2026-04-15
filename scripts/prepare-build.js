/**
 * Prepare the Next.js standalone build for Electron packaging.
 *
 * Next.js standalone output doesn't copy static files automatically.
 * This script:
 *   1. Copies .next/static → .next/standalone/.next/static
 *   2. Copies public/       → .next/standalone/public
 *   3. Runs the DB migration on a fresh seed.db for first-run installs
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");

// 1. Copy static assets into standalone so the server can serve them
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[prepare-build] Warning: ${src} not found, skipping`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("[prepare-build] Copying static files into standalone...");
copyDir(
  path.join(root, ".next", "static"),
  path.join(root, ".next", "standalone", ".next", "static")
);
copyDir(
  path.join(root, "public"),
  path.join(root, ".next", "standalone", "public")
);
console.log("[prepare-build] Static files copied.");

// 2. Replace the standalone's package.json with a minimal stub.
//    Next.js copies the full project package.json into standalone, which causes
//    electron-builder to try to rebuild native deps (better-sqlite3) and fail.
const standalonePackageJson = path.join(root, ".next", "standalone", "package.json");
fs.writeFileSync(
  standalonePackageJson,
  JSON.stringify({ name: "dashboard-server", version: "1.0.0", private: true }, null, 2)
);
console.log("[prepare-build] Replaced standalone package.json with minimal stub.");

// 3. Remove Prisma-generated hashed module directories from the nested
//    .next/node_modules inside standalone — these are metadata artifacts with
//    no binaries that confuse electron-builder's signing step.
const nestedNodeModules = path.join(root, ".next", "standalone", ".next", "node_modules");
if (fs.existsSync(nestedNodeModules)) {
  fs.rmSync(nestedNodeModules, { recursive: true, force: true });
  console.log("[prepare-build] Removed standalone/.next/node_modules (Prisma artifacts).");
}

// 2. Create a seeded database for first-run distribution
const buildResourcesDir = path.join(root, "build-resources");
fs.mkdirSync(buildResourcesDir, { recursive: true });

const seedDbPath = path.join(buildResourcesDir, "seed.db");

// Copy current dev.db as the seed (includes WoW default checklist templates)
const devDbPath = path.join(root, "dev.db");
if (fs.existsSync(devDbPath)) {
  fs.copyFileSync(devDbPath, seedDbPath);
  console.log("[prepare-build] Seed database copied from dev.db");
} else {
  // No dev.db yet — run migration to create a fresh one
  console.log("[prepare-build] No dev.db found, creating fresh seed database...");
  execSync(`DATABASE_URL="file:${seedDbPath}" npx prisma migrate deploy`, {
    cwd: root,
    stdio: "inherit",
  });
  execSync(`npx tsx prisma/seed.ts`, {
    cwd: root,
    env: { ...process.env, DATABASE_PATH: seedDbPath },
    stdio: "inherit",
  });
  console.log("[prepare-build] Fresh seed database created.");
}

console.log("[prepare-build] Build preparation complete.");
