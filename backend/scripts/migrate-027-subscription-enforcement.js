/**
 * Migration 027 + pricing seed update.
 * Run from /backend:  node scripts/migrate-027-subscription-enforcement.js
 *
 * Creates:
 *   - clinic_active_sessions
 *   - subscription_audit_log
 *   - subscription_webhook_log
 *   - seat_type column on emr_clinic_staff
 *
 * Updates subscription_plans pricing to match business model:
 *   - base:  ₹300/seat/month  (yearly ₹270, 2yr ₹255, 3yr ₹240)
 *   - pro:   ₹600/seat/month  (yearly ₹540, 2yr ₹510, 3yr ₹480)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'phr_db',
  user:     process.env.DB_USER     || 'phr_user',
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Step 1: Apply migration 027 (sessions, audit, webhook tables) ──────────
    console.log('Applying migration 027…');
    const migrationSql = fs.readFileSync(
      path.join(__dirname, '../migrations/027_subscription_enforcement_tables.sql'),
      'utf8'
    );
    // Skip GRANT statements — adjust role name if needed in production
    const filteredSql = migrationSql
      .split('\n')
      .filter(line => !line.trim().startsWith('GRANT'))
      .join('\n');
    await client.query(filteredSql);
    console.log('✓ Migration 027 applied (tables + indexes created)');

    // ── Step 2: Update pricing to business model ─────────────────────────────
    // Prices in paise (₹ × 100), per seat per month equivalent
    // Yearly = 10% discount, 2year = 15%, 3year = 20%
    console.log('Updating subscription plan pricing…');
    await client.query(`
      UPDATE subscription_plans SET
        price_monthly = 30000,
        price_yearly  = 27000,
        price_2year   = 25500,
        price_3year   = 24000
      WHERE key = 'base'
    `);
    await client.query(`
      UPDATE subscription_plans SET
        price_monthly = 60000,
        price_yearly  = 54000,
        price_2year   = 51000,
        price_3year   = 48000
      WHERE key = 'pro'
    `);
    console.log('✓ Pricing updated: base ₹300/seat/mo, pro ₹600/seat/mo');

    await client.query('COMMIT');
    console.log('\n✅ All migrations applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
