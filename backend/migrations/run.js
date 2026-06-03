require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

async function runMigrations() {
  const client = await pool.connect();
  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Read all migration files
    const migrationDir = __dirname;
    const files = fs.readdirSync(migrationDir)
      .filter(f => /^\d+_.+\.sql$/.test(f))
      .sort((a, b) => {
        const numA = parseInt(a.split('_')[0]);
        const numB = parseInt(b.split('_')[0]);
        return numA - numB;
      });

    for (const file of files) {
      // Check if migration already ran
      const result = await client.query(
        'SELECT id FROM migrations WHERE name = $1',
        [file]
      );

      if (result.rows.length === 0) {
        console.log(`Running migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
        await client.query(sql);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [file]
        );
        console.log(`✓ ${file} completed`);
      } else {
        console.log(`⊘ ${file} already executed`);
      }
    }

    console.log('\nAll migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
