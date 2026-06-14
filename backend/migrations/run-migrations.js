/**
 * Auto-migration runner — called at server startup before app.listen().
 * Every migration file must be idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING, etc.).
 * Files are executed in alphabetical order within each directory.
 */
const fs   = require('fs');
const path = require('path');

// 1. Numbered legacy migrations in backend/src/db/migrations/ (003_, 004_, etc.)
const DB_MIGRATIONS_DIR = path.join(__dirname, '../src/db/migrations');

// 2. Security / custom migrations in backend/migrations/ (this dir)
const CUSTOM_MIGRATION_FILES = [
  path.join(__dirname, 'security_hardening_20260614.sql'),
];

async function runMigrations(pool, logger) {
  const client = await pool.connect();
  try {
    // Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    client.release();
  } catch (err) {
    client.release();
    logger.error('Migration: failed to create tracking table', { error: err.message });
    return;
  }

  // ── 1. Numbered db migrations ─────────────────────────────────────────────
  if (fs.existsSync(DB_MIGRATIONS_DIR)) {
    const numbered = fs.readdirSync(DB_MIGRATIONS_DIR)
      .filter(f => /^\d+_.+\.sql$/.test(f))
      .sort((a, b) => parseInt(a) - parseInt(b));

    for (const file of numbered) {
      const c2 = await pool.connect();
      try {
        const { rows } = await c2.query('SELECT id FROM migrations WHERE name=$1', [file]);
        if (rows.length > 0) { c2.release(); continue; } // already ran

        const sql = fs.readFileSync(path.join(DB_MIGRATIONS_DIR, file), 'utf8');
        await c2.query(sql);
        await c2.query('INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        logger.info(`Migration applied: ${file}`);
      } catch (err) {
        logger.error(`Migration FAILED: ${file}`, { error: err.message });
        // don't crash — IF NOT EXISTS guards mean partial success is OK
      } finally {
        c2.release();
      }
    }
  }

  // ── 2. Custom / security migrations ──────────────────────────────────────
  for (const filePath of CUSTOM_MIGRATION_FILES) {
    if (!fs.existsSync(filePath)) continue;
    const file = path.basename(filePath);
    const c3 = await pool.connect();
    try {
      const { rows } = await c3.query('SELECT id FROM migrations WHERE name=$1', [file]);
      if (rows.length > 0) { c3.release(); continue; } // already ran

      const sql = fs.readFileSync(filePath, 'utf8');
      await c3.query(sql);
      await c3.query('INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      logger.info(`Migration applied: ${file}`);
    } catch (err) {
      logger.error(`Migration FAILED: ${file}`, { error: err.message });
    } finally {
      c3.release();
    }
  }
}

module.exports = { runMigrations };
