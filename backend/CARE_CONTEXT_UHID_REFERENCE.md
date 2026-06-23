# Care Context Reference Number - UHID Format

## Overview
Care context reference numbers now use **UHID (clinic-specific patient identifier)** as the primary component, providing better patient data traceability and alignment with existing HIS/ERP systems.

## Format Change

### Old Format (Deprecated)
```
OPD-YYYYMMDD-AAAAAA
├─ OPD: Visit type prefix
├─ YYYYMMDD: Appointment date
└─ AAAAAA: Appointment ID (zero-padded)

Example: OPD-20260622-000001
```

### New Format (Current)
```
{UHID}-YYYYMMDD
├─ UHID: Clinic-specific patient identifier (e.g., "2-1")
└─ YYYYMMDD: Date component (appointment or creation date)

Example: 2-1-20260622
```

## Implementation Details

### 1. Appointment-Based Care Context (emr.appointment.controller.js)
When an appointment is completed and an encounter is created:

```javascript
// Fetch UHID from patient_clinics (clinic-specific)
const patientUhidResult = await pool.query(
  `SELECT pc.uhid FROM patient_clinics pc 
   WHERE pc.patient_id=$1 AND pc.clinic_id=$2`,
  [appointmentPatientId, clinicId]
);

// Generate reference: {UHID}-{YYYYMMDD}
const uhid = patientUhidResult?.uhid || `unknown-${patientId}`;
const refNum = `${uhid}-${dateStr}`;

// Example result: "2-1-20260623"
```

**Fallback**: If UHID is not found, uses `unknown-{patientId}` pattern to avoid breaking existing workflows.

### 2. Manual Care Context (emr.controller.js)
When manually creating a care context via API:

```javascript
// Requires UHID to be assigned first
const uhidResult = await pool.query(
  `SELECT pc.uhid FROM patient_clinics pc 
   WHERE pc.patient_id=$1 AND pc.clinic_id=$2`,
  [patientId, clinicId]
);

if (!uhidResult?.uhid) {
  return res.status(400).json({ 
    error: 'Patient UHID not found. Assign UHID first.' 
  });
}

// Generate reference: {UHID}-{YYYYMMDD}
const refNum = `${uhid}-${timestamp}`;

// Example result: "2-1-20260623"
```

**Requirement**: Patient must have UHID assigned in `patient_clinics` before creating care contexts manually.

## Database Structure

### patient_clinics Table
```sql
CREATE TABLE patient_clinics (
  id             SERIAL PRIMARY KEY,
  patient_id     INTEGER REFERENCES emr_patients(id),
  clinic_id      INTEGER REFERENCES emr_clinics(id),
  uhid           VARCHAR(100) UNIQUE,  -- Single source of truth for UHID
  first_visit_at TIMESTAMPTZ,
  last_visit_at  TIMESTAMPTZ,
  status         VARCHAR(20),
  UNIQUE(patient_id, clinic_id)
);
```

### emr_care_contexts Table
```sql
CREATE TABLE emr_care_contexts (
  id               SERIAL PRIMARY KEY,
  patient_id       INTEGER REFERENCES emr_patients(id),
  clinic_id        INTEGER REFERENCES emr_clinics(id),
  reference_number VARCHAR(255) UNIQUE,  -- {UHID}-{YYYYMMDD}
  display          VARCHAR(255),
  health_records   JSONB,                -- Multiple HI types per context
  link_status      VARCHAR(50),          -- pending, linked, failed
  created_at       TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ
);
```

## Benefits

1. **Clinic-Specific Identification**: UHID is unique per patient per clinic, making references meaningful within clinic context
2. **HIS/ERP Integration**: UHID aligns with existing hospital systems and patient registration processes
3. **Human-Readable**: Doctor/staff can quickly identify patient from reference number
4. **Queryable**: Easy to search care contexts by UHID pattern
5. **Backward Compatible**: Old OPD-format references continue to work; only new contexts use UHID format

## Migration & Backward Compatibility

### Existing Data
- Care contexts with old `OPD-YYYYMMDD-XXXXXX` format remain unchanged
- No data migration needed; format change is forward-only
- Both formats coexist in the database

### New Care Contexts
- All newly created care contexts use `{UHID}-{YYYYMMDD}` format
- ABDM link operations work with both formats
- FHIR bundle references use the new format

## API Changes

### Creating Care Context (POST /api/emr/patients/:id/care-contexts)
**Before**: Would generate `REF-{UUID}` format
**After**: Requires UHID to be assigned; generates `{UHID}-{YYYYMMDD}`

**Prerequisite**: Patient must have UHID assigned via:
```bash
POST /api/emr/patients/:id/uhid
{
  "uhid": "2-1"  # Clinic-specific unique ID
}
```

## Testing

### Scenario 1: Appointment-Based Care Context
```
1. Patient booked for appointment with UHID "2-1"
2. Appointment completed, encounter created
3. Care context automatically created with reference: "2-1-20260623"
4. ABDM link attempt made with new reference number
```

### Scenario 2: Manual Care Context
```
1. POST /api/emr/patients/123/care-contexts
   { "display": "Lab Report" }
2. Error if UHID not assigned: "Patient UHID not found. Assign UHID first."
3. Assign UHID: POST /api/emr/patients/123/uhid { "uhid": "2-1" }
4. Retry care context creation
5. Care context created with reference: "2-1-20260623"
```

## Migration Notes

**Date**: 2026-06-23
**Files Changed**:
- `backend/src/emr/emr.appointment.controller.js` (line 536)
- `backend/src/emr/emr.controller.js` (line 218)

**Migration SQL**: `backend/migrations/056_care_context_uhid_reference.sql`

## Troubleshooting

### Issue: "Patient UHID not found"
**Cause**: Trying to create care context without UHID assignment
**Solution**: Assign UHID first via `POST /api/emr/patients/:id/uhid`

### Issue: Care context reference shows "unknown-{patientId}"
**Cause**: UHID lookup failed during appointment completion
**Solution**: Verify patient_clinics record exists for patient-clinic pair; check UHID assignment

### Issue: Old care contexts still showing OPD- format
**Expected Behavior**: Old references are unchanged; only new contexts use UHID format
**No Action Required**: System supports both formats

