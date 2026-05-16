require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

async function runMigrations() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, '001_initial_schema.sql'), 'utf8');
    await client.query(sql);
    console.log('Migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
