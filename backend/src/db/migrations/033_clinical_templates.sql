-- 033_clinical_templates.sql
-- Dynamic Clinical Template Builder.
--
-- Inheritance: system template (published version) → clinic overrides → doctor overrides.
-- Clinic and doctor levels store only what they change (clinical_template_overrides), never a
-- copy of the whole template. Published versions are immutable (enforced by triggers below), and
-- every saved consultation points at a snapshot of the exact template it was written with, so a
-- later template change never alters historical records.
--
-- Backward compatibility: a clinic with no row in clinic_template_selections keeps today's
-- InferPad behaviour (settings in the browser). Nothing here changes existing encounter columns.

BEGIN;

-- ── Templates ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_templates (
  id                   SERIAL PRIMARY KEY,
  clinic_id            INTEGER REFERENCES emr_clinics(id) ON DELETE CASCADE,   -- NULL = system template
  specialty_key        VARCHAR(50)  NOT NULL,
  name                 VARCHAR(200) NOT NULL,
  description          TEXT,
  scribe_specialty     VARCHAR(50),                                           -- links to the AI scribe prompt set
  source_template_id   INTEGER REFERENCES clinical_templates(id) ON DELETE SET NULL, -- duplicated from
  published_version_id INTEGER,                                               -- FK added below (circular)
  is_archived          BOOLEAN NOT NULL DEFAULT false,
  created_by_staff     INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,
  created_by_admin     INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinical_templates_scope_name
  ON clinical_templates (COALESCE(clinic_id, 0), lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinical_templates_system_specialty
  ON clinical_templates (specialty_key) WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_clinical_templates_clinic ON clinical_templates (clinic_id);

-- ── Versions (draft → published → archived) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_template_versions (
  id               SERIAL PRIMARY KEY,
  template_id      INTEGER NOT NULL REFERENCES clinical_templates(id) ON DELETE CASCADE,
  version_no       INTEGER NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'published', 'archived')),
  definition       JSONB,              -- resolved definition, written once at publish (read cache)
  definition_hash  VARCHAR(64),
  notes            TEXT,
  created_by_staff INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,
  created_by_admin INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at     TIMESTAMPTZ,
  UNIQUE (template_id, version_no)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinical_template_one_draft
  ON clinical_template_versions (template_id) WHERE status = 'draft';

DO $$ BEGIN
  ALTER TABLE clinical_templates
    ADD CONSTRAINT clinical_templates_published_version_fkey
    FOREIGN KEY (published_version_id) REFERENCES clinical_template_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Sections and fields of a version ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_template_sections (
  id             SERIAL PRIMARY KEY,
  version_id     INTEGER NOT NULL REFERENCES clinical_template_versions(id) ON DELETE CASCADE,
  section_key    VARCHAR(60)  NOT NULL,
  label          VARCHAR(200) NOT NULL,
  description    TEXT,
  builtin        BOOLEAN NOT NULL DEFAULT true,   -- rendered by an existing InferPad block
  enabled        BOOLEAN NOT NULL DEFAULT true,
  required       BOOLEAN NOT NULL DEFAULT false,  -- section must not be empty on save
  locked         BOOLEAN NOT NULL DEFAULT false,  -- compliance: lower levels cannot hide / relax it
  print_enabled  BOOLEAN NOT NULL DEFAULT true,
  default_value  JSONB,                           -- prefill for text sections (e.g. advice)
  display_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (version_id, section_key)
);
CREATE INDEX IF NOT EXISTS idx_ct_sections_version ON clinical_template_sections (version_id, display_order);

CREATE TABLE IF NOT EXISTS clinical_template_fields (
  id             SERIAL PRIMARY KEY,
  section_id     INTEGER NOT NULL REFERENCES clinical_template_sections(id) ON DELETE CASCADE,
  field_key      VARCHAR(60)  NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{0,59}$'),
  label          VARCHAR(200) NOT NULL,
  description    TEXT,
  field_type     VARCHAR(20)  NOT NULL CHECK (field_type IN (
                   'text','textarea','number','decimal','dropdown','multiselect','radio',
                   'checkbox','date','time','datetime','boolean','measurement')),
  placeholder    VARCHAR(200),
  default_value  JSONB,
  required       BOOLEAN NOT NULL DEFAULT false,
  locked         BOOLEAN NOT NULL DEFAULT false,
  enabled        BOOLEAN NOT NULL DEFAULT true,
  print_enabled  BOOLEAN NOT NULL DEFAULT true,
  min_value      NUMERIC,
  max_value      NUMERIC,
  min_length     INTEGER,
  max_length     INTEGER,
  options        JSONB,          -- [{ value, label }]
  unit           VARCHAR(40),
  validation     JSONB,          -- { pattern, step, ref_ranges:[{sex,age_min,age_max,low,high}] }
  visibility     JSONB,          -- { field, op, value } — show only when condition holds
  storage        VARCHAR(10) NOT NULL DEFAULT 'custom' CHECK (storage IN ('custom', 'core')),
  core_path      VARCHAR(80),    -- for storage='core': e.g. 'vitals.pulse', 'medications[].route'
  display_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (section_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_ct_fields_section ON clinical_template_fields (section_id, display_order);

-- Published / archived versions are immutable.
CREATE OR REPLACE FUNCTION clinical_template_guard_version_rows() RETURNS trigger AS $$
DECLARE v_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'clinical_template_sections' THEN
    SELECT status INTO v_status FROM clinical_template_versions
     WHERE id = COALESCE(NEW.version_id, OLD.version_id);
  ELSE
    SELECT v.status INTO v_status
      FROM clinical_template_sections s JOIN clinical_template_versions v ON v.id = s.version_id
     WHERE s.id = COALESCE(NEW.section_id, OLD.section_id);
  END IF;
  -- Deleting a whole version (cascade) leaves no parent to look up: allow.
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'clinical template version is % and cannot be modified', v_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ct_sections_guard ON clinical_template_sections;
CREATE TRIGGER trg_ct_sections_guard BEFORE INSERT OR UPDATE OR DELETE ON clinical_template_sections
  FOR EACH ROW EXECUTE FUNCTION clinical_template_guard_version_rows();
DROP TRIGGER IF EXISTS trg_ct_fields_guard ON clinical_template_fields;
CREATE TRIGGER trg_ct_fields_guard BEFORE INSERT OR UPDATE OR DELETE ON clinical_template_fields
  FOR EACH ROW EXECUTE FUNCTION clinical_template_guard_version_rows();

CREATE OR REPLACE FUNCTION clinical_template_guard_version() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.definition IS DISTINCT FROM OLD.definition OR NEW.template_id <> OLD.template_id
       OR NEW.version_no <> OLD.version_no
       OR NOT (NEW.status = OLD.status OR (OLD.status = 'published' AND NEW.status = 'archived')) THEN
      RAISE EXCEPTION 'published clinical template versions are immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ct_version_guard ON clinical_template_versions;
CREATE TRIGGER trg_ct_version_guard BEFORE UPDATE ON clinical_template_versions
  FOR EACH ROW EXECUTE FUNCTION clinical_template_guard_version();

-- ── Clinic selection (opt-in) and doctor choice ─────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_template_selections (
  clinic_id   INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES clinical_templates(id) ON DELETE CASCADE,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clinic_id, template_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_template_default
  ON clinic_template_selections (clinic_id) WHERE is_default;

ALTER TABLE emr_clinic_staff
  ADD COLUMN IF NOT EXISTS clinical_template_id INTEGER REFERENCES clinical_templates(id) ON DELETE SET NULL;

-- ── Overrides (clinic level: staff_id NULL; doctor level: staff_id set) ─────
CREATE TABLE IF NOT EXISTS clinical_template_overrides (
  id          SERIAL PRIMARY KEY,
  clinic_id   INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  staff_id    INTEGER REFERENCES emr_clinic_staff(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES clinical_templates(id) ON DELETE CASCADE,
  section_key VARCHAR(60) NOT NULL,
  field_key   VARCHAR(60) NOT NULL DEFAULT '',   -- '' = the section itself
  kind        VARCHAR(10) NOT NULL DEFAULT 'modify' CHECK (kind IN ('modify', 'add')),
  props       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinical_template_overrides
  ON clinical_template_overrides (clinic_id, COALESCE(staff_id, 0), template_id, section_key, field_key);
CREATE INDEX IF NOT EXISTS idx_ct_overrides_lookup
  ON clinical_template_overrides (template_id, clinic_id, staff_id);

-- ── Consultation snapshots and custom values ────────────────────────────────
CREATE TABLE IF NOT EXISTS consultation_template_snapshots (
  id          SERIAL PRIMARY KEY,
  hash        VARCHAR(64) NOT NULL UNIQUE,     -- identical effective templates share one snapshot
  template_id INTEGER REFERENCES clinical_templates(id) ON DELETE SET NULL,
  version_id  INTEGER REFERENCES clinical_template_versions(id) ON DELETE SET NULL,
  definition  JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE emr_encounters
  ADD COLUMN IF NOT EXISTS template_snapshot_id INTEGER
  REFERENCES consultation_template_snapshots(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS consultation_field_values (
  id           SERIAL PRIMARY KEY,
  encounter_id INTEGER NOT NULL REFERENCES emr_encounters(id) ON DELETE CASCADE,
  clinic_id    INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  snapshot_id  INTEGER NOT NULL REFERENCES consultation_template_snapshots(id) ON DELETE RESTRICT,
  section_key  VARCHAR(60) NOT NULL,
  field_key    VARCHAR(60) NOT NULL,
  value        JSONB,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (encounter_id, section_key, field_key)
);
CREATE INDEX IF NOT EXISTS idx_cfv_clinic_field ON consultation_field_values (clinic_id, section_key, field_key);

-- ── Audit ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_template_audit (
  id          BIGSERIAL PRIMARY KEY,
  clinic_id   INTEGER,                 -- NULL for system-template actions
  staff_id    INTEGER,
  admin_id    INTEGER,
  template_id INTEGER,
  version_id  INTEGER,
  action      VARCHAR(40) NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ct_audit_template ON clinical_template_audit (template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ct_audit_clinic   ON clinical_template_audit (clinic_id, created_at DESC);

COMMIT;
