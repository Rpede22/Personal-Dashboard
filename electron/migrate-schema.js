/**
 * Auto-migrate the user's dashboard.db to match the schema of the bundled seed.db.
 *
 * Runs at Electron startup so a rebuilt app can pick up new Prisma models or
 * columns without the manual `prisma db push` dance. Only additive changes are
 * applied (new tables, new columns, new indexes). Removals/renames are ignored
 * on purpose — they're rare and destructive; handle those cases by hand.
 *
 * Uses the packaged app's own better-sqlite3 to open both databases.
 */

// Resolve better-sqlite3 from the standalone bundle so we don't pull the
// project-root binary (which is compiled for a different Node ABI in dev).
function requireBundledSqlite(resourcesPath) {
  const path = require("path");
  const candidates = [
    path.join(resourcesPath, "standalone", "node_modules", "better-sqlite3"),
    path.join(__dirname, "..", "node_modules", "better-sqlite3"), // dev fallback
  ];
  for (const p of candidates) {
    try {
      return require(p);
    } catch { /* try next */ }
  }
  throw new Error("Could not locate better-sqlite3 for schema migration");
}

/**
 * @param {string} dbPath          Path to dashboard.db (writable)
 * @param {string} seedDbPath      Path to bundled seed.db (read-only reference)
 * @param {string} resourcesPath   process.resourcesPath (for locating better-sqlite3)
 * @param {(tag: string, msg: string) => void} log
 * @returns {{addedTables: string[], addedColumns: Array<{table: string, column: string}>, addedIndexes: string[]}}
 */
function ensureSchema(dbPath, seedDbPath, resourcesPath, log) {
  const fs = require("fs");
  if (!fs.existsSync(seedDbPath)) {
    log("MIGRATE", `seed.db missing at ${seedDbPath}; skipping schema migration`);
    return { addedTables: [], addedColumns: [], addedIndexes: [] };
  }
  if (!fs.existsSync(dbPath)) {
    log("MIGRATE", `dashboard.db missing at ${dbPath}; skipping (first launch will seed instead)`);
    return { addedTables: [], addedColumns: [], addedIndexes: [] };
  }

  const Database = requireBundledSqlite(resourcesPath);
  const seed = new Database(seedDbPath, { readonly: true });
  const live = new Database(dbPath);

  const addedTables = [];
  const addedColumns = [];
  const addedIndexes = [];

  try {
    // ── Tables ────────────────────────────────────────────────────────────────
    // Skip internal SQLite bookkeeping tables + Prisma migration table (Prisma
    // owns its own).
    const isUserTable = (name) => name && !name.startsWith("sqlite_") && name !== "_prisma_migrations";

    const seedTables = seed
      .prepare("SELECT name, sql FROM sqlite_master WHERE type='table'")
      .all()
      .filter((r) => isUserTable(r.name));

    const liveTableNames = new Set(
      live
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name)
    );

    for (const { name, sql } of seedTables) {
      if (!liveTableNames.has(name)) {
        // Re-emit the seed's CREATE TABLE verbatim; it already reflects
        // the exact columns/constraints Prisma generated.
        live.exec(sql);
        addedTables.push(name);
        log("MIGRATE", `added table: ${name}`);
        continue;
      }

      // Table exists — check for column-level differences
      const seedCols  = seed.prepare(`PRAGMA table_info(${quoteIdent(name)})`).all();
      const liveCols  = live.prepare(`PRAGMA table_info(${quoteIdent(name)})`).all();
      const liveColNames = new Set(liveCols.map((c) => c.name));

      for (const col of seedCols) {
        if (liveColNames.has(col.name)) continue;
        // Build an `ALTER TABLE t ADD COLUMN` matching the seed column
        const parts = [`${quoteIdent(col.name)} ${col.type || "TEXT"}`];
        if (col.notnull && col.dflt_value != null) parts.push("NOT NULL");
        if (col.dflt_value != null) parts.push(`DEFAULT ${col.dflt_value}`);
        // NB: SQLite's ADD COLUMN can't create a PRIMARY KEY or add a
        // NOT NULL column without a default. Non-fatal — log and skip.
        try {
          live.exec(`ALTER TABLE ${quoteIdent(name)} ADD COLUMN ${parts.join(" ")}`);
          addedColumns.push({ table: name, column: col.name });
          log("MIGRATE", `added column: ${name}.${col.name}`);
        } catch (err) {
          log("MIGRATE", `WARN: could not add column ${name}.${col.name} (${err.message})`);
        }
      }
    }

    // ── Indexes ───────────────────────────────────────────────────────────────
    const seedIndexes = seed
      .prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")
      .all();
    const liveIndexNames = new Set(
      live
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all()
        .map((r) => r.name)
    );
    for (const { name, sql } of seedIndexes) {
      if (liveIndexNames.has(name)) continue;
      try {
        live.exec(sql);
        addedIndexes.push(name);
        log("MIGRATE", `added index: ${name}`);
      } catch (err) {
        log("MIGRATE", `WARN: could not add index ${name} (${err.message})`);
      }
    }

    return { addedTables, addedColumns, addedIndexes };
  } finally {
    seed.close();
    live.close();
  }
}

// Quote an identifier for SQLite — wrap in double quotes and escape any
// embedded double-quote. Safe for column/table names from PRAGMA output.
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

module.exports = { ensureSchema };
