# ABDM Registration Integration - Action Items

## Problem

When patients are registered through ABDM (ABHA QR scan, etc.), the system was NOT using the new ABDM registration safety validation service. This caused:

- ❌ Duplicate patient "Prateek Sharma" (ID 27) created without validation
- ❌ No manual review dialog shown for Name+DOB+Gender matches
- ❌ Duplicate "Prateek Sharma" (ID 28) created with ABHA

## Root Cause

The existing `createAppointment()` function in `backend/src/emr/emr.appointment.controller.js` uses old matching logic:

```javascript
// OLD: Simple matching without safety validation
1. Try ABHA lookup
2. Try Name + Mobile lookup
3. Try Name only lookup
4. Create new
```

Missing: **4-level matching with manual review for ambiguous cases**

## Solution

Integrate the new `abdm-registration-integration.js` service into the appointment creation flow.

---

## Integration Steps

### Step 1: Copy Integration Service

```bash
cp backend/src/controllers/abdm-registration-integration.js \
   your_project/backend/src/controllers/
```

### Step 2: Update `createAppointment()` Function

In `backend/src/emr/emr.appointment.controller.js`, modify the patient resolution logic:

**Replace lines 164-204 with:**

```javascript
// ====================================================================
// PATIENT RESOLUTION WITH ABDM VALIDATION
// ====================================================================

const abdmIntegration = require('../controllers/abdm-registration-integration');
let resolvedPatientId = emr_patient_id || null;

// Check if this is an ABDM registration
const isAbdmSource = patient_abha || (patient_name && patient_dob && patient_gender);

try {
  if (!resolvedPatientId) {
    resolvedPatientId = await abdmIntegration.resolvePatientId(
      {
        emr_patient_id,
        patient_name,
        patient_mobile,
        patient_dob,
        patient_gender,
        patient_abha,
        patient_email,
        is_abdm_source: isAbdmSource // Flag for validation
      },
      req.emrUser.clinic_id,
      req.emrUser.id
    );
  }
} catch (validationError) {
  // Manual review required
  if (validationError.message === 'MANUAL_REVIEW_REQUIRED') {
    logger.info('ABDM Manual Review Required', {
      clinic_id: req.emrUser.clinic_id,
      candidate_count: validationError.candidates?.length
    });

    return res.status(202).json({
      status: 'requires_manual_review',
      action: 'show_dialog',
      candidates: validationError.candidates,
      validation: validationError.validation,
      abdm_data: {
        patient_name,
        patient_dob,
        patient_gender,
        patient_abha,
        patient_mobile,
        patient_email
      },
      message: 'Patient demographic match found - manual confirmation required'
    });
  }

  // Other validation errors
  logger.error('Patient Resolution Error', {
    clinic_id: req.emrUser.clinic_id,
    error: validationError.message
  });
  return res.status(400).json({ error: validationError.message });
}
```

### Step 3: Update Frontend to Handle Manual Review Response

In `emr-web/src/components/AddPatientAbhaFlow.jsx` (or your registration component):

```javascript
const handleAbdmRegistration = async (abdmData) => {
  try {
    // Call createAppointment with ABDM data
    const response = await fetch('/api/emr/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queue_id: selectedQueue.id,
        patient_name: abdmData.name,
        patient_dob: abdmData.dob,
        patient_gender: abdmData.gender,
        patient_abha: abdmData.abhaNumber || abdmData.abhaAddress,
        patient_mobile: abdmData.mobile,
        patient_email: abdmData.email,
        appointment_date: new Date().toISOString().split('T')[0],
        channel: 'abdm_scan',
        // ... other fields
      })
    });

    const result = await response.json();

    // Check for manual review requirement
    if (response.status === 202 && result.status === 'requires_manual_review') {
      // Show manual validation dialog
      setShowManualValidation(true);
      setValidationData(result);
      return;
    }

    // Normal success
    if (response.ok) {
      completeRegistration(result);
      return;
    }

    // Error
    showError(result.error);
  } catch (error) {
    showError(error.message);
  }
};

// Handle manual validation decision
const handleManualValidationDecision = async (choice) => {
  try {
    // Call the ABDM validation endpoints
    if (choice.action === 'link') {
      const linkResponse = await fetch('/api/v1/abdm/link-to-existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abha_number: validationData.abdm_data.patient_abha,
          abha_address: validationData.abdm_data.patient_abha,
          patient_id: choice.patient_id,
          clinic_id: currentClinic.id
        })
      });

      if (linkResponse.ok) {
        const linkResult = await linkResponse.json();
        // Now create appointment with resolved patient
        await createAppointmentWithPatient(linkResult.patient_id);
      }
    } else if (choice.action === 'create_new') {
      const createResponse = await fetch('/api/v1/abdm/create-new-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abha_number: validationData.abdm_data.patient_abha,
          abha_address: validationData.abdm_data.patient_abha,
          name: validationData.abdm_data.patient_name,
          dob: validationData.abdm_data.patient_dob,
          gender: validationData.abdm_data.patient_gender,
          mobile: validationData.abdm_data.patient_mobile,
          clinic_id: currentClinic.id
        })
      });

      if (createResponse.ok) {
        const createResult = await createResponse.json();
        // Now create appointment with new patient
        await createAppointmentWithPatient(createResult.patient_id);
      }
    }

    setShowManualValidation(false);
    setValidationData(null);
  } catch (error) {
    showError(error.message);
  }
};
```

### Step 4: Add AbdmValidationDialog to Registration Flow

```javascript
import AbdmValidationDialog from './AbdmValidationDialog';

// In render:
{showManualValidation && validationData && (
  <AbdmValidationDialog
    abdmProfile={{
      name: validationData.abdm_data.patient_name,
      dob: validationData.abdm_data.patient_dob,
      gender: validationData.abdm_data.patient_gender,
      abhaNumber: validationData.abdm_data.patient_abha,
      abhaAddress: validationData.abdm_data.patient_abha
    }}
    candidates={validationData.candidates}
    confidence={validationData.validation.confidence}
    onLink={(candidateId) => 
      handleManualValidationDecision({ action: 'link', patient_id: candidateId })
    }
    onCreate={() => 
      handleManualValidationDecision({ action: 'create_new' })
    }
    onCancel={() => {
      setShowManualValidation(false);
      setValidationData(null);
    }}
  />
)}
```

---

## Testing

### Test Case 1: First Registration (No Match)

**Scenario:** Register "Brand New Person"

```javascript
POST /api/emr/appointments
{
  "patient_name": "Brand New Person",
  "patient_dob": "2000-01-01",
  "patient_gender": "M",
  "patient_abha": "91-1000-9999-9999",
  "patient_mobile": "9999999999",
  "queue_id": 1
}
```

**Expected:** Status 201, patient created

### Test Case 2: Exact Match (Level 2)

**Scenario:** Register "Prateek Sharma" with mobile + DOB + name

```javascript
POST /api/emr/appointments
{
  "patient_name": "Prateek Sharma",
  "patient_dob": "1986-11-27",
  "patient_gender": "M",
  "patient_abha": "91-1000-4008-7627",
  "patient_mobile": "9650269758",
  "queue_id": 1
}
```

**Expected:** 
- Patient ID 28 auto-linked (existing)
- Status 201
- Audit log: ABDM_AUTO_LINKED_MOBILE_DOB_NAME

### Test Case 3: Ambiguous Match (Level 3 - Manual Review)

**Scenario:** Register with Name + DOB + Gender only (no mobile)

```javascript
POST /api/emr/appointments
{
  "patient_name": "Prateek Sharma",
  "patient_dob": "1986-11-27",
  "patient_gender": "M",
  "patient_abha": "91-1000-8888-8888",
  "queue_id": 1
}
```

**Expected:**
- Status 202 (Accepted - requires confirmation)
- Response includes candidates
- Dialog shown to user
- User must choose: Link to existing or Create new

### Test Case 4: ABHA Match (Level 1)

**Scenario:** Register with existing ABHA

```javascript
POST /api/emr/appointments
{
  "patient_name": "Any Name",
  "patient_abha": "91-1000-4008-7627",  // Already linked to patient 28
  "queue_id": 1
}
```

**Expected:**
- Patient ID 28 auto-linked (ABHA is authoritative)
- Status 201
- Audit log: ABHA_AUTO_LINKED

---

## Verification

After integration, verify:

1. **No Duplicates**
   ```sql
   SELECT name, dob, COUNT(*) as count
   FROM emr_patients
   GROUP BY name, dob
   HAVING COUNT(*) > 1
   AND deleted_at IS NULL;
   ```
   Should return: 0 rows (no duplicates)

2. **Audit Trail Complete**
   ```sql
   SELECT action, COUNT(*) as count
   FROM abdm_registration_audit
   GROUP BY action;
   ```
   Should show: ABHA_AUTO_LINKED, ABDM_AUTO_LINKED_MOBILE_DOB_NAME, LINK_EXISTING_PATIENT, etc.

3. **Manual Reviews Recorded**
   ```sql
   SELECT * FROM abdm_registration_audit
   WHERE action = 'LINK_EXISTING_PATIENT'
   ORDER BY created_at DESC LIMIT 10;
   ```
   Should show manual decisions with user_id and timestamp

---

## Rollout Plan

### Phase 1: Deploy (Internal Testing)
- Deploy backend integration
- Deploy frontend updates
- Test with 10 manual registrations
- Verify audit logs

### Phase 2: Gradual Rollout
- Enable for 1 clinic
- Monitor for 1 week
- Check duplicate creation rate (should be near 0%)
- Review manual review dialog UX with staff

### Phase 3: Full Rollout
- Enable for all clinics
- Monitor metrics dashboard
- Train all staff on dialog

---

## Metrics to Monitor

```sql
-- Daily new duplicates (should be 0)
SELECT DATE(created_at), COUNT(*) FROM emr_patients
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
HAVING COUNT(*) > 1;

-- Manual review rate (should be 15-30%)
SELECT
  ROUND(100 * COUNT(CASE WHEN action IN ('LINK_EXISTING_PATIENT', 'CREATE_NEW_PATIENT') THEN 1 END) / COUNT(*), 2) as manual_review_pct
FROM abdm_registration_audit
WHERE created_at > NOW() - INTERVAL '7 days';

-- Staff decisions
SELECT user_id, action, COUNT(*)
FROM abdm_registration_audit
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id, action
ORDER BY user_id;
```

---

## Files Modified/Created

| File | Status | Changes |
|------|--------|---------|
| `backend/src/controllers/abdm-registration-integration.js` | **NEW** | Integration layer |
| `backend/src/emr/emr.appointment.controller.js` | **MODIFY** | Lines 164-204 (patient resolution) |
| `emr-web/src/components/AddPatientAbhaFlow.jsx` | **MODIFY** | Add manual validation handling |
| `backend/src/services/abdm-registration-validation.service.js` | **EXISTING** | No changes needed |
| `emr-web/src/components/AbdmValidationDialog.jsx` | **EXISTING** | No changes needed |

---

## Timeline

- **Step 1-2:** Backend integration - 30 min
- **Step 3-4:** Frontend integration - 45 min
- **Testing:** 30 min
- **Total:** ~2 hours

---

## Support

If manual review dialog is not appearing:

1. Check browser console for errors
2. Check API response: `curl http://localhost:3000/api/emr/appointments -X POST`
3. Verify status code is 202 (not 201)
4. Check `abdm_registration_audit` table has entries
5. Verify `AbdmValidationDialog` component is imported

