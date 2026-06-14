/**
 * Auto-migration runner — called at server startup before app.listen().
 * Every migration file must be idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING, etc.).
 * Files are executed in alphabetical order.
 */
const fs   = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname);

// Files to run (alphabetical order = chronological order by date prefix)
const MIGRATION_FILES = [
  'security_hardening_20260614.sql',
];

async function runMigrations(pool, logger) {
  for (const file of MIGRATION_FILES) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    if (!fs.existsSync(filePath)) {
      logger.warn(`Migration file not found, skipping: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(filePath, 'utf8');
    const client = await pool.connect();
    try {
      // Run the entire file as one call — pg supports multi-statement text queries
      await client.query(sql);
      logger.info(`Migration applied: ${file}`);
    } catch (err) {
      logger.error(`Migration FAILED: ${file}`, { error: err.message });
      // Don't crash the server on migration error — log and continue
      // so existing functionality still works if some columns already exist
    } finally {
      client.release();
    }
  }
}

module.exports = { runMigrations };
