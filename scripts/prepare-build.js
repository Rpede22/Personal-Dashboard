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
//    We keep better-sqlite3 listed so @electron/rebuild can find it via the dep tree.
const bs3Pkg = JSON.parse(
  fs.readFileSync(path.join(root, "node_modules", "better-sqlite3", "package.json"), "utf8")
);
const standalonePackageJson = path.join(root, ".next", "standalone", "package.json");
fs.writeFileSync(
  standalonePackageJson,
  JSON.stringify({
    name: "dashboard-server",
    version: "1.0.0",
    private: true,
    dependencies: { "better-sqlite3": bs3Pkg.version },
  }, null, 2)
);
console.log("[prepare-build] Replaced standalone package.json with minimal stub (includes better-sqlite3).");

// 3. Download the arm64 Electron prebuilt of better-sqlite3 for standalone.
//    We use prebuild-install directly so the result is always arm64 regardless of
//    what Node architecture this script happens to run under.
const electronPkg = JSON.parse(
  fs.readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8")
);
const electronVersion = electronPkg.version;
const standaloneDir = path.join(root, ".next", "standalone");

// Resolve the arm64 Node binary bundled with nvm (used to run prebuild-install so
// it picks up the correct runtime target without inheriting the host arch).
const nvmArm64Node = (() => {
  const nvmDir = process.env.NVM_DIR || path.join(require("os").homedir(), ".nvm");
  const versionsDir = path.join(nvmDir, "versions", "node");
  if (!fs.existsSync(versionsDir)) return process.execPath;
  const v22 = fs.readdirSync(versionsDir).find(v => v.startsWith("v22"));
  if (!v22) return process.execPath;
  const candidate = path.join(versionsDir, v22, "bin", "node");
  return fs.existsSync(candidate) ? candidate : process.execPath;
})();

console.log(`[prepare-build] Fetching arm64 Electron ${electronVersion} prebuilt of better-sqlite3 using ${nvmArm64Node}...`);
const { execFileSync } = require("child_process");
// CWD must be the better-sqlite3 package dir so prebuild-install reads its package.json
const bs3StandaloneDir = path.join(standaloneDir, "node_modules", "better-sqlite3");
fs.mkdirSync(path.join(bs3StandaloneDir, "build", "Release"), { recursive: true });

execFileSync(nvmArm64Node, [
  path.join(root, "node_modules", "prebuild-install", "bin.js"),
  "--runtime",  "electron",
  "--target",   electronVersion,
  "--arch",     "arm64",
  "--platform", "darwin",
], {
  cwd: bs3StandaloneDir,   // <-- must be here so prebuild-install reads better-sqlite3's package.json
  stdio: "inherit",
});

console.log("[prepare-build] Electron arm64 prebuilt installed to standalone.");

// 4. Merge Turbopack's hashed modules into the regular standalone/node_modules.
//    Turbopack externalises packages under hashed names, e.g.:
//      @prisma/client-2c3a283f134fdcb6  (symlink inside real @prisma/ dir)
//      better-sqlite3-90e2652d1716b047  (top-level symlink)
//      node-ical-28ea1430a39980e6       (top-level symlink)
//    All of these are symlinks pointing to the real package in standalone/node_modules/.
//    We need to copy the RESOLVED target under the hashed name — otherwise the server
//    crashes with "Cannot find module '@prisma/client-2c3a283f134fdcb6/...'" etc.
const nestedNodeModules = path.join(root, ".next", "standalone", ".next", "node_modules");
const regularNodeModules = path.join(root, ".next", "standalone", "node_modules");

function mergeDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      // Resolve symlink to its real target and copy as a real directory/file.
      // This is how hashed names (e.g. better-sqlite3-{hash}) get materialised.
      try {
        const realSrc = fs.realpathSync(srcPath);
        if (fs.statSync(realSrc).isDirectory()) {
          if (!fs.existsSync(destPath)) copyDir(realSrc, destPath);
        } else {
          if (!fs.existsSync(destPath)) fs.copyFileSync(realSrc, destPath);
        }
      } catch (e) {
        console.warn(`[prepare-build] Warning: skipping unresolvable symlink ${srcPath}: ${e.message}`);
      }
    } else if (entry.isDirectory()) {
      mergeDir(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(nestedNodeModules)) {
  mergeDir(nestedNodeModules, regularNodeModules);
  console.log("[prepare-build] Merged Turbopack hashed modules into standalone/node_modules.");
}

// 4. Copy .env.local into standalone so the production server picks up API keys.
//    Next.js standalone reads .env.local from its cwd (the standalone directory).
const envSrc  = path.join(root, ".env.local");
const envDest = path.join(root, ".next", "standalone", ".env.local");
if (fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, envDest);
  console.log("[prepare-build] Copied .env.local into standalone.");
} else {
  console.warn("[prepare-build] Warning: .env.local not found — API keys will be missing in production.");
}

// (DB) Create a seeded database for first-run distribution
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
