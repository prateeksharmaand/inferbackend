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
      CREATE TABLE IF NOT EXISTS emr_consent_requests (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id        INTEGER NOT NULL,
        request_id       VARCHAR(100) UNIQUE,
        transaction_id   VARCHAR(100),
        patient_abha     VARCHAR(100),
        hip_id           VARCHAR(100),
        hiu_id           VARCHAR(100),
        purpose          VARCHAR(50),
        hi_types         TEXT[],
        status           VARCHAR(30) DEFAULT 'REQUESTED',
        artefacts        JSONB,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emr_consents_clinic ON emr_consent_requests(clinic_id)`);
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ language 'plpgsql'
    `);
    for (const table of ['users', 'reminders', 'chat_sessions']) {
      await client.query(`DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table}`);
      await client.query(`CREATE TRIGGER update_${table}_updated_at BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION update_updated_at()`);
    }

    // ── EMR / OPD tables ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS emr_clinics (
        id               SERIAL PRIMARY KEY,
        name             VARCHAR(200) NOT NULL,
        address          TEXT,
        phone            VARCHAR(20),
        email            VARCHAR(200) UNIQUE,
        uhid_prefix      VARCHAR(20),
        uhid_next_number INTEGER NOT NULL DEFAULT 1,
        plan             VARCHAR(50) NOT NULL DEFAULT 'basic',
        max_patients     INTEGER NOT NULL DEFAULT 1000,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS emr_doctors (
        id               SERIAL PRIMARY KEY,
        clinic_id        INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
        name             VARCHAR(200) NOT NULL,
        email            VARCHAR(200) UNIQUE NOT NULL,
        password_hash    TEXT NOT NULL,
        specialization   VARCHAR(100),
        qualification    VARCHAR(200),
        registration_no  VARCHAR(100),
        is_active        BOOLEAN NOT NULL DEFAULT true,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS emr_clinic_staff (
        id            SERIAL PRIMARY KEY,
        clinic_id     INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
        name          VARCHAR(200) NOT NULL,
        email         VARCHAR(200) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          VARCHAR(50) NOT NULL DEFAULT 'staff',
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS emr_patients (
        id           SERIAL PRIMARY KEY,
        name         VARCHAR(200) NOT NULL,
        mobile       VARCHAR(20),
        dob          DATE,
        gender       VARCHAR(20),
        abha_number  VARCHAR(50),
        abha_address VARCHAR(100),
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emr_patients_mobile ON emr_patients(mobile)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emr_patients_abha   ON emr_patients(abha_address, abha_number)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS emr_care_contexts (
        id               SERIAL PRIMARY KEY,
        patient_id       INTEGER REFERENCES emr_patients(id) ON DELETE CASCADE,
        reference_number VARCHAR(200) NOT NULL,
        display          TEXT,
        hi_type          VARCHAR(50) NOT NULL DEFAULT 'OPConsultation',
        fhir_content     JSONB,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emr_care_ctx_patient ON emr_care_contexts(patient_id)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS emr_queues (
        id            SERIAL PRIMARY KEY,
        clinic_id     INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
        doctor_id     INTEGER REFERENCES emr_doctors(id) ON DELETE SET NULL,
        name          VARCHAR(200) NOT NULL,
        mode          VARCHAR(50) NOT NULL DEFAULT 'in_clinic',
        filters       JSONB NOT NULL DEFAULT '{}',
        quick_actions JSONB NOT NULL DEFAULT '[]',
        sort_order    VARCHAR(50) NOT NULL DEFAULT 'appointment_start',
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS emr_appointments (
        id                SERIAL PRIMARY KEY,
        queue_id          INTEGER REFERENCES emr_queues(id) ON DELETE SET NULL,
        clinic_id         INTEGER NOT NULL,
        doctor_id         INTEGER REFERENCES emr_doctors(id) ON DELETE SET NULL,
        emr_patient_id    INTEGER REFERENCES emr_patients(id) ON DELETE SET NULL,
        patient_name      VARCHAR(200) NOT NULL,
        patient_mobile    VARCHAR(20),
        patient_dob       DATE,
        patient_gender    VARCHAR(20),
        patient_abha      VARCHAR(100),
        token_number      INTEGER,
        visit_type        VARCHAR(50) NOT NULL DEFAULT 'OPConsultation',
        channel           VARCHAR(50) NOT NULL DEFAULT 'walk_in',
        appointment_date  DATE NOT NULL,
        appointment_time  TIME,
        notes             TEXT,
        tags              JSONB NOT NULL DEFAULT '[]',
        uhid              VARCHAR(100),
        medical_history   JSONB NOT NULL DEFAULT '[]',
        status            VARCHAR(50) NOT NULL DEFAULT 'booked',
        payment_status    VARCHAR(50) NOT NULL DEFAULT 'unbilled',
        assessment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
        checked_in_at     TIMESTAMPTZ,
        completed_at      TIMESTAMPTZ,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emr_appt_clinic_date ON emr_appointments(clinic_id, appointment_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emr_appt_queue       ON emr_appointments(queue_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emr_appt_mobile      ON emr_appointments(patient_mobile)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS emr_encounters (
        id                   SERIAL PRIMARY KEY,
        appointment_id       INTEGER UNIQUE REFERENCES emr_appointments(id) ON DELETE CASCADE,
        clinic_id            INTEGER NOT NULL,
        doctor_id            INTEGER REFERENCES emr_doctors(id) ON DELETE SET NULL,
        emr_patient_id       INTEGER REFERENCES emr_patients(id) ON DELETE SET NULL,
        chief_complaint      TEXT,
        symptoms             JSONB NOT NULL DEFAULT '[]',
        diagnosis            JSONB NOT NULL DEFAULT '[]',
        medications          JSONB NOT NULL DEFAULT '[]',
        instructions         TEXT,
        next_visit_date      DATE,
        next_visit_notes     TEXT,
        vitals               JSONB NOT NULL DEFAULT '{}',
        fhir_bundle          JSONB,
        lab_investigations   JSONB NOT NULL DEFAULT '[]',
        lab_results          JSONB NOT NULL DEFAULT '[]',
        examination_findings TEXT,
        notes                TEXT,
        refer_to             TEXT,
        advices              TEXT,
        procedures           JSONB NOT NULL DEFAULT '[]',
        canvas_image         TEXT,
        custom_sections      JSONB NOT NULL DEFAULT '[]',
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS emr_tags (
        id           SERIAL PRIMARY KEY,
        clinic_id    INTEGER NOT NULL,
        code         VARCHAR(100) NOT NULL,
        display_name VARCHAR(200) NOT NULL,
        color        VARCHAR(30) NOT NULL DEFAULT '#7c3aed',
        attr_type    INTEGER NOT NULL DEFAULT 1,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(clinic_id, code, attr_type)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hip_link_sessions (
        id              SERIAL PRIMARY KEY,
        patient_id      INTEGER REFERENCES emr_patients(id) ON DELETE SET NULL,
        transaction_id  VARCHAR(100),
        request_id      VARCHAR(100),
        care_contexts   JSONB NOT NULL DEFAULT '[]',
        otp             VARCHAR(10),
        otp_expires_at  TIMESTAMPTZ,
        link_ref_number VARCHAR(100) UNIQUE,
        status          VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hip_health_requests (
        id              SERIAL PRIMARY KEY,
        transaction_id  VARCHAR(100) UNIQUE,
        consent_id      VARCHAR(100),
        data_push_url   TEXT,
        key_material    JSONB,
        status          VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Super Admin Portal ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS superadmins (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(100) NOT NULL,
        email         VARCHAR(150) NOT NULL UNIQUE,
        password_hash TEXT        NOT NULL,
        is_active     BOOLEAN     NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE emr_clinics ADD COLUMN IF NOT EXISTS status       VARCHAR(20)  NOT NULL DEFAULT 'active'`);
    await client.query(`ALTER TABLE emr_clinics ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE emr_clinics ADD COLUMN IF NOT EXISTS notes        TEXT`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id          SERIAL PRIMARY KEY,
        admin_id    INTEGER      NOT NULL REFERENCES superadmins(id),
        action      VARCHAR(100) NOT NULL,
        target_type VARCHAR(50),
        target_id   INTEGER,
        details     JSONB,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

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
