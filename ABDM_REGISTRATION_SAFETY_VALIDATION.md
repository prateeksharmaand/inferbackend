# ABDM Registration Safety Validation

## Overview

When a patient is registered through ABDM channels (ABHA QR scan, Facility QR + profile share, ABDM patient share, ABHA number registration), the system must perform demographic matching and manual validation before creating a new patient record.

**Core Principle:** Never automatically link ABHA to a patient using only Name + DOB + Gender. Human confirmation is mandatory.

---

## Workflow

```
ABDM Registration Request
│
├─ ABHA QR Scan
├─ Facility QR + Profile Share
├─ ABDM Patient Share
└─ ABHA Number Registration
│
▼
┌─────────────────────────────────┐
│  Run Matching Engine (Level 1)  │
├─────────────────────────────────┤
│ Check: ABHA Number              │
│        ABHA Address             │
└─────────────────┬───────────────┘
                  │
          ┌───────┴────────┐
          │                │
        YES              NO
          │                │
          ▼                ▼
    ┌──────────┐  ┌────────────────────┐
    │   Found  │  │ Run Matching Level 2│
    │   Link   │  ├────────────────────┤
    │ Existing │  │ Check: Mobile +    │
    │ Patient  │  │        DOB +       │
    │   (100%) │  │        Name        │
    └──────────┘  └────┬──────────────┘
                       │
                ┌──────┴────────┐
                │               │
              YES             NO
                │               │
                ▼               ▼
          ┌──────────┐  ┌────────────────────┐
          │ Found    │  │Run Matching Level 3 │
          │ Link     │  ├────────────────────┤
          │Existing  │  │Check: Name +       │
          │Patient   │  │       DOB +        │
          │  (99%)   │  │       Gender       │
          └──────────┘  └────┬──────────────┘
                             │
                      ┌──────┴────────┐
                      │               │
                    YES             NO
                      │               │
                      ▼               ▼
          ┌──────────────────┐  ┌──────────┐
          │ Candidate(s)     │  │ Create   │
          │ Found            │  │ New      │
          │                  │  │ Patient  │
          │ Show Manual      │  │ (0%)     │
          │Validation Dialog │  └──────────┘
          │ (70-95%)         │
          └──────────────────┘
```

---

## Phase 1: ABHA Match (100% Confidence)

### Query
```sql
SELECT id, clinic_id, name, mobile, dob, gender, uhid
FROM emr_patients
WHERE deleted_at IS NULL
  AND (abha_number = $1 OR abha_address = $2)
LIMIT 1;
```

### Action
- ✅ **Found:** Automatically link ABHA to existing patient (100% safe)
- **Log:** `ABHA_AUTO_LINKED` with patient ID

### SQL
```sql
UPDATE emr_patients SET
  is_abdm_linked = true,
  abdm_linked_at = NOW()
WHERE id = $1
RETURNING *;
```

---

## Phase 2: Mobile + DOB + Name Match (99% Confidence)

### Query
```sql
SELECT id, clinic_id, name, mobile, dob, gender, uhid
FROM emr_patients
WHERE deleted_at IS NULL
  AND clinic_id = $1
  AND LOWER(name) = LOWER($2)
  AND dob = $3::date
  AND REGEXP_REPLACE(mobile, '\D', '') = normalize_phone($4)
LIMIT 1;
```

### Action
- ✅ **Found:** Automatically link ABHA to existing patient (99% safe)
- **Log:** `ABDM_AUTO_LINKED_MOBILE_DOB_NAME`

### SQL
```sql
UPDATE emr_patients SET
  abha_number = COALESCE($1, abha_number),
  abha_address = COALESCE($2, abha_address),
  is_abdm_linked = true,
  abdm_linked_at = NOW()
WHERE id = $3
RETURNING *;
```

---

## Phase 3: Name + DOB + Gender Match (70-95% Confidence)

### Query
```sql
SELECT 
  id, clinic_id, name, mobile, dob, gender, uhid,
  last_visit_date, clinic_name,
  CASE 
    WHEN mobile IS NOT NULL AND mobile != '' THEN 95
    ELSE 70
  END as confidence_score
FROM emr_patients
WHERE deleted_at IS NULL
  AND clinic_id = $1
  AND LOWER(name) = LOWER($2)
  AND dob = $3::date
  AND gender = $4
ORDER BY confidence_score DESC, updated_at DESC
LIMIT 5;
```

### Action
- ❌ **Do NOT auto-link**
- ✅ **Show Manual Validation Dialog**
- **Require:** User confirmation before linking

### Confidence Scoring

| Scenario | Score | Reason |
|----------|-------|--------|
| Name + DOB + Gender + Mobile | 95% | Additional identifier present |
| Name + DOB + Gender only | 70% | Common name risk |
| Multiple matches found | 0% | Ambiguous, manual review required |

---

## Phase 4: No Match Found (0% Confidence)

### Action
- ✅ **Create New Patient** with ABDM data
- **Log:** `ABDM_NEW_PATIENT_CREATED`

---

## Manual Validation Dialog

### Trigger Condition
```
Name + DOB + Gender match found
AND (
  Mobile not provided OR
  Existing ABHA not present
)
```

### UI Component

```
┌─────────────────────────────────────────┐
│   Possible Existing Patient Found       │
│                                         │
│ ABDM Profile Details                    │
│ ─────────────────────────────────────   │
│ Name:         [ABHA Name]               │
│ DOB:          [ABHA DOB]                │
│ Gender:       [ABHA Gender]             │
│ ABHA Number:  [ABHA Number]             │
│ ABHA Address: [ABHA Address]            │
│                                         │
│ Confidence: 70%                         │
│ (Matched on Name, DOB, Gender)          │
│                                         │
│ ─────────────────────────────────────   │
│ Matched Patient Details                 │
│ ─────────────────────────────────────   │
│ Patient ID:   [ID]                      │
│ UHID:         [UHID]                    │
│ Name:         [Name]                    │
│ Mobile:       [Mobile]                  │
│ DOB:          [DOB]                     │
│ Gender:       [Gender]                  │
│ Last Visit:   [Date / Clinic]           │
│ Clinic:       [Clinic Name]             │
│                                         │
│ ─────────────────────────────────────   │
│ Is this the same patient?               │
│                                         │
│ [Link ABHA To Existing]  [Create New]   │
│                          [Cancel]       │
│                                         │
└─────────────────────────────────────────┘
```

### Data Flow

**Input:**
```json
{
  "abha_number": "91-1000-4008-7627",
  "abha_address": "user@abdm",
  "name": "Prateek Sharma",
  "dob": "1986-11-27",
  "gender": "M",
  "clinic_id": 1
}
```

**Candidates Found:**
```json
{
  "candidates": [
    {
      "id": 24,
      "clinic_id": 1,
      "name": "Prateek Sharma",
      "mobile": "9650269758",
      "dob": "1986-11-27",
      "gender": "M",
      "uhid": "UH001",
      "last_visit_date": "2026-06-20",
      "clinic_name": "Nous Health Clinic",
      "confidence_score": 95
    }
  ],
  "requires_manual_review": true,
  "reason": "Name + DOB + Gender match found (95% confidence)"
}
```

---

## User Actions

### Action 1: Link ABHA To Existing Patient

```javascript
POST /api/abdm/validation/link
{
  "abha_number": "91-1000-4008-7627",
  "abha_address": "user@abdm",
  "patient_id": 24,
  "user_id": 5,
  "clinic_id": 1
}

Response: 200 OK
{
  "status": "success",
  "patient_id": 24,
  "abha_linked": true,
  "audit_id": "audit_123"
}
```

**Database Updates:**
```sql
UPDATE emr_patients SET
  abha_number = $1,
  abha_address = $2,
  is_abdm_linked = true,
  abdm_linked_at = NOW()
WHERE id = $3;

INSERT INTO abdm_registration_audit
  (clinic_id, user_id, abha_number, abha_address, patient_id, action, confidence_score, matched_on)
VALUES ($4, $5, $1, $2, $3, 'LINK_EXISTING_PATIENT', 95, 'name_dob_gender_mobile');
```

### Action 2: Create New Patient

```javascript
POST /api/abdm/validation/create-new
{
  "abha_number": "91-1000-4008-7627",
  "abha_address": "user@abdm",
  "name": "Prateek Sharma",
  "dob": "1986-11-27",
  "gender": "M",
  "clinic_id": 1,
  "user_id": 5
}

Response: 201 Created
{
  "status": "success",
  "patient_id": 27,
  "is_new": true,
  "audit_id": "audit_124"
}
```

**Database Updates:**
```sql
INSERT INTO emr_patients
  (clinic_id, name, dob, gender, abha_number, abha_address, is_abdm_linked, abdm_linked_at)
VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
RETURNING *;

INSERT INTO abdm_registration_audit
  (clinic_id, user_id, abha_number, abha_address, patient_id, action, reason)
VALUES ($1, $7, $5, $6, last_insert_id, 'CREATE_NEW_PATIENT', 'No confident match found');
```

### Action 3: Cancel

```javascript
POST /api/abdm/validation/cancel
{
  "abha_number": "91-1000-4008-7627",
  "user_id": 5,
  "clinic_id": 1
}

Response: 200 OK
{
  "status": "cancelled",
  "audit_id": "audit_125"
}
```

**Database Updates:**
```sql
INSERT INTO abdm_registration_audit
  (clinic_id, user_id, abha_number, action)
VALUES ($1, $2, $3, 'CANCELLED');
```

---

## Database Schema

### Audit Table

```sql
CREATE TABLE abdm_registration_audit (
  id SERIAL PRIMARY KEY,
  clinic_id INT NOT NULL REFERENCES emr_clinics(id),
  user_id INT REFERENCES emr_users(id),
  
  -- ABDM Details
  abha_number VARCHAR(50),
  abha_address VARCHAR(255),
  
  -- Patient Match Details
  patient_id INT REFERENCES emr_patients(id),
  confidence_score INT CHECK (confidence_score BETWEEN 0 AND 100),
  matched_on VARCHAR(100),  -- 'abha_exact', 'mobile_dob_name', 'name_dob_gender'
  
  -- User Action
  action VARCHAR(50) NOT NULL,  -- 'LINK_EXISTING_PATIENT', 'CREATE_NEW_PATIENT', 'CANCELLED'
  reason TEXT,
  
  -- Audit Trail
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_abdm_audit_clinic_user 
  ON abdm_registration_audit(clinic_id, user_id, created_at DESC);

CREATE INDEX idx_abdm_audit_abha 
  ON abdm_registration_audit(abha_number, abha_address);

CREATE INDEX idx_abdm_audit_patient 
  ON abdm_registration_audit(patient_id, action);
```

---

## Service Implementation

### Node.js: ABDM Validation Service

```javascript
// backend/src/services/abdm-registration-validation.service.js

const validateAbdmRegistration = async (abdmData, clinicId) => {
  const { abhaNumber, abhaAddress, name, dob, gender, mobile } = abdmData;

  // Level 1: ABHA Match (100% confidence)
  const abhaMatch = await findByAbhaExact(abhaNumber, abhaAddress);
  if (abhaMatch) {
    return {
      status: 'found',
      confidence: 100,
      action: 'auto_link',
      patient: abhaMatch,
      matchedOn: 'abha_exact'
    };
  }

  // Level 2: Mobile + DOB + Name (99% confidence)
  const mobileDobNameMatch = await findByMobileDobName(
    clinicId,
    name,
    dob,
    mobile
  );
  if (mobileDobNameMatch && mobileDobNameMatch.length === 1) {
    return {
      status: 'found',
      confidence: 99,
      action: 'auto_link',
      patient: mobileDobNameMatch[0],
      matchedOn: 'mobile_dob_name'
    };
  }

  // Level 3: Name + DOB + Gender (70-95% confidence)
  const nameDobGenderMatches = await findByNameDobGender(
    clinicId,
    name,
    dob,
    gender
  );

  if (nameDobGenderMatches && nameDobGenderMatches.length > 0) {
    const confidenceScore = mobile ? 95 : 70;
    return {
      status: 'requires_manual_review',
      confidence: confidenceScore,
      action: 'show_dialog',
      candidates: nameDobGenderMatches.slice(0, 5),
      matchedOn: 'name_dob_gender',
      reason: `Matched on Name, DOB, Gender${mobile ? ', Mobile' : ''}`
    };
  }

  // Level 4: No Match (0% confidence)
  return {
    status: 'no_match',
    confidence: 0,
    action: 'create_new',
    candidates: [],
    reason: 'No demographic match found'
  };
};

const linkAbhaToExistingPatient = async (
  abhaNumber,
  abhaAddress,
  patientId,
  clinicId,
  userId
) => {
  // Update patient
  const updated = await updatePatientAbha(
    patientId,
    abhaNumber,
    abhaAddress
  );

  // Audit
  await logAbdmValidationDecision({
    clinic_id: clinicId,
    user_id: userId,
    abha_number: abhaNumber,
    abha_address: abhaAddress,
    patient_id: patientId,
    action: 'LINK_EXISTING_PATIENT',
    confidence_score: 95
  });

  return updated;
};

const createNewPatientFromAbdm = async (
  abdmData,
  clinicId,
  userId
) => {
  const patient = await createPatient({
    clinic_id: clinicId,
    name: abdmData.name,
    dob: abdmData.dob,
    gender: abdmData.gender,
    mobile: abdmData.mobile,
    abha_number: abdmData.abhaNumber,
    abha_address: abdmData.abhaAddress,
    is_abdm_linked: true,
    abdm_linked_at: new Date()
  });

  // Audit
  await logAbdmValidationDecision({
    clinic_id: clinicId,
    user_id: userId,
    abha_number: abdmData.abhaNumber,
    abha_address: abdmData.abhaAddress,
    patient_id: patient.id,
    action: 'CREATE_NEW_PATIENT',
    reason: 'No confident match found',
    confidence_score: 0
  });

  return patient;
};

module.exports = {
  validateAbdmRegistration,
  linkAbhaToExistingPatient,
  createNewPatientFromAbdm
};
```

---

## Frontend: Manual Validation Dialog

### React Component

```jsx
// emr-web/src/components/AbdmValidationDialog.jsx

import React, { useState } from 'react';
import './AbdmValidationDialog.css';

const AbdmValidationDialog = ({ 
  abdmProfile, 
  candidates, 
  confidence,
  onLink, 
  onCreate, 
  onCancel,
  isLoading 
}) => {
  const [selectedCandidateId, setSelectedCandidateId] = useState(
    candidates?.[0]?.id
  );

  const handleLink = async () => {
    await onLink(selectedCandidateId);
  };

  const handleCreate = async () => {
    await onCreate();
  };

  const getConfidenceColor = (score) => {
    if (score >= 90) return '#22c55e'; // green
    if (score >= 70) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  return (
    <div className="abdm-validation-overlay">
      <div className="abdm-validation-dialog">
        {/* Header */}
        <div className="dialog-header">
          <h2>⚠️ Possible Existing Patient Found</h2>
          <p className="subtitle">
            Please confirm if this is the same patient before linking ABHA
          </p>
        </div>

        {/* ABDM Profile Section */}
        <div className="profile-section">
          <h3>ABDM Profile Details</h3>
          <div className="details-grid">
            <div className="detail-row">
              <span className="label">Name:</span>
              <span className="value">{abdmProfile.name}</span>
            </div>
            <div className="detail-row">
              <span className="label">DOB:</span>
              <span className="value">{abdmProfile.dob}</span>
            </div>
            <div className="detail-row">
              <span className="label">Gender:</span>
              <span className="value">{abdmProfile.gender}</span>
            </div>
            <div className="detail-row">
              <span className="label">ABHA Number:</span>
              <span className="value">{abdmProfile.abhaNumber}</span>
            </div>
            <div className="detail-row">
              <span className="label">ABHA Address:</span>
              <span className="value">{abdmProfile.abhaAddress}</span>
            </div>
          </div>
        </div>

        {/* Confidence Score */}
        <div className="confidence-section">
          <div className="confidence-bar">
            <div 
              className="confidence-fill"
              style={{
                width: `${confidence}%`,
                backgroundColor: getConfidenceColor(confidence)
              }}
            />
          </div>
          <div className="confidence-text">
            <span className="score">Confidence: {confidence}%</span>
            <span className="reason">
              Matched on Name, DOB, Gender
            </span>
          </div>
        </div>

        {/* Matched Patient Candidates */}
        <div className="candidates-section">
          <h3>Select Patient to Link</h3>
          <div className="candidates-list">
            {candidates.map((candidate) => (
              <div
                key={candidate.id}
                className={`candidate-card ${
                  selectedCandidateId === candidate.id ? 'selected' : ''
                }`}
                onClick={() => setSelectedCandidateId(candidate.id)}
              >
                <div className="card-header">
                  <input
                    type="radio"
                    name="candidate"
                    value={candidate.id}
                    checked={selectedCandidateId === candidate.id}
                    onChange={() => setSelectedCandidateId(candidate.id)}
                  />
                  <span className="patient-id">ID: {candidate.id}</span>
                  {candidate.uhid && (
                    <span className="uhid">UHID: {candidate.uhid}</span>
                  )}
                </div>

                <div className="card-details">
                  <div className="detail-row">
                    <span className="label">Name:</span>
                    <span className="value">{candidate.name}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Mobile:</span>
                    <span className="value">
                      {candidate.mobile || '—'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">DOB:</span>
                    <span className="value">{candidate.dob}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Gender:</span>
                    <span className="value">{candidate.gender}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Last Visit:</span>
                    <span className="value">
                      {candidate.last_visit_date
                        ? `${candidate.last_visit_date} @ ${candidate.clinic_name}`
                        : 'No visits'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="dialog-actions">
          <button
            className="btn btn-primary"
            onClick={handleLink}
            disabled={isLoading || !selectedCandidateId}
          >
            {isLoading ? 'Linking...' : '✓ Link ABHA To Existing Patient'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleCreate}
            disabled={isLoading}
          >
            {isLoading ? 'Creating...' : '+ Create New Patient'}
          </button>
          <button
            className="btn btn-outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AbdmValidationDialog;
```

### CSS Styling

```css
/* emr-web/src/components/AbdmValidationDialog.css */

.abdm-validation-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.abdm-validation-dialog {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  padding: 32px;
}

.dialog-header {
  margin-bottom: 32px;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 16px;
}

.dialog-header h2 {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 8px 0;
}

.dialog-header .subtitle {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.profile-section,
.candidates-section {
  margin-bottom: 24px;
}

.profile-section h3,
.candidates-section h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 16px 0;
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 12px;
  background: #f9fafb;
  padding: 16px;
  border-radius: 8px;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row .label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
}

.detail-row .value {
  font-size: 14px;
  color: #1f2937;
  font-weight: 500;
}

.confidence-section {
  margin-bottom: 32px;
  padding: 16px;
  background: #fffbeb;
  border-left: 4px solid #f59e0b;
  border-radius: 8px;
}

.confidence-bar {
  width: 100%;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
}

.confidence-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.confidence-text {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.confidence-text .score {
  font-weight: 600;
  color: #1f2937;
}

.confidence-text .reason {
  color: #6b7280;
}

.candidates-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.candidate-card {
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.candidate-card:hover {
  border-color: #3b82f6;
  background: #f0f9ff;
}

.candidate-card.selected {
  border-color: #3b82f6;
  background: #eff6ff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.card-header input[type="radio"] {
  margin: 0;
  cursor: pointer;
}

.patient-id {
  font-weight: 600;
  color: #1f2937;
  font-size: 14px;
}

.uhid {
  font-size: 12px;
  color: #6b7280;
  margin-left: auto;
}

.card-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  font-size: 13px;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.btn {
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.btn-secondary {
  background: #10b981;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #059669;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-outline {
  background: white;
  color: #6b7280;
  border: 1px solid #d1d5db;
}

.btn-outline:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}
```

---

## API Endpoints

### 1. Validate ABDM Registration

```
POST /api/v1/abdm/validate-registration
```

**Request:**
```json
{
  "abha_number": "91-1000-4008-7627",
  "abha_address": "user@abdm",
  "name": "Prateek Sharma",
  "dob": "1986-11-27",
  "gender": "M",
  "mobile": "9650269758",
  "clinic_id": 1
}
```

**Response (Manual Review Required):**
```json
{
  "status": "requires_manual_review",
  "confidence": 95,
  "action": "show_dialog",
  "candidates": [
    {
      "id": 24,
      "name": "Prateek Sharma",
      "mobile": "9650269758",
      "dob": "1986-11-27",
      "gender": "M",
      "uhid": "UH001",
      "last_visit_date": "2026-06-20",
      "clinic_name": "Nous Health Clinic"
    }
  ],
  "matched_on": "name_dob_gender",
  "reason": "Matched on Name, DOB, Gender, Mobile (95% confidence)"
}
```

**Response (Auto-Linked):**
```json
{
  "status": "found",
  "confidence": 100,
  "action": "auto_link",
  "patient_id": 24,
  "patient": {
    "id": 24,
    "name": "Prateek Sharma",
    "abha_number": "91-1000-4008-7627",
    "is_abdm_linked": true
  }
}
```

### 2. Link ABHA to Existing Patient

```
POST /api/v1/abdm/link-to-existing
```

**Request:**
```json
{
  "abha_number": "91-1000-4008-7627",
  "abha_address": "user@abdm",
  "patient_id": 24
}
```

**Response:**
```json
{
  "status": "success",
  "patient_id": 24,
  "abha_linked": true,
  "audit_id": "aud_123"
}
```

### 3. Create New Patient from ABDM

```
POST /api/v1/abdm/create-new-patient
```

**Request:**
```json
{
  "abha_number": "91-1000-4008-7627",
  "abha_address": "user@abdm",
  "name": "Prateek Sharma",
  "dob": "1986-11-27",
  "gender": "M",
  "mobile": "9650269758",
  "clinic_id": 1
}
```

**Response:**
```json
{
  "status": "success",
  "patient_id": 27,
  "is_new": true,
  "audit_id": "aud_124"
}
```

### 4. Cancel ABDM Registration

```
POST /api/v1/abdm/cancel-registration
```

**Request:**
```json
{
  "abha_number": "91-1000-4008-7627",
  "abort_reason": "User cancelled"
}
```

**Response:**
```json
{
  "status": "cancelled",
  "audit_id": "aud_125"
}
```

---

## Audit Logging

### Query Audit Trail

```sql
-- Get all manual decisions by a user
SELECT 
  id,
  created_at,
  abha_number,
  action,
  patient_id,
  confidence_score
FROM abdm_registration_audit
WHERE clinic_id = $1
  AND user_id = $2
ORDER BY created_at DESC;

-- Get duplicate creation patterns
SELECT 
  COUNT(*) as count,
  action,
  matched_on
FROM abdm_registration_audit
WHERE clinic_id = $1
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY action, matched_on
ORDER BY count DESC;

-- Audit trail for specific ABHA
SELECT *
FROM abdm_registration_audit
WHERE abha_number = $1
ORDER BY created_at DESC;
```

---

## Patient Safety Guarantees

### ✅ Automatic Linking (Safe)

| Match Type | Confidence | Auto-Link | Reason |
|------------|-----------|-----------|--------|
| ABHA Number | 100% | ✅ YES | Nationally unique identifier |
| ABHA Address | 100% | ✅ YES | Nationally unique identifier |
| Mobile + DOB + Name | 99% | ✅ YES | Unique combination, clinic-scoped |

### ❌ Manual Review Required (Safe)

| Match Type | Confidence | Auto-Link | Reason |
|------------|-----------|-----------|--------|
| Name + DOB + Gender | 70-95% | ❌ NO | Multiple people share same demographics |
| Multiple Matches | 0% | ❌ NO | Ambiguous, requires human judgment |

### 🔒 Never Auto-Link

```
Name + DOB + Gender alone MUST require manual confirmation
```

---

## Deployment Checklist

- [ ] Create `abdm_registration_audit` table
- [ ] Create `normalizePhone()` SQL function
- [ ] Deploy `patient-match.service.v2.js`
- [ ] Deploy `abdm-registration-validation.service.js`
- [ ] Deploy API endpoints in `emr.controller.js`
- [ ] Deploy `AbdmValidationDialog.jsx` component
- [ ] Update ABDM registration workflow to call validation service
- [ ] Test with sample data (multiple candidates scenario)
- [ ] Verify audit logging works correctly
- [ ] Add monitoring for manual review rates
- [ ] Train reception staff on dialog usage
- [ ] Add user documentation with screenshots

---

## Monitoring Metrics

```sql
-- Daily manual review rate
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_registrations,
  COUNTIF(action = 'LINK_EXISTING_PATIENT') as auto_linked,
  COUNTIF(action = 'CREATE_NEW_PATIENT') as new_created,
  ROUND(100 * COUNTIF(action = 'LINK_EXISTING_PATIENT') / COUNT(*), 2) as auto_link_pct
FROM abdm_registration_audit
WHERE clinic_id = $1
GROUP BY date
ORDER BY date DESC;

-- Confidence distribution
SELECT 
  confidence_score,
  COUNT(*) as count,
  action
FROM abdm_registration_audit
GROUP BY confidence_score, action;
```

---

## Key Principles

1. ✅ **ABHA is Authoritative** — 100% confidence for ABHA matches
2. ✅ **Mobile + DOB + Name is Automatic** — 99% confidence
3. ❌ **Name + DOB + Gender Requires Manual** — Never auto-link at 70-95%
4. 🔒 **Zero False Match Guarantee** — Wrong patient link is NEVER acceptable
5. 📝 **Full Audit Trail** — Every decision logged with user, timestamp, confidence
6. 👤 **Simple UX** — Reception staff can validate in seconds with clear information

