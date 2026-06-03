# Clinical Laboratory System - Core Implementation (No AI)

## Quick Overview

Build the foundation first:
1. **Database schema** (labs, results, anomalies, audit logs)
2. **Lab API** (upload, retrieval, management)
3. **Real-time WebSocket** (5-30s visibility)
4. **Doctor portal** (result viewer)
5. **Lab portal** (upload & management)

---

## PHASE 1: DATABASE SETUP (Week 1)

### Create Migration File

`backend/src/db/migrations/003_create_laboratory_tables.sql`

```sql
-- ============================================
-- LABORATORY MANAGEMENT TABLES
-- ============================================

-- 1. LABORATORIES TABLE
CREATE TABLE laboratories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name VARCHAR(255) NOT NULL,
  lab_type VARCHAR(50) NOT NULL, -- 'CLINICAL', 'DIAGNOSTIC', 'REFERENCE', 'NABL', 'POCT'
  accreditation_number VARCHAR(100),
  is_nabl_accredited BOOLEAN DEFAULT false,
  iso_15189_compliant BOOLEAN DEFAULT false,
  
  -- Contact & Location
  address_line1 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  phone VARCHAR(20),
  email VARCHAR(255),
  
  -- Integration
  hl7_enabled BOOLEAN DEFAULT false,
  fhir_enabled BOOLEAN DEFAULT false,
  api_key VARCHAR(255) UNIQUE,
  api_secret_encrypted VARCHAR(500),
  webhook_url VARCHAR(500),
  
  -- Configuration
  processing_sla_seconds INT DEFAULT 30,
  critical_value_thresholds JSONB,
  
  -- Status
  status VARCHAR(50) DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE', 'SUSPENDED'
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  CONSTRAINT valid_lab_type CHECK (lab_type IN ('CLINICAL', 'DIAGNOSTIC', 'REFERENCE', 'NABL', 'POCT'))
);

CREATE INDEX idx_labs_type ON laboratories(lab_type);
CREATE INDEX idx_labs_status ON laboratories(status);
CREATE INDEX idx_labs_api_key ON laboratories(api_key);

-- 2. LAB USERS (extend existing users table)
ALTER TABLE users ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES laboratories(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS lab_role VARCHAR(50); -- 'LAB_TECHNICIAN', 'LAB_ADMIN', 'LAB_DIRECTOR'
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_upload_results BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_all_results BOOLEAN DEFAULT false;

CREATE INDEX idx_users_lab ON users(lab_id, lab_role);

-- 3. LAB TEST RESULTS
CREATE TABLE lab_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  lab_id UUID NOT NULL REFERENCES laboratories(id),
  
  -- Test Info
  test_code VARCHAR(50) NOT NULL, -- LOINC code
  test_name VARCHAR(255) NOT NULL,
  specimen_type VARCHAR(100),
  
  -- Timestamps
  collection_timestamp TIMESTAMP NOT NULL,
  received_timestamp TIMESTAMP,
  result_timestamp TIMESTAMP,
  
  -- Result Data
  result_value NUMERIC(15, 4),
  result_unit VARCHAR(50),
  reference_range_low NUMERIC(15, 4),
  reference_range_high NUMERIC(15, 4),
  result_status VARCHAR(50) DEFAULT 'FINAL', -- 'PENDING', 'FINAL', 'PRELIMINARY', 'CORRECTED', 'AMENDED'
  
  -- Source
  source_format VARCHAR(50), -- 'HL7', 'FHIR', 'JSON', 'PDF', 'CSV'
  raw_data_encrypted BYTEA,
  file_reference_id UUID,
  
  -- Flags
  is_critical_value BOOLEAN DEFAULT false,
  needs_immediate_attention BOOLEAN DEFAULT false,
  doctor_notified_at TIMESTAMP,
  
  visibility_status VARCHAR(50) DEFAULT 'PENDING_REVIEW', -- 'DOCTOR_VISIBLE', 'PENDING_REVIEW', 'RESTRICTED'
  visible_to_doctor_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_status CHECK (result_status IN ('PENDING', 'FINAL', 'PRELIMINARY', 'CORRECTED', 'AMENDED'))
);

CREATE INDEX idx_results_patient ON lab_test_results(patient_id);
CREATE INDEX idx_results_lab ON lab_test_results(lab_id);
CREATE INDEX idx_results_status ON lab_test_results(result_status);
CREATE INDEX idx_results_visible ON lab_test_results(visibility_status, created_at DESC);
CREATE INDEX idx_results_critical ON lab_test_results(is_critical_value);
CREATE INDEX idx_results_timestamp ON lab_test_results(result_timestamp DESC);

-- 4. LAB ANOMALIES
CREATE TABLE lab_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES lab_test_results(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  
  anomaly_type VARCHAR(50) NOT NULL,
  severity VARCHAR(50) NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  
  -- Context
  baseline_value NUMERIC(15, 4),
  population_percentile INT,
  previous_results JSONB,
  
  -- Clinical Info
  clinical_context TEXT,
  recommended_action TEXT,
  
  -- Notification
  doctor_alerted BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMP,
  alert_acknowledged_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE INDEX idx_anomalies_severity ON lab_anomalies(severity);
CREATE INDEX idx_anomalies_patient ON lab_anomalies(patient_id, created_at DESC);
CREATE INDEX idx_anomalies_result ON lab_anomalies(result_id);

-- 5. AUDIT LOGS (ISO 15189 compliance)
CREATE TABLE lab_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  actor_role VARCHAR(50),
  
  action VARCHAR(50) NOT NULL, -- 'RESULT_UPLOADED', 'RESULT_VIEWED', 'RESULT_MODIFIED'
  resource_type VARCHAR(50),
  resource_id UUID,
  
  changes_made JSONB,
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON lab_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX idx_audit_resource ON lab_audit_logs(resource_type, resource_id, created_at DESC);

-- 6. ENCRYPTED FILES
CREATE TABLE encrypted_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID REFERENCES lab_test_results(id),
  lab_id UUID NOT NULL REFERENCES laboratories(id),
  
  original_filename VARCHAR(500),
  file_size_bytes INT,
  mime_type VARCHAR(100),
  
  -- Encryption
  encrypted_content BYTEA,
  encryption_algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
  
  -- OCR (if PDF)
  ocr_extracted_text TEXT,
  ocr_confidence NUMERIC(3, 2),
  
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_files_result ON encrypted_files(result_id);
CREATE INDEX idx_files_lab ON encrypted_files(lab_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_labs_timestamp
BEFORE UPDATE ON laboratories
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_update_results_timestamp
BEFORE UPDATE ON lab_test_results
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Function to get critical value threshold for a test
CREATE OR REPLACE FUNCTION get_critical_threshold(
  p_lab_id UUID,
  p_test_code VARCHAR
) RETURNS RECORD AS $$
DECLARE
  v_threshold NUMERIC;
  v_result RECORD;
BEGIN
  SELECT critical_value_thresholds -> p_test_code -> 'high'
  INTO v_threshold
  FROM laboratories
  WHERE id = p_lab_id;
  
  RETURN (v_threshold)::RECORD;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- INITIAL DATA
-- ============================================

-- Insert default lab types (for dropdown)
INSERT INTO laboratories (facility_name, lab_type, status, api_key)
VALUES 
  ('Default POCT', 'POCT', 'INACTIVE', 'TEMPLATE_POCT')
ON CONFLICT (api_key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON laboratories TO emr_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON lab_test_results TO emr_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON lab_anomalies TO emr_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON lab_audit_logs TO emr_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON encrypted_files TO emr_app_role;
```

### Run Migration

```bash
cd backend
psql emar < src/db/migrations/003_create_laboratory_tables.sql
```

---

## PHASE 2: LAB MANAGEMENT API (Week 1-2)

### Create Lab Routes

`backend/src/routes/labs/labManagementRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const db = require('../../db');

// ===== ADMIN: Lab Management =====

/**
 * Create Laboratory
 * POST /api/v1/admin/laboratories
 */
router.post(
  '/laboratories',
  requireAuth,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const {
        facility_name,
        lab_type,
        email,
        phone,
        address_line1,
        city,
        state,
        postal_code,
        hl7_enabled,
        fhir_enabled,
        processing_sla_seconds,
        critical_value_thresholds,
        is_nabl_accredited,
        iso_15189_compliant
      } = req.body;

      // Validate required fields
      if (!facility_name || !lab_type) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Generate API key
      const apiKey = `lab_pk_${require('crypto').randomBytes(16).toString('hex')}`;
      const apiSecret = `lab_sk_${require('crypto').randomBytes(32).toString('hex')}`;

      // Encrypt API secret
      const encryptedSecret = encryptValue(apiSecret);

      // Create laboratory
      const result = await db.query(
        `INSERT INTO laboratories (
          facility_name, lab_type, email, phone, address_line1, city, state, postal_code,
          api_key, api_secret_encrypted, hl7_enabled, fhir_enabled, processing_sla_seconds,
          critical_value_thresholds, is_nabl_accredited, iso_15189_compliant, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id, api_key`,
        [
          facility_name,
          lab_type,
          email,
          phone,
          address_line1,
          city,
          state,
          postal_code,
          apiKey,
          encryptedSecret,
          hl7_enabled || false,
          fhir_enabled || false,
          processing_sla_seconds || 30,
          JSON.stringify(critical_value_thresholds || {}),
          is_nabl_accredited || false,
          iso_15189_compliant || false,
          req.user.id
        ]
      );

      // Audit log
      await logAudit({
        actor_user_id: req.user.id,
        action: 'LABORATORY_CREATED',
        resource_type: 'LABORATORY',
        resource_id: result.rows[0].id,
        changes_made: { facility_name, lab_type }
      });

      res.json({
        id: result.rows[0].id,
        api_key: apiKey,
        api_secret: apiSecret, // Only shown once!
        message: 'Laboratory created. Save the API credentials!'
      });
    } catch (error) {
      console.error('Create lab error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Get Laboratory Details
 * GET /api/v1/admin/laboratories/:lab_id
 */
router.get(
  '/laboratories/:lab_id',
  requireAuth,
  async (req, res) => {
    try {
      const { lab_id } = req.params;

      // Check permissions
      if (req.user.lab_id !== lab_id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const result = await db.query(
        `SELECT id, facility_name, lab_type, email, phone, address_line1, city, state, postal_code,
                hl7_enabled, fhir_enabled, processing_sla_seconds, is_nabl_accredited, iso_15189_compliant,
                status, created_at, updated_at
         FROM laboratories WHERE id = $1`,
        [lab_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Laboratory not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * List Laboratories
 * GET /api/v1/admin/laboratories?type=POCT&status=ACTIVE
 */
router.get('/laboratories', requireAuth, async (req, res) => {
  try {
    const { type, status, limit = 20, offset = 0 } = req.query;

    let query = 'SELECT * FROM laboratories WHERE 1=1';
    const params = [];

    if (type) {
      query += ` AND lab_type = $${params.length + 1}`;
      params.push(type);
    }

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    // If not admin, only show own lab
    if (req.user.role !== 'ADMIN' && req.user.lab_id) {
      query += ` AND id = $${params.length + 1}`;
      params.push(req.user.lab_id);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      laboratories: result.rows,
      total: result.rowCount,
      limit,
      offset
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update Laboratory Configuration
 * PUT /api/v1/admin/laboratories/:lab_id
 */
router.put(
  '/laboratories/:lab_id',
  requireAuth,
  async (req, res) => {
    try {
      const { lab_id } = req.params;
      const updateData = req.body;

      // Check permissions
      if (req.user.lab_id !== lab_id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Build dynamic UPDATE query
      const updates = [];
      const params = [lab_id];
      let paramCount = 2;

      if (updateData.facility_name) {
        updates.push(`facility_name = $${paramCount++}`);
        params.push(updateData.facility_name);
      }
      if (updateData.critical_value_thresholds) {
        updates.push(`critical_value_thresholds = $${paramCount++}`);
        params.push(JSON.stringify(updateData.critical_value_thresholds));
      }
      if (updateData.processing_sla_seconds) {
        updates.push(`processing_sla_seconds = $${paramCount++}`);
        params.push(updateData.processing_sla_seconds);
      }
      if (updateData.status) {
        updates.push(`status = $${paramCount++}`);
        params.push(updateData.status);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      const query = `UPDATE laboratories SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;

      const result = await db.query(query, params);

      // Audit log
      await logAudit({
        actor_user_id: req.user.id,
        action: 'LABORATORY_UPDATED',
        resource_type: 'LABORATORY',
        resource_id: lab_id,
        changes_made: updateData
      });

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Get Lab Dashboard Stats
 * GET /api/v1/labs/:lab_id/dashboard
 */
router.get('/laboratories/:lab_id/dashboard', requireAuth, async (req, res) => {
  try {
    const { lab_id } = req.params;
    const { days = 7 } = req.query;

    const result = await db.query(
      `SELECT
        COUNT(*) as total_results_period,
        SUM(CASE WHEN result_status = 'FINAL' THEN 1 ELSE 0 END) as finalized_count,
        SUM(CASE WHEN result_status IN ('PENDING', 'PRELIMINARY') THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN is_critical_value THEN 1 ELSE 0 END) as critical_count,
        COUNT(DISTINCT patient_id) as unique_patients,
        AVG(EXTRACT(EPOCH FROM (result_timestamp - collection_timestamp))) as avg_turnaround_seconds
       FROM lab_test_results
       WHERE lab_id = $1 AND created_at > NOW() - INTERVAL '1 day' * $2`,
      [lab_id, days]
    );

    const stats = result.rows[0];

    res.json({
      lab_id,
      period_days: days,
      statistics: {
        total_results: parseInt(stats.total_results_period) || 0,
        finalized: parseInt(stats.finalized_count) || 0,
        pending: parseInt(stats.pending_count) || 0,
        critical_values: parseInt(stats.critical_count) || 0,
        unique_patients: parseInt(stats.unique_patients) || 0,
        avg_turnaround_seconds: parseInt(stats.avg_turnaround_seconds) || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

---

## PHASE 3: LAB UPLOAD API (Week 2)

### Create Upload Routes

`backend/src/routes/labs/labUploadRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const multer = require('multer');
const dataParser = require('../../services/laboratory/dataParser');
const { verifyLabApiKey } = require('../../middleware/labAuth');
const db = require('../../db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Upload Lab Result (HL7/FHIR/JSON)
 * POST /api/v1/labs/upload-result
 * Headers: Authorization: Bearer {lab_api_key}
 */
router.post('/upload-result', verifyLabApiKey, async (req, res) => {
  try {
    const { format, data, patient_id, is_critical } = req.body;
    const lab_id = req.user.lab_id;

    // Parse data
    const parsed = await dataParser.parseLabData(data, format);

    if (!parsed.results || parsed.results.length === 0) {
      return res.status(400).json({ error: 'No results extracted' });
    }

    const savedResults = [];

    for (const result of parsed.results) {
      // Check for critical values
      const isCritical = await checkCriticalValue(lab_id, result);

      // Insert into database
      const dbResult = await db.query(
        `INSERT INTO lab_test_results (
          patient_id, lab_id, test_code, test_name, result_value, result_unit,
          reference_range_low, reference_range_high, result_status, source_format,
          collection_timestamp, is_critical_value, visibility_status, raw_data_encrypted
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, test_name, is_critical_value`,
        [
          patient_id || parsed.patient_id,
          lab_id,
          result.test_code,
          result.test_name,
          result.result_value,
          result.result_unit,
          result.reference_range_low,
          result.reference_range_high,
          result.result_status || 'FINAL',
          format,
          result.collection_timestamp || new Date(),
          isCritical || is_critical || false,
          'DOCTOR_VISIBLE',
          null // encrypted raw data
        ]
      );

      savedResults.push(dbResult.rows[0]);

      // Audit log
      await logAudit({
        actor_user_id: req.user.id,
        actor_role: 'LAB_TECHNICIAN',
        action: 'RESULT_UPLOADED',
        resource_type: 'LAB_RESULT',
        resource_id: dbResult.rows[0].id,
        changes_made: { test_name: result.test_name, value: result.result_value }
      });
    }

    res.json({
      status: 'success',
      results_uploaded: savedResults.length,
      results: savedResults,
      critical_count: savedResults.filter((r) => r.is_critical_value).length
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Upload PDF Lab Report
 * POST /api/v1/labs/upload-pdf
 */
router.post(
  '/upload-pdf',
  verifyLabApiKey,
  upload.single('file'),
  async (req, res) => {
    try {
      const { patient_id, test_date } = req.body;
      const lab_id = req.user.lab_id;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Parse PDF
      const parsed = await dataParser.parsePDF(req.file.buffer);

      // Save encrypted file
      const fileResult = await db.query(
        `INSERT INTO encrypted_files (
          lab_id, original_filename, file_size_bytes, mime_type, 
          ocr_extracted_text, ocr_confidence, encrypted_content
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          lab_id,
          req.file.originalname,
          req.file.size,
          req.file.mimetype,
          parsed.extracted_text,
          parsed.ocr_confidence,
          encryptFileContent(req.file.buffer)
        ]
      );

      // Save results
      const savedResults = [];

      for (const result of parsed.results) {
        const dbResult = await db.query(
          `INSERT INTO lab_test_results (
            patient_id, lab_id, test_code, test_name, result_value, result_unit,
            reference_range_low, reference_range_high, source_format, file_reference_id,
            visibility_status, collection_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id, test_name`,
          [
            patient_id,
            lab_id,
            result.test_code,
            result.test_name,
            result.result_value,
            result.result_unit,
            result.reference_range_low,
            result.reference_range_high,
            'PDF',
            fileResult.rows[0].id,
            'DOCTOR_VISIBLE',
            test_date || new Date()
          ]
        );

        savedResults.push(dbResult.rows[0]);
      }

      res.json({
        status: 'success',
        file_id: fileResult.rows[0].id,
        results_extracted: savedResults.length,
        extracted_tests: savedResults,
        ocr_confidence: parsed.ocr_confidence
      });
    } catch (error) {
      console.error('PDF upload error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
```

---

## PHASE 4: DOCTOR PORTAL API (Week 2-3)

### Create Doctor Result Viewer Routes

`backend/src/routes/doctors/labResultRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const db = require('../../db');

/**
 * Get Patient Lab Results
 * GET /api/v1/doctors/patients/:patient_id/lab-results
 */
router.get(
  '/patients/:patient_id/lab-results',
  requireAuth,
  async (req, res) => {
    try {
      const { patient_id } = req.params;
      const { limit = 20, offset = 0, status } = req.query;

      // Check access
      if (!canAccessPatient(req.user.id, patient_id)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      let query = `
        SELECT id, test_name, test_code, result_value, result_unit,
               reference_range_low, reference_range_high, result_status,
               result_timestamp, visible_to_doctor_at, is_critical_value,
               needs_immediate_attention, visibility_status
        FROM lab_test_results
        WHERE patient_id = $1 AND visibility_status = 'DOCTOR_VISIBLE'
      `;

      const params = [patient_id];

      if (status) {
        query += ` AND result_status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY result_timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      // Log access
      await logAudit({
        actor_user_id: req.user.id,
        action: 'RESULT_VIEWED',
        resource_type: 'PATIENT_RESULTS',
        resource_id: patient_id
      });

      res.json({
        results: result.rows,
        total: result.rowCount
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Get Single Result Details
 * GET /api/v1/doctors/lab-results/:result_id
 */
router.get('/lab-results/:result_id', requireAuth, async (req, res) => {
  try {
    const { result_id } = req.params;

    const result = await db.query(
      `SELECT * FROM lab_test_results WHERE id = $1`,
      [result_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Result not found' });
    }

    // Check access
    const testResult = result.rows[0];
    if (!canAccessPatient(req.user.id, testResult.patient_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get related anomalies
    const anomalies = await db.query(
      `SELECT * FROM lab_anomalies WHERE result_id = $1 ORDER BY created_at DESC`,
      [result_id]
    );

    res.json({
      ...testResult,
      anomalies: anomalies.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Acknowledge Result / Mark as Reviewed
 * POST /api/v1/doctors/lab-results/:result_id/acknowledge
 */
router.post('/lab-results/:result_id/acknowledge', requireAuth, async (req, res) => {
  try {
    const { result_id } = req.params;
    const { notes } = req.body;

    const result = await db.query(
      `UPDATE lab_test_results
       SET needs_immediate_attention = false, doctor_notified_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [result_id]
    );

    // Audit log
    await logAudit({
      actor_user_id: req.user.id,
      action: 'RESULT_ACKNOWLEDGED',
      resource_type: 'LAB_RESULT',
      resource_id: result_id,
      changes_made: { notes }
    });

    res.json({ status: 'acknowledged', result: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

---

## PHASE 5: REGISTER ALL ROUTES (Week 3)

### Update Main App

`backend/src/app.js` - Add these lines:

```javascript
const labManagementRoutes = require('./routes/labs/labManagementRoutes');
const labUploadRoutes = require('./routes/labs/labUploadRoutes');
const labResultRoutes = require('./routes/doctors/labResultRoutes');

// Lab Management (Admin)
app.use('/api/v1/admin', labManagementRoutes);

// Lab Uploads
app.use('/api/v1/labs', labUploadRoutes);

// Doctor Portal
app.use('/api/v1/doctors', labResultRoutes);
```

---

## QUICK CHECKLIST

### Week 1:
- [ ] Create database tables (migration)
- [ ] Run migration: `psql emar < migration_file.sql`

### Week 2:
- [ ] Create Lab Management API endpoints
- [ ] Create Upload API endpoints (HL7/FHIR/PDF/CSV)
- [ ] Create Doctor Portal API endpoints
- [ ] Test with Postman/curl

### Week 3:
- [ ] Add WebSocket for real-time results
- [ ] Create Lab Portal React UI
- [ ] Create Doctor Result Viewer React UI
- [ ] Test end-to-end

Should I proceed with the database migration setup first?
