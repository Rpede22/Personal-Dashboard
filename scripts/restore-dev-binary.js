/**
 * Restore the Node 22 (dev) binary for better-sqlite3 after an Electron build.
 *
 * electron-builder runs @electron/rebuild during packaging which replaces the
 * project-root better-sqlite3 binary with an Electron ABI binary. This script
 * re-fetches the correct Node 22 arm64 prebuilt so `npm run dev` keeps working.
 */

const fs   = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os   = require("os");

const root = path.join(__dirname, "..");

// Find the arm64 Node 22 binary via nvm
const nvmArm64Node = (() => {
  const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), ".nvm");
  const versionsDir = path.join(nvmDir, "versions", "node");
  if (!fs.existsSync(versionsDir)) return process.execPath;
  const v22 = fs.readdirSync(versionsDir).find(v => v.startsWith("v22"));
  if (!v22) return process.execPath;
  const candidate = path.join(versionsDir, v22, "bin", "node");
  return fs.existsSync(candidate) ? candidate : process.execPath;
})();

console.log(`[restore-dev-binary] Restoring Node 22 arm64 binary using ${nvmArm64Node}...`);

execFileSync(nvmArm64Node, [
  path.join(root, "node_modules", "prebuild-install", "bin.js"),
  "--runtime",  "node",
  "--target",   "22.22.0",
  "--arch",     "arm64",
  "--platform", "darwin",
], {
  cwd: path.join(root, "node_modules", "better-sqlite3"),
  stdio: "inherit",
});

console.log("[restore-dev-binary] Done — dev mode binary restored.");
