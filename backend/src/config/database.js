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
        hi_type                VARCHAR(50),
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
        abdm_request_id  VARCHAR(100),
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
    await client.query(`ALTER TABLE emr_consent_requests ADD COLUMN IF NOT EXISTS abdm_request_id VARCHAR(100)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emr_consents_clinic ON emr_consent_requests(clinic_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emr_consents_abdm_id ON emr_consent_requests(abdm_request_id)`);
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

    // ── Subscription Plans ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id                SERIAL PRIMARY KEY,
        key               VARCHAR(50)  NOT NULL UNIQUE,
        display_name      VARCHAR(100) NOT NULL,
        tagline           TEXT,
        price_monthly     INTEGER NOT NULL DEFAULT 0,
        price_yearly      INTEGER NOT NULL DEFAULT 0,
        price_2year       INTEGER NOT NULL DEFAULT 0,
        price_3year       INTEGER NOT NULL DEFAULT 0,
        max_users         INTEGER NOT NULL DEFAULT 1,
        max_patients      INTEGER NOT NULL DEFAULT 100,
        max_appointments  INTEGER NOT NULL DEFAULT 150,
        max_prescriptions INTEGER NOT NULL DEFAULT 150,
        max_storage_mb    INTEGER NOT NULL DEFAULT 250,
        features          JSONB   NOT NULL DEFAULT '{}',
        is_active         BOOLEAN NOT NULL DEFAULT true,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      INSERT INTO subscription_plans
        (key,display_name,tagline,price_monthly,price_yearly,price_2year,price_3year,max_users,max_patients,max_appointments,max_prescriptions,max_storage_mb,features)
      VALUES
        ('base','Base Plan','Smart workflow management starts here.',
         0,0,0,0,1,100,150,150,250,
         '{"queue":true,"billing":true,"appointments":true,"prescriptions":true,"ai_docassist":false,"scribe":false,"vitals_graph":false,"lab_upload":false}'),
        ('pro','Infer Pro','Streamline your workflow — unlimited everything.',
         40000,400000,720000,1008000,-1,-1,-1,-1,-1,
         '{"queue":true,"billing":true,"appointments":true,"prescriptions":true,"ai_docassist":true,"scribe":true,"vitals_graph":true,"lab_upload":true,"qr_prescription":true,"analytics":true}')
      ON CONFLICT (key) DO NOTHING
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS clinic_subscriptions (
        id                  SERIAL PRIMARY KEY,
        clinic_id           INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
        plan_id             INTEGER NOT NULL REFERENCES subscription_plans(id),
        seat_count          INTEGER NOT NULL DEFAULT 1,
        billing_cycle       VARCHAR(20) NOT NULL DEFAULT 'free',
        status              VARCHAR(20) NOT NULL DEFAULT 'active',
        started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at          TIMESTAMPTZ,
        razorpay_order_id   VARCHAR(100),
        razorpay_payment_id VARCHAR(100),
        razorpay_sub_id     VARCHAR(100),
        notes               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (clinic_id)
      )
    `);
    await client.query(`
      INSERT INTO clinic_subscriptions (clinic_id, plan_id, billing_cycle, status)
      SELECT c.id, (SELECT id FROM subscription_plans WHERE key = 'base'), 'free', 'active'
      FROM emr_clinics c
      WHERE NOT EXISTS (SELECT 1 FROM clinic_subscriptions cs WHERE cs.clinic_id = c.id)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_orders (
        id                  SERIAL PRIMARY KEY,
        clinic_id           INTEGER NOT NULL REFERENCES emr_clinics(id),
        plan_id             INTEGER NOT NULL REFERENCES subscription_plans(id),
        seat_count          INTEGER NOT NULL DEFAULT 1,
        billing_cycle       VARCHAR(20) NOT NULL,
        amount_paise        INTEGER NOT NULL,
        currency            VARCHAR(10) NOT NULL DEFAULT 'INR',
        razorpay_order_id   VARCHAR(100),
        razorpay_payment_id VARCHAR(100),
        status              VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paid_at             TIMESTAMPTZ
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
    await client.query(`ALTER TABLE emr_clinics ADD COLUMN IF NOT EXISTS theme_color    VARCHAR(7)   DEFAULT '#2563eb'`);
    await client.query(`ALTER TABLE emr_clinics ADD COLUMN IF NOT EXISTS rx_header_img  TEXT`);
    await client.query(`ALTER TABLE emr_clinics ADD COLUMN IF NOT EXISTS rx_footer_img  TEXT`);
    await client.query(`ALTER TABLE emr_clinics ADD COLUMN IF NOT EXISTS rx_signature   TEXT`);
    await client.query(`ALTER TABLE emr_patients     ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
    await client.query(`ALTER TABLE emr_appointments ADD COLUMN IF NOT EXISTS patient_email VARCHAR(255)`);
    await client.query(`ALTER TABLE emr_receipts     ADD COLUMN IF NOT EXISTS patient_email VARCHAR(255)`);
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

    // ── Subscription Catalog ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_seat_types (
        id            SERIAL PRIMARY KEY,
        key           VARCHAR(50)  NOT NULL UNIQUE,
        display_name  VARCHAR(100) NOT NULL,
        description   TEXT,
        price_monthly INTEGER NOT NULL DEFAULT 0,
        price_yearly  INTEGER NOT NULL DEFAULT 0,
        price_2year   INTEGER NOT NULL DEFAULT 0,
        price_3year   INTEGER NOT NULL DEFAULT 0,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_addons (
        id            SERIAL PRIMARY KEY,
        key           VARCHAR(50)  NOT NULL UNIQUE,
        display_name  VARCHAR(100) NOT NULL,
        description   TEXT,
        price_monthly INTEGER NOT NULL DEFAULT 0,
        price_yearly  INTEGER NOT NULL DEFAULT 0,
        price_2year   INTEGER NOT NULL DEFAULT 0,
        price_3year   INTEGER NOT NULL DEFAULT 0,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS clinic_subscription_items (
        id               SERIAL PRIMARY KEY,
        clinic_id        INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
        item_type        VARCHAR(20)  NOT NULL,
        item_key         VARCHAR(50)  NOT NULL,
        display_name     VARCHAR(100) NOT NULL,
        quantity         INTEGER      NOT NULL DEFAULT 1,
        unit_price_paise INTEGER      NOT NULL,
        billing_cycle    VARCHAR(20)  NOT NULL,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // Seed seat types
    await client.query(`
      INSERT INTO subscription_seat_types (key,display_name,description,price_monthly,price_yearly,price_2year,price_3year) VALUES
      ('premium','Premium Seats','Ideal for doctors & prescribing team. All features including prescription writing.',90000,60000,54000,48000),
      ('basic','Basic Seats','For front desk staff, nurses & non-prescribing users. Billing, appointments, queue, records.',40000,30000,27000,24000),
      ('scribe','EkaScribe','AI assistant converting voice into clinical notes & prescriptions automatically.',150000,106000,100700,95400)
      ON CONFLICT (key) DO UPDATE SET price_monthly=EXCLUDED.price_monthly, price_yearly=EXCLUDED.price_yearly, price_2year=EXCLUDED.price_2year, price_3year=EXCLUDED.price_3year
    `);

    // Seed add-ons
    await client.query(`
      INSERT INTO subscription_addons (key,display_name,price_monthly,price_yearly,price_2year,price_3year) VALUES
      ('custom_form_builder','Custom Form Builder',52560,43800,39400,35000),
      ('chatbot_integration','Chatbot One Time Integration',300000,250000,333400,233400),
      ('developer_platform','Developer Platform',240000,200000,333400,233400),
      ('flabs_basic','Flabs – Basic Plan',72000,60000,60000,60000),
      ('flabs_inventory','Flabs – Inventory Plan',96000,80000,80000,80000),
      ('flabs_machine_bi','Flabs Machine Integration: Bidirectional',108000,90000,81000,72000),
      ('flabs_machine_uni','Flabs Machine Integration: Unidirectional',80040,66700,60000,53400),
      ('pharmacy_capsule','In-clinic Pharmacy Capsule',61080,50900,50900,50900),
      ('pharmacy_injection','In-Clinic Pharmacy Injection',130080,108400,108400,108400),
      ('whatsapp_integration','WhatsApp Integration',152640,127200,147500,147500)
      ON CONFLICT (key) DO UPDATE SET price_monthly=EXCLUDED.price_monthly, price_yearly=EXCLUDED.price_yearly, price_2year=EXCLUDED.price_2year, price_3year=EXCLUDED.price_3year
    `);

    // migration 029 — ABHA registration fields
    await client.query(`ALTER TABLE emr_patients ADD COLUMN IF NOT EXISTS address        JSONB`);
    await client.query(`ALTER TABLE emr_patients ADD COLUMN IF NOT EXISTS is_abdm_linked  BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE emr_patients ADD COLUMN IF NOT EXISTS abdm_linked_at  TIMESTAMPTZ`);

    // hip_consent_artifacts — stores consent artefacts received from ABDM gateway
    await client.query(`
      CREATE TABLE IF NOT EXISTS hip_consent_artifacts (
        id           SERIAL PRIMARY KEY,
        consent_id   VARCHAR(128) UNIQUE NOT NULL,
        status       VARCHAR(20),
        artefacts    JSONB,
        raw          JSONB,
        patient_abha VARCHAR(200),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE hip_consent_artifacts ADD COLUMN IF NOT EXISTS patient_abha VARCHAR(200)`);
    await client.query(`ALTER TABLE emr_care_contexts ADD COLUMN IF NOT EXISTS link_status TEXT NOT NULL DEFAULT 'pending' CHECK (link_status IN ('pending','linked','failed'))`);
    await client.query(`ALTER TABLE emr_care_contexts ADD COLUMN IF NOT EXISTS linked_at  TIMESTAMPTZ`);
    await client.query(`ALTER TABLE emr_care_contexts ADD COLUMN IF NOT EXISTS link_error TEXT`);
    await client.query(`ALTER TABLE emr_care_contexts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
    await client.query(`ALTER TABLE health_records ADD COLUMN IF NOT EXISTS hi_type VARCHAR(50)`);
    await client.query(`ALTER TABLE hip_health_requests ADD COLUMN IF NOT EXISTS hiu_key_material JSONB`);
    await client.query(`ALTER TABLE emr_consent_requests ADD COLUMN IF NOT EXISTS hiu_key_material JSONB`);
    await client.query(`ALTER TABLE emr_consent_requests ADD COLUMN IF NOT EXISTS permission_date_range JSONB`);
    // ON CONFLICT requires a non-deferrable unique constraint — recreate if deferrable
    await client.query(`ALTER TABLE emr_care_contexts DROP CONSTRAINT IF EXISTS uq_care_ctx_ref_num`);
    await client.query(`ALTER TABLE emr_care_contexts ADD CONSTRAINT uq_care_ctx_ref_num UNIQUE (reference_number)`);
    // Link token persistence — survives restarts, prevents duplicate ABDM token requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS link_tokens (
        id               SERIAL PRIMARY KEY,
        patient_ref      TEXT NOT NULL,
        hip_id           TEXT NOT NULL,
        token            TEXT,
        abdm_request_id  TEXT,
        status           TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','active','linked','failed','expired')),
        expires_at       TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (patient_ref, hip_id)
      )
    `);
    await client.query(`ALTER TABLE link_tokens ADD COLUMN IF NOT EXISTS abdm_request_id TEXT`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_link_tokens_patient    ON link_tokens(patient_ref, hip_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_link_tokens_status     ON link_tokens(status, expires_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_link_tokens_request_id ON link_tokens(abdm_request_id) WHERE abdm_request_id IS NOT NULL`);

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
