/**
 * Build a distributable seed database from the owner's dev.db.
 *
 * `prepare-build.js` used to copy dev.db verbatim as the bundled seed.db, which
 * meant a stranger's "fresh" first-run install opened with the owner's personal
 * data (runs, characters, assignments, …). This scrubs every personal table
 * while KEEPING shareable game data — the WoW checklist *templates* (the 35
 * M+/boss rows the app expects to exist).
 *
 * Usage: node scripts/make-seed.js [srcDb] [outDb]
 *   defaults: srcDb = ./dev.db, outDb = ./build-resources/seed.db
 * Also exported as makeSeed() for prepare-build.js to call.
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// Every table that holds personal data — emptied in the seed.
const PERSONAL_TABLES = [
  "Assignment",
  "RunLog",
  "Shoe",
  "RunPlan",
  "WowCharacter",
  "WowChecklist",
  "WowGearWishlist",
  "LolAccount",
  "LolRankSnapshot",
  "MediaShow",
];

// Kept as-is (shareable game data, not personal):
//   WowChecklistTemplate — the default M+/boss checklist rows.

function makeSeed(srcDb, outDb) {
  if (!fs.existsSync(srcDb)) {
    throw new Error(`Source DB not found: ${srcDb}`);
  }
  fs.mkdirSync(path.dirname(outDb), { recursive: true });
  fs.copyFileSync(srcDb, outDb);

  const db = new Database(outDb);
  const removed = {};
  try {
    for (const t of PERSONAL_TABLES) {
      try {
        const before = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
        db.prepare(`DELETE FROM "${t}"`).run();
        // Reset AUTOINCREMENT counters so seeded installs start ids at 1.
        try { db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(t); } catch { /* no sequence table */ }
        removed[t] = before;
      } catch {
        // Table might not exist in an older dev.db — skip it.
        removed[t] = "(absent)";
      }
    }
    db.exec("VACUUM");
    let templates = 0;
    try { templates = db.prepare(`SELECT COUNT(*) AS c FROM WowChecklistTemplate`).get().c; } catch { /* ignore */ }
    return { removed, templates };
  } finally {
    db.close();
  }
}

module.exports = { makeSeed, PERSONAL_TABLES };

if (require.main === module) {
  const root = path.join(__dirname, "..");
  const src = process.argv[2] || path.join(root, "dev.db");
  const out = process.argv[3] || path.join(root, "build-resources", "seed.db");
  const result = makeSeed(src, out);
  console.log(`[make-seed] Wrote scrubbed seed → ${out}`);
  console.log(`[make-seed] Emptied personal tables:`, result.removed);
  console.log(`[make-seed] Kept ${result.templates} WoW checklist templates.`);
}
