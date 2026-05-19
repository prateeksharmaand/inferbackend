const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'phr_db',
  user: process.env.DB_USER || 'phr_user',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => logger.error('Unexpected DB pool error', err));

async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) logger.warn(`Slow query (${duration}ms): ${text}`);
    return result;
  } catch (err) {
    logger.error(`Query error: ${text}`, err);
    throw err;
  }
}

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone VARCHAR(20),
        date_of_birth DATE,
        gender VARCHAR(20),
        blood_type VARCHAR(5),
        height DECIMAL(5,2),
        weight DECIMAL(5,2),
        conditions TEXT[] DEFAULT '{}',
        allergies TEXT[] DEFAULT '{}',
        emergency_contact_name VARCHAR(100),
        emergency_contact_phone VARCHAR(20),
        avatar_url TEXT,
        fcm_token TEXT,
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS vitals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        values JSONB NOT NULL DEFAULT '{}',
        unit VARCHAR(30),
        status VARCHAR(30) DEFAULT 'normal',
        loinc_code VARCHAR(20),
        recorded_at TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT,
        source VARCHAR(50) DEFAULT 'manual',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vitals_user_type ON vitals(user_id, type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vitals_recorded_at ON vitals(recorded_at DESC)`);
    await client.query(`ALTER TABLE vitals ALTER COLUMN type TYPE VARCHAR(150)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        file_path TEXT,
        file_url TEXT,
        mime_type VARCHAR(100),
        file_size INTEGER,
        ocr_text TEXT,
        extracted_vitals JSONB,
        is_encrypted BOOLEAN DEFAULT true,
        doctor_name VARCHAR(100),
        facility_name VARCHAR(150),
        document_date DATE,
        tags TEXT[] DEFAULT '{}',
        uploaded_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        medicine_name VARCHAR(200) NOT NULL,
        dosage VARCHAR(100) NOT NULL,
        frequency VARCHAR(50) NOT NULL,
        times TEXT[] NOT NULL DEFAULT '{}',
        start_date DATE NOT NULL,
        end_date DATE,
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        color VARCHAR(20),
        days_of_week INTEGER[] DEFAULT '{1,2,3,4,5,6,7}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS timeline_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        data JSONB,
        event_date TIMESTAMPTZ DEFAULT NOW(),
        icon VARCHAR(50),
        color VARCHAR(20),
        reference_id UUID,
        reference_type VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_timeline_user_date ON timeline_events(user_id, event_date DESC)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        messages JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        data JSONB,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS risk_predictions (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
        score        INTEGER NOT NULL DEFAULT 0,
        level        VARCHAR(20) NOT NULL DEFAULT 'low',
        factors      JSONB DEFAULT '[]',
        recommendation TEXT,
        computed_at  TIMESTAMPTZ DEFAULT NOW(),
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_risk_predictions_user ON risk_predictions(user_id)`);

    // ── ABDM / ABHA tables ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS abha_accounts (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        abha_number      VARCHAR(20),
        abha_address     VARCHAR(100),
        name             VARCHAR(150),
        mobile           VARCHAR(15),
        x_token          TEXT,
        x_refresh_token  TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS linked_care_contexts (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
        hip_id           VARCHAR(100) NOT NULL,
        reference_number VARCHAR(200) NOT NULL,
        display          TEXT,
        hi_type          VARCHAR(50) DEFAULT 'OPConsultation',
        linked_at        TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, hip_id, reference_number)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_care_ctx_user ON linked_care_contexts(user_id)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS consent_requests (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
        request_id       VARCHAR(100) UNIQUE,
        transaction_id   VARCHAR(100),
        hiu_id           VARCHAR(100),
        purpose          VARCHAR(50),
        status           VARCHAR(30) DEFAULT 'REQUESTED',
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_consents_user ON consent_requests(user_id)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS health_records (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id         VARCHAR(100),
        care_context_reference VARCHAR(200),
        content                TEXT,
        media                  VARCHAR(50),
        checksum               TEXT,
        page_number            INTEGER,
        page_count             INTEGER,
        received_at            TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(transaction_id, care_context_reference)
      )
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ language 'plpgsql'
    `);
    for (const table of ['users', 'reminders', 'chat_sessions']) {
      await client.query(`DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table}`);
      await client.query(`CREATE TRIGGER update_${table}_updated_at BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION update_updated_at()`);
    }
    await client.query('COMMIT');
    logger.info('Database schema initialized successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, initializeDatabase };
