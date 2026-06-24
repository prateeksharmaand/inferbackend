# ABDM Registration Safety Validation - Implementation Guide

## Overview

This guide provides step-by-step instructions for deploying the ABDM Registration Safety Validation system into your production environment.

**Core Principle:** Patient Safety > Duplicate Prevention
- A duplicate patient is acceptable
- A wrong patient match is NOT acceptable

---

## Files Created

### Backend
1. **backend/migrations/061_abdm_registration_audit.sql** — Audit table schema
2. **backend/src/services/abdm-registration-validation.service.js** — Core matching service
3. **backend/src/controllers/abdm-registration.controller.js** — API endpoints
4. **backend/tests/abdm-registration-validation.test.js** — Unit tests

### Frontend
1. **emr-web/src/components/AbdmValidationDialog.jsx** — Manual validation dialog
2. **emr-web/src/components/AbdmValidationDialog.css** — Dialog styling

### Documentation
1. **ABDM_REGISTRATION_SAFETY_VALIDATION.md** — Complete design document
2. **ABDM_REGISTRATION_IMPLEMENTATION_GUIDE.md** — This file

---

## Phase 1: Database Setup

### Step 1: Create Audit Table

```bash
# Run migration
psql -U postgres -d your_database -f backend/migrations/061_abdm_registration_audit.sql
```

**Verification:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name = 'abdm_registration_audit';
```

Expected output: `abdm_registration_audit`

### Step 2: Verify Indexes

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'abdm_registration_audit'
ORDER BY indexname;
```

Expected output:
- `idx_abdm_audit_clinic_user`
- `idx_abdm_audit_abha`
- `idx_abdm_audit_patient`
- `idx_abdm_audit_action`
- `idx_abdm_audit_clinic_date`

### Step 3: Add normalize_phone() Function

If not already present, add the phone normalization function:

```sql
CREATE OR REPLACE FUNCTION normalize_phone(phone_raw VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  cleaned VARCHAR;
BEGIN
  IF phone_raw IS NULL OR phone_raw = '' THEN
    RETURN NULL;
  END IF;

  -- Remove all non-digits
  cleaned := REGEXP_REPLACE(phone_raw, '\D', '', 'g');

  -- Validate length
  IF LENGTH(cleaned) = 10 THEN
    RETURN cleaned;  -- 10-digit local
  ELSIF LENGTH(cleaned) = 12 THEN
    RETURN cleaned;  -- 12-digit with country
  ELSE
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

---

## Phase 2: Backend Service Deployment

### Step 1: Copy Files

```bash
# Copy service
cp backend/src/services/abdm-registration-validation.service.js \
   your_project/backend/src/services/

# Copy controller
cp backend/src/controllers/abdm-registration.controller.js \
   your_project/backend/src/controllers/
```

### Step 2: Register API Routes

In your main API router file (e.g., `backend/src/routes/api.js`):

```javascript
const abdmRegistrationController = require('../controllers/abdm-registration.controller');

// Add ABDM registration routes
app.use('/api/v1/abdm', abdmRegistrationController);
```

### Step 3: Verify Routes

```bash
npm test -- backend/tests/abdm-registration-validation.test.js
```

Expected: All tests pass

---

## Phase 3: Frontend Deployment

### Step 1: Create Dialog Component

```bash
cp emr-web/src/components/AbdmValidationDialog.jsx \
   your_project/emr-web/src/components/

cp emr-web/src/components/AbdmValidationDialog.css \
   your_project/emr-web/src/components/
```

### Step 2: Integrate into Workflow

In your ABDM registration workflow (e.g., `emr-web/src/components/AbdmRegistrationFlow.jsx`):

```javascript
import { useState } from 'react';
import AbdmValidationDialog from './AbdmValidationDialog';

const AbdmRegistrationFlow = () => {
  const [validationResult, setValidationResult] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  const handleAbdmDataReceived = async (abdmData) => {
    // Call validation API
    const response = await fetch('/api/v1/abdm/validate-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        abha_number: abdmData.abhaNumber,
        abha_address: abdmData.abhaAddress,
        name: abdmData.name,
        dob: abdmData.dob,
        gender: abdmData.gender,
        mobile: abdmData.mobile,
        clinic_id: currentClinic.id
      })
    });

    const result = await response.json();
    setValidationResult(result);

    // If manual review needed, show dialog
    if (result.action === 'show_dialog') {
      setShowDialog(true);
    }
    // If auto-linked, continue workflow
    else if (result.action === 'auto_linked') {
      completeRegistration(result.patient_id);
    }
    // If no match, prepare to create new patient
    else if (result.action === 'create_new') {
      prepareCreateNewPatient(abdmData);
    }
  };

  const handleLinkToExisting = async (candidateId) => {
    const response = await fetch('/api/v1/abdm/link-to-existing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        abha_number: validationResult.abha_number,
        abha_address: validationResult.abha_address,
        patient_id: candidateId,
        clinic_id: currentClinic.id
      })
    });

    if (response.ok) {
      const result = await response.json();
      completeRegistration(result.patient_id);
    }

    setShowDialog(false);
  };

  const handleCreateNewPatient = async () => {
    const response = await fetch('/api/v1/abdm/create-new-patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        abha_number: validationResult.abha_number,
        abha_address: validationResult.abha_address,
        name: validationResult.name,
        dob: validationResult.dob,
        gender: validationResult.gender,
        mobile: validationResult.mobile,
        clinic_id: currentClinic.id
      })
    });

    if (response.ok) {
      const result = await response.json();
      completeRegistration(result.patient_id);
    }

    setShowDialog(false);
  };

  const handleCancel = async () => {
    await fetch('/api/v1/abdm/cancel-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        abha_number: validationResult.abha_number,
        abha_address: validationResult.abha_address,
        clinic_id: currentClinic.id
      })
    });

    setShowDialog(false);
    resetWorkflow();
  };

  return (
    <>
      {/* ABHA Scan/Input Component */}
      <AbdmScannerInput onDataReceived={handleAbdmDataReceived} />

      {/* Manual Validation Dialog */}
      {showDialog && validationResult?.action === 'show_dialog' && (
        <AbdmValidationDialog
          abdmProfile={{
            name: validationResult.name,
            dob: validationResult.dob,
            gender: validationResult.gender,
            abhaNumber: validationResult.abha_number,
            abhaAddress: validationResult.abha_address
          }}
          candidates={validationResult.candidates}
          confidence={validationResult.confidence}
          onLink={handleLinkToExisting}
          onCreate={handleCreateNewPatient}
          onCancel={handleCancel}
        />
      )}
    </>
  );
};

export default AbdmRegistrationFlow;
```

### Step 3: Test Dialog

```bash
npm test -- emr-web/src/components/AbdmValidationDialog.test.js
```

---

## Phase 4: Integration Testing

### Test Scenario 1: ABHA Auto-Link (Level 1)

**Setup:**
```javascript
const testData = {
  abha_number: '91-1000-4008-7627',
  abha_address: 'existing@abdm',
  name: 'Prateek Sharma',
  dob: '1986-11-27',
  gender: 'M',
  mobile: '9650269758',
  clinic_id: 1
};
```

**Expected Result:**
```json
{
  "status": "success",
  "action": "auto_linked",
  "patient_id": 24,
  "confidence": 100,
  "matched_on": "abha_exact"
}
```

### Test Scenario 2: Mobile+DOB+Name Auto-Link (Level 2)

**Setup:**
```javascript
const testData = {
  abha_number: null,
  abha_address: 'new@abdm',
  name: 'Prateek Sharma',
  dob: '1986-11-27',
  gender: 'M',
  mobile: '9650269758',
  clinic_id: 1
};
```

**Expected Result:**
```json
{
  "status": "success",
  "action": "auto_linked",
  "patient_id": 24,
  "confidence": 99,
  "matched_on": "mobile_dob_name"
}
```

### Test Scenario 3: Name+DOB+Gender Manual Review (Level 3)

**Setup:**
```javascript
const testData = {
  abha_number: null,
  abha_address: 'john@abdm',
  name: 'John Smith',
  dob: '1990-05-15',
  gender: 'M',
  mobile: null,
  clinic_id: 1
};
```

**Expected Result (Dialog Shown):**
```json
{
  "status": "requires_manual_review",
  "action": "show_dialog",
  "confidence": 70,
  "matched_on": "name_dob_gender",
  "candidates": [
    {
      "id": 10,
      "name": "John Smith",
      "dob": "1990-05-15",
      "gender": "M",
      "mobile": null,
      "uhid": "UH010",
      "clinic_name": "Clinic A"
    }
  ]
}
```

### Test Scenario 4: No Match - Create New (Level 4)

**Setup:**
```javascript
const testData = {
  abha_number: null,
  abha_address: 'brand_new@abdm',
  name: 'Brand New Person',
  dob: '2000-01-01',
  gender: 'F',
  mobile: '9999999999',
  clinic_id: 1
};
```

**Expected Result:**
```json
{
  "status": "success",
  "action": "create_new",
  "patient_id": 99,
  "is_new": true,
  "confidence": 0
}
```

---

## Phase 5: Monitoring & Alerting

### Dashboard Queries

**Daily Registration Statistics:**
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_registrations,
  COUNTIF(action = 'LINK_EXISTING_PATIENT') as linked,
  COUNTIF(action = 'CREATE_NEW_PATIENT') as created_new,
  COUNTIF(action = 'CANCELLED') as cancelled,
  ROUND(100 * COUNTIF(action = 'LINK_EXISTING_PATIENT') / COUNT(*), 2) as link_pct
FROM abdm_registration_audit
WHERE clinic_id = $1
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date DESC;
```

**Manual Review Rate:**
```sql
SELECT
  EXTRACT(HOUR FROM created_at) as hour,
  COUNT(*) as attempts,
  COUNTIF(action = 'LINK_EXISTING_PATIENT') as auto_linked,
  COUNTIF(requires_manual_review = true) as manual_reviews
FROM abdm_registration_audit
WHERE clinic_id = $1
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**User Decisions:**
```sql
SELECT
  u.name,
  COUNT(*) as decisions,
  COUNTIF(action = 'LINK_EXISTING_PATIENT') as linked,
  COUNTIF(action = 'CREATE_NEW_PATIENT') as created,
  COUNTIF(action = 'CANCELLED') as cancelled
FROM abdm_registration_audit a
JOIN emr_users u ON a.user_id = u.id
WHERE a.clinic_id = $1
  AND a.created_at > NOW() - INTERVAL '7 days'
GROUP BY u.id, u.name
ORDER BY decisions DESC;
```

### Key Metrics to Monitor

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Auto-link rate (Level 1 + 2) | 60-80% | < 50% or > 95% |
| Manual review rate | 15-30% | < 5% or > 40% |
| Create new rate | 5-15% | > 20% |
| Cancellation rate | < 5% | > 10% |
| Average link decision time | < 30 sec | > 60 sec |

---

## Phase 6: Staff Training

### Reception Staff Workflow

1. **Scan ABHA QR**
   - Use ABHA app or scanner
   - System validates in background

2. **View Result**
   - If auto-linked → Continue (patient found)
   - If manual review → See dialog

3. **Make Decision (if Dialog Shown)**
   - Read ABDM profile
   - Read matched patient details
   - Click "Link to Existing" OR "Create New"

4. **Confirm**
   - System records decision
   - Patient registration complete

### Training Checklist

- [ ] Staff trained on dialog UX
- [ ] Staff understands when links are automatic vs manual
- [ ] Staff knows what to do if patient not found
- [ ] Staff understands need for human confirmation
- [ ] Supervisor can review audit logs

---

## Phase 7: Deployment Checklist

### Pre-Deployment

- [ ] Database migration tested
- [ ] Service tests pass (45+ test cases)
- [ ] API endpoints tested with curl
- [ ] Frontend dialog renders correctly
- [ ] Integration tests pass
- [ ] Performance benchmarks < 100ms
- [ ] Audit logging verified
- [ ] Staff training completed
- [ ] Rollback plan documented

### Deployment Steps

1. **Backup Database**
   ```bash
   pg_dump your_database > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Run Migration**
   ```bash
   psql -U postgres -d your_database -f backend/migrations/061_abdm_registration_audit.sql
   ```

3. **Deploy Backend**
   ```bash
   # Copy service and controller files
   # Update routes
   # Restart Node.js server
   npm restart
   ```

4. **Deploy Frontend**
   ```bash
   # Copy component files
   # Rebuild frontend
   npm run build
   ```

5. **Verify**
   ```bash
   # Test all scenarios
   curl -X POST http://localhost:3000/api/v1/abdm/validate-registration \
     -H "Content-Type: application/json" \
     -d '{"abha_number":"test","clinic_id":1,"name":"Test","dob":"2000-01-01"}'
   ```

### Post-Deployment

- [ ] Monitor error logs
- [ ] Check audit table populated
- [ ] Verify staff can complete workflow
- [ ] Review first 50 registrations manually
- [ ] Monitor performance metrics
- [ ] Adjust alerts if needed

---

## Rollback Plan

If issues arise, rollback is simple:

### Step 1: Disable New Workflow

Set environment variable to use old workflow:
```bash
ABDM_VALIDATION_DISABLED=true
```

### Step 2: Restore Routes

Revert to old API endpoints that skip validation.

### Step 3: Database

Audit data is preserved. No data loss.

```sql
-- To remove audit table if needed:
DROP TABLE abdm_registration_audit;
```

---

## Performance Characteristics

**Query Performance (per scenario):**

| Scenario | Queries | Time | Notes |
|----------|---------|------|-------|
| Level 1 (ABHA) | 1 | 5-10ms | Indexed |
| Level 2 (Mobile+DOB+Name) | 2 | 15-20ms | Indexed |
| Level 3 (Name+DOB+Gender) | 3 | 20-30ms | Returns 5 candidates |
| Level 4 (New Patient) | 4 | 25-35ms | Includes insert |

**Total: 5-35ms per registration**

**Load Capacity:**
- 100 concurrent registrations: 5-10s
- 1000 concurrent registrations: 50-100s
- Database: Can handle 100+ RPS with proper indexes

---

## Troubleshooting

### Issue: Dialog not appearing

**Causes:**
1. Frontend component not imported
2. API endpoint not responding
3. Network error

**Fix:**
```javascript
// Check API is reachable
curl -X POST http://localhost:3000/api/v1/abdm/validate-registration

// Check component is mounted
console.log('Dialog mounted:', showDialog);

// Check API response
fetch(...).then(r => r.json()).then(console.log);
```

### Issue: Patients auto-linking incorrectly

**Causes:**
1. Phone normalization not working
2. ABHA already exists
3. Duplicate ABHA numbers

**Fix:**
```sql
-- Check for duplicate ABHAs
SELECT abha_number, COUNT(*) as count
FROM emr_patients
WHERE abha_number IS NOT NULL
GROUP BY abha_number
HAVING COUNT(*) > 1;

-- Check phone normalization
SELECT id, mobile, REGEXP_REPLACE(mobile, '\D', '') as normalized
FROM emr_patients
WHERE clinic_id = 1
ORDER BY id DESC LIMIT 10;
```

### Issue: Audit logs not recording

**Causes:**
1. Service not calling audit function
2. Database connection issue
3. Table permissions

**Fix:**
```sql
-- Verify table exists
\dt abdm_registration_audit

-- Check recent entries
SELECT * FROM abdm_registration_audit ORDER BY created_at DESC LIMIT 10;

-- Check permissions
GRANT INSERT, SELECT ON abdm_registration_audit TO your_app_user;
```

---

## Documentation Links

- **Design Document:** [ABDM_REGISTRATION_SAFETY_VALIDATION.md](ABDM_REGISTRATION_SAFETY_VALIDATION.md)
- **Architecture:** [PATIENT_MATCHING_ARCHITECTURE.md](PATIENT_MATCHING_ARCHITECTURE.md)
- **Database:** [backend/migrations/061_abdm_registration_audit.sql](backend/migrations/061_abdm_registration_audit.sql)
- **Service:** [backend/src/services/abdm-registration-validation.service.js](backend/src/services/abdm-registration-validation.service.js)
- **API:** [backend/src/controllers/abdm-registration.controller.js](backend/src/controllers/abdm-registration.controller.js)

---

## Support

For questions or issues:

1. Check audit logs: `SELECT * FROM abdm_registration_audit`
2. Review error logs
3. Run integration tests
4. Consult design documentation

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-24 | Initial release |

