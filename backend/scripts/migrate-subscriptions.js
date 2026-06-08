/**
 * One-time migration: create subscription tables if they don't exist.
 * Run from /backend:  node scripts/migrate-subscriptions.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

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
    console.log('✓ subscription_plans');

    await client.query(`
      INSERT INTO subscription_plans
        (key,display_name,tagline,price_monthly,price_yearly,price_2year,price_3year,
         max_users,max_patients,max_appointments,max_prescriptions,max_storage_mb,features)
      VALUES
        ('base','Base Plan','Smart workflow management starts here.',
         0,0,0,0,1,100,150,150,250,
         '{"queue":true,"billing":true,"appointments":true,"prescriptions":true,"ai_docassist":false,"scribe":false,"vitals_graph":false,"lab_upload":false}'),
        ('pro','Infer Pro','Streamline your workflow — unlimited everything.',
         40000,400000,720000,1008000,-1,-1,-1,-1,-1,
         '{"queue":true,"billing":true,"appointments":true,"prescriptions":true,"ai_docassist":true,"scribe":true,"vitals_graph":true,"lab_upload":true,"qr_prescription":true,"analytics":true}')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('✓ seeded base & pro plans');

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
    console.log('✓ clinic_subscriptions');

    await client.query(`
      INSERT INTO clinic_subscriptions (clinic_id, plan_id, billing_cycle, status)
      SELECT c.id, (SELECT id FROM subscription_plans WHERE key = 'base'), 'free', 'active'
      FROM emr_clinics c
      WHERE NOT EXISTS (SELECT 1 FROM clinic_subscriptions cs WHERE cs.clinic_id = c.id)
    `);
    console.log('✓ assigned base plan to existing clinics');

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
    console.log('✓ subscription_orders');

    // Superadmin tables
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
    await client.query(`ALTER TABLE emr_clinics ADD COLUMN IF NOT EXISTS status        VARCHAR(20) NOT NULL DEFAULT 'active'`);
    await client.query(`ALTER TABLE emr_clinics ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE emr_clinics ADD COLUMN IF NOT EXISTS notes         TEXT`);
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
    console.log('✓ superadmins + admin_audit_logs + emr_clinics columns');

    // Subscription catalog
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
    await client.query(`
      INSERT INTO subscription_seat_types (key,display_name,description,price_monthly,price_yearly,price_2year,price_3year) VALUES
      ('premium','Premium Seats','Ideal for doctors & prescribing team.',90000,60000,54000,48000),
      ('basic','Basic Seats','For front desk staff, nurses & non-prescribing users.',40000,30000,27000,24000),
      ('scribe','EkaScribe','AI assistant converting voice into clinical notes.',150000,106000,100700,95400)
      ON CONFLICT (key) DO NOTHING
    `);
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
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('✓ subscription_seat_types + subscription_addons + clinic_subscription_items');

    await client.query('COMMIT');
    console.log('\n✅ Migration complete.');
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
