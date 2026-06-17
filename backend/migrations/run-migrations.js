/**
 * Auto-migration runner — called at server startup before app.listen().
 * Each migration is tracked in the migrations table so it runs only once.
 */
const fs   = require('fs');
const path = require('path');

const DB_MIGRATIONS_DIR = path.join(__dirname, '../src/db/migrations');

const CUSTOM_MIGRATION_FILES = [
  path.join(__dirname, 'security_hardening_20260614.sql'),
  path.join(__dirname, 'abha_identity_20260614.sql'),       // abha_mappings table
  path.join(__dirname, 'audit_log_20260614.sql'),           // audit_logs table + indexes
  path.join(__dirname, 'session_blacklist_20260614.sql'),   // JWT blacklist for logout
  path.join(__dirname, '038_abdm_production_wiring.sql'),   // care context auto-create wiring
];

async function runMigrations(pool, logger) {
  // Ensure tracking table exists using a single dedicated client
  const setup = await pool.connect();
  try {
    await setup.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (err) {
    logger.error('Migration: failed to create tracking table', { error: err.message });
    return;
  } finally {
    setup.release(); // always release — even on error
  }

  // Collect all files to run
  const files = [];

  if (fs.existsSync(DB_MIGRATIONS_DIR)) {
    const numbered = fs.readdirSync(DB_MIGRATIONS_DIR)
      .filter(f => /^\d+_.+\.sql$/.test(f))
      .sort((a, b) => parseInt(a) - parseInt(b));
    for (const f of numbered) {
      files.push({ name: f, filePath: path.join(DB_MIGRATIONS_DIR, f) });
    }
  }

  for (const filePath of CUSTOM_MIGRATION_FILES) {
    if (fs.existsSync(filePath)) {
      files.push({ name: path.basename(filePath), filePath });
    }
  }

  // Run each migration in its own client (no early release — always use finally)
  for (const { name, filePath } of files) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT id FROM migrations WHERE name=$1', [name]
      );
      if (rows.length > 0) {
        // already ran — skip silently
        continue;
      }

      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      await client.query(
        'INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]
      );
      logger.info(`Migration applied: ${name}`);
    } catch (err) {
      logger.error(`Migration FAILED: ${name}`, { error: err.message });
    } finally {
      client.release(); // single release point — no double-release possible
    }
  }
}

module.exports = { runMigrations };
