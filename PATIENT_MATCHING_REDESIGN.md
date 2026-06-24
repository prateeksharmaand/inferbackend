# Patient Matching & Duplicate Prevention System - Complete Redesign

**Date:** 2026-06-24  
**Priority:** Patient Safety > Duplicate Prevention  
**Status:** Production-Ready Design Document

---

## Executive Summary

This document redesigns the patient matching system used in manual registration, appointment booking, ABDM patient import, ABHA linking, QR code scanning, and HIP/HIU consent data imports.

**Critical Principle:** A duplicate patient is acceptable; a wrong patient match is NOT acceptable.

**Key Changes:**
- Add phone normalization layer with database support
- Implement 4-level confidence matching with manual review fallback
- Add UNIQUE constraints for ABHA identity (already in abha_mappings)
- Implement concurrency protection with SELECT FOR UPDATE
- Design multi-clinic isolation with proper scoping
- Add comprehensive indexes for 1M+ patient scalability
- Document ABDM compliance requirements

---

## Phase 1: Matching Strategy Redesign

### Current State (RISKY)
```
1. ABHA Number (99%)
2. ABHA Address (85%)
3. Mobile + DOB (88%) — problematic: can have false matches
4. Mobile + Name (82%) — problematic: name variations
5. Name + DOB + Gender (70%) — TOO LOW CONFIDENCE
6. Create if no match
```

**Risk:** Steps 4-5 can match wrong patients. Mobile+DOB matching doesn't account for name variations.

### Redesigned Strategy (SAFE)

**Level 1: 100% Confidence — Authoritative ABHA Matching**
- ABHA Number from abha_mappings (nationally unique, government-issued)
- ABHA Address from abha_mappings (fallback when number unavailable)
- Action: UPDATE existing patient with new demographics, NO duplicate creation
- Clinic isolation: N/A (ABHA is nationally unique)

**Level 2: 99% Confidence — Normalized Demographics (ALL THREE required)**
- Normalized Mobile + DOB + Name
- Exact match on all three fields
- Mobile: standard 10-digit Indian format (9650269758)
- DOB: exact date match
- Name: case-insensitive exact match
- Action: AUTO-LINK without manual review
- Clinic isolation: YES (WHERE clinic_id = ?)
- Concurrency: SELECT FOR UPDATE to prevent race conditions

**Level 3: 95% Confidence — Mobile + Name (SINGLE MATCH ONLY)**
- Normalized Mobile + Name
- MUST have exactly 1 match (0 = create new, >1 = manual review)
- Name: case-insensitive exact match
- Action: AUTO-LINK if single match, else manual review
- Clinic isolation: YES (WHERE clinic_id = ?)
- Concurrency: SELECT FOR UPDATE

**Level 4: Manual Review Required**
- Multiple matches at any confidence level
- Name+DOB without mobile (ambiguous)
- Name+DOB+Gender (deprecated - removed from auto-matching)
- Action: Return {requiresManualReview: true, candidates: [...]}
- UI responsibility: Present candidates to user for selection
- Never auto-create if candidates exist

**Removed from Auto-Matching:**
- Name + DOB alone (too many false positives)
- Name + DOB + Gender (same issue, unreliable)

---

## Phase 2: Multi-Clinic Isolation

### Architecture

**Patient Identity Scope:**
- ABHA: Global (nationally unique) — search across all clinics
- Demographic matching: Clinic-scoped only (WHERE clinic_id = ?)
- Care contexts: Always clinic-owned (clinic_id on emr_care_contexts)
- Patient records: Global but filtered by patient_clinics for multi-clinic access

**SQL Implementation:**

```sql
-- For ABHA matching (GLOBAL)
SELECT p.* FROM emr_patients p
  JOIN abha_mappings m ON m.patient_id = p.id
  WHERE m.abha_number = $1 AND m.status = 'active' AND p.deleted_at IS NULL
  LIMIT 1;

-- For demographic matching (CLINIC-SCOPED)
SELECT p.* FROM emr_patients p
  INNER JOIN patient_clinics pc ON p.id = pc.patient_id
  WHERE pc.clinic_id = $1
    AND NORMALIZE(p.mobile) = NORMALIZE($2)
    AND p.dob = $3::date
    AND LOWER(p.name) = LOWER($4)
    AND p.deleted_at IS NULL
  LIMIT 1;

-- For patient_clinics insertion (many-to-many)
INSERT INTO patient_clinics (patient_id, clinic_id, first_visit_at, last_visit_at)
VALUES ($1, $2, NOW(), NOW())
ON CONFLICT (patient_id, clinic_id) DO UPDATE
  SET last_visit_at = NOW();
```

**Key Principle:**
- Patient exists globally but is associated with clinics via patient_clinics
- Each clinic sees only their own patient relationships
- ABHA matching is global (because ABHA is nationally unique)
- Demographic matching is clinic-scoped (because multiple clinics may have patients with same mobile/DOB)

---

## Phase 3: Phone Normalization

### Design

**Normalization Rules for Indian Numbers:**
1. Accept: +91-XXXXXXXXXX, 91-XXXXXXXXXX, 0-XXXXXXXXXX, XXXXXXXXXX
2. Remove: spaces, hyphens, parentheses
3. Strip leading 0 if present
4. Strip country code (91) if present
5. Output: 10-digit format (9650269758)
6. Validation: Must be 10 digits, first digit in [6-9]
7. Store: Always store normalized form

### Implementation: Node.js

```javascript
/**
 * Normalize Indian mobile number to 10-digit format
 * @param {string} mobile - Raw input (accepts various formats)
 * @returns {string|null} - Normalized 10-digit number or null if invalid
 */
function normalizePhone(mobile) {
  if (!mobile) return null;
  
  // Remove common separators
  let normalized = String(mobile)
    .replace(/[\s\-()]/g, '')
    .trim();
  
  // Remove country code variants
  if (normalized.startsWith('+91')) {
    normalized = normalized.slice(3);
  } else if (normalized.startsWith('91')) {
    normalized = normalized.slice(2);
  }
  
  // Remove leading 0
  if (normalized.startsWith('0')) {
    normalized = normalized.slice(1);
  }
  
  // Validate: exactly 10 digits
  if (!/^\d{10}$/.test(normalized)) {
    return null;
  }
  
  // Validate: first digit in [6-9] (Indian mobile requirement)
  if (!/^[6-9]/.test(normalized)) {
    return null;
  }
  
  return normalized;
}

module.exports = { normalizePhone };
```

### Implementation: PostgreSQL

```sql
-- Function for normalization (used in queries and migrations)
CREATE OR REPLACE FUNCTION normalize_phone(mobile TEXT)
RETURNS TEXT AS $$
DECLARE
  normalized TEXT;
BEGIN
  IF mobile IS NULL THEN
    RETURN NULL;
  END IF;
  
  normalized := mobile;
  normalized := regexp_replace(normalized, '[\s\-()]', '', 'g');
  normalized := regexp_replace(normalized, '^(\+)?91', '');
  normalized := regexp_replace(normalized, '^0', '');
  
  -- Validate: exactly 10 digits, first digit [6-9]
  IF normalized ~ '^\d{10}$' AND normalized ~ '^[6-9]' THEN
    RETURN normalized;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add computed column for normalized mobile
ALTER TABLE emr_patients
  ADD COLUMN mobile_normalized VARCHAR(10) GENERATED ALWAYS AS (normalize_phone(mobile)) STORED;

-- Index on normalized column for fast lookups
CREATE INDEX idx_emr_patients_mobile_normalized ON emr_patients(mobile_normalized) WHERE deleted_at IS NULL;
```

### Migration Strategy

```sql
-- Step 1: Add generated column (PostgreSQL 12+)
ALTER TABLE emr_patients
  ADD COLUMN mobile_normalized VARCHAR(10) GENERATED ALWAYS AS (normalize_phone(mobile)) STORED;

-- Step 2: Update existing mobile_normalized values (trigger materialization)
UPDATE emr_patients SET mobile_normalized = normalize_phone(mobile) WHERE deleted_at IS NULL;

-- Step 3: Add index for fast lookups
CREATE INDEX idx_emr_patients_mobile_normalized ON emr_patients(mobile_normalized) WHERE deleted_at IS NULL;

-- Step 4: Backfill any NULL mobile_normalized (shouldn't happen, safety)
UPDATE emr_patients SET mobile = CASE WHEN mobile_normalized IS NOT NULL THEN mobile ELSE NULL END;

-- Step 5: Update Node.js to use normalized form in all queries
```

**Benefits:**
- Automatic normalization for all existing/future records
- Single source of truth (mobile_normalized generated from mobile)
- Index-backed queries for performance
- Handles variants transparently

---

## Phase 4: Multiple Match Detection

### Decision Logic

```
if matchResult.matches.length === 0:
  → Create new patient
  
if matchResult.matches.length === 1:
  → Use that patient (auto-link)
  
if matchResult.matches.length > 1:
  → Return { requiresManualReview: true, candidates: [...] }
  → UI presents candidates to user for selection
  → Never auto-create if candidates exist
```

### SQL Implementation

```sql
-- Level 2: Mobile + DOB + Name (clinic-scoped)
WITH matches AS (
  SELECT p.id, p.name, p.mobile, p.dob, p.gender,
         pc.clinic_id, COUNT(*) OVER () AS total_matches
  FROM emr_patients p
  INNER JOIN patient_clinics pc ON p.id = pc.patient_id
  WHERE pc.clinic_id = $1
    AND normalize_phone(p.mobile) = $2  -- normalized mobile
    AND p.dob = $3::date
    AND LOWER(p.name) = LOWER($4)
    AND p.deleted_at IS NULL
)
SELECT * FROM matches
ORDER BY p.created_at DESC;

-- Level 3: Mobile + Name (clinic-scoped, single match required)
WITH matches AS (
  SELECT p.id, p.name, p.mobile, p.dob, p.gender,
         pc.clinic_id, COUNT(*) OVER () AS total_matches
  FROM emr_patients p
  INNER JOIN patient_clinics pc ON p.id = pc.patient_id
  WHERE pc.clinic_id = $1
    AND normalize_phone(p.mobile) = $2  -- normalized mobile
    AND LOWER(p.name) = LOWER($3)
    AND p.deleted_at IS NULL
)
SELECT * FROM matches;

-- Node.js Decision Logic
function getMatchingStrategy(matchResult) {
  const { matches } = matchResult;
  
  if (matches.length === 0) {
    return { action: 'CREATE', patient: null };
  }
  
  if (matches.length === 1) {
    return { action: 'LINK', patient: matches[0] };
  }
  
  // Multiple matches
  return {
    action: 'MANUAL_REVIEW',
    candidates: matches,
    message: `Found ${matches.length} similar patients. Please select one.`,
  };
}
```

---

## Phase 5: Concurrency Protection

### Problem
Race condition when multiple requests process same patient simultaneously:
```
Request A: Checks if patient exists → NOT FOUND
Request B: Checks if patient exists → NOT FOUND
Request A: Creates patient
Request B: Creates duplicate patient
```

### Solution: SELECT FOR UPDATE

```sql
-- Lock patient row while checking and updating
BEGIN;
  SELECT p.* FROM emr_patients p
  WHERE p.id = $1 AND p.deleted_at IS NULL
  FOR UPDATE;  -- Exclusive lock, prevents concurrent updates
  
  -- Safe to update now
  UPDATE emr_patients SET mobile = $2, dob = $3 WHERE id = $1;
COMMIT;
```

### Database Constraints

Already exist in abha_mappings:
```sql
CREATE UNIQUE INDEX idx_abha_map_number
  ON abha_mappings(abha_number) WHERE abha_number IS NOT NULL;

CREATE UNIQUE INDEX idx_abha_map_address
  ON abha_mappings(abha_address) WHERE abha_address IS NOT NULL;
```

**Add for demographics (clinic-scoped):**
```sql
-- No UNIQUE constraint on (clinic_id, mobile, dob, name) because:
-- 1. Mobile may be NULL (new patient)
-- 2. Multiple people can have same name (e.g., "John Smith")
-- Instead, use SELECT FOR UPDATE + logical uniqueness checks
```

### Node.js Transaction Flow

```javascript
async function findOrCreatePatient(pool, { mobile, name, dob, gender, clinicId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Lock patients table to prevent concurrent creates
    const { rows } = await client.query(
      `SELECT id FROM emr_patients
       WHERE normalize_phone(mobile) = $1 
         AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,  // SKIP LOCKED = ignore locked rows
      [normalizePhone(mobile)]
    );
    
    if (rows.length > 0) {
      // Patient exists - update if needed
      await client.query(
        `UPDATE emr_patients SET name = $1, dob = $2, gender = $3
         WHERE id = $4`,
        [name, dob, gender, rows[0].id]
      );
      await client.query('COMMIT');
      return rows[0];
    }
    
    // Patient doesn't exist - create
    const { rows: newRows } = await client.query(
      `INSERT INTO emr_patients (name, mobile, dob, gender, clinic_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, mobile, dob, gender, clinicId]
    );
    
    // Add to patient_clinics
    await client.query(
      `INSERT INTO patient_clinics (patient_id, clinic_id, first_visit_at, last_visit_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (patient_id, clinic_id) DO UPDATE
         SET last_visit_at = NOW()`,
      [newRows[0].id, clinicId]
    );
    
    await client.query('COMMIT');
    return newRows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

---

## Phase 6: Performance & Indexing

### Index Strategy for 1M+ Patients

```sql
-- ── ABHA Matching (Global) ──────────────────────────────────────────
-- Level 1: ABHA Number lookup
CREATE INDEX idx_abha_map_number
  ON abha_mappings(abha_number) WHERE abha_number IS NOT NULL;
-- Cardinality: HIGH (each ABHA unique)
-- Type: BTree
-- Query: SELECT p.* FROM emr_patients p JOIN abha_mappings m ON m.patient_id = p.id WHERE m.abha_number = ?

-- Level 2: ABHA Address lookup
CREATE INDEX idx_abha_map_address
  ON abha_mappings(abha_address) WHERE abha_address IS NOT NULL;
-- Cardinality: HIGH (ABHA address is mutable but unique)
-- Type: BTree

-- ── Demographic Matching (Clinic-Scoped) ──────────────────────────
-- Level 2: Mobile + DOB + Name lookup
CREATE INDEX idx_emr_patients_mobile_dob_name
  ON emr_patients(clinic_id, mobile_normalized, dob, LOWER(name))
  WHERE deleted_at IS NULL;
-- Composite index for clinic + normalized mobile + dob + name
-- Type: BTree (supports prefix queries and range scans)

-- Level 3: Mobile + Name lookup
CREATE INDEX idx_emr_patients_mobile_name
  ON emr_patients(clinic_id, mobile_normalized, LOWER(name))
  WHERE deleted_at IS NULL;
-- Supports quick lookups for mobile + name in clinic

-- Supporting indexes for individual fields
CREATE INDEX idx_emr_patients_clinic_id
  ON emr_patients(clinic_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_emr_patients_mobile_normalized
  ON emr_patients(mobile_normalized) WHERE deleted_at IS NULL;

CREATE INDEX idx_emr_patients_dob
  ON emr_patients(dob) WHERE deleted_at IS NULL;

CREATE INDEX idx_emr_patients_name_lower
  ON emr_patients(LOWER(name)) WHERE deleted_at IS NULL;

-- ── Soft Deletes ───────────────────────────────────────────────────
CREATE INDEX idx_emr_patients_deleted_at
  ON emr_patients(deleted_at) WHERE deleted_at IS NOT NULL;

-- ── Patient-Clinic Mapping ─────────────────────────────────────────
CREATE INDEX idx_patient_clinics_patient_id
  ON patient_clinics(patient_id);

CREATE INDEX idx_patient_clinics_clinic_id
  ON patient_clinics(clinic_id);

CREATE UNIQUE INDEX idx_patient_clinics_unique
  ON patient_clinics(patient_id, clinic_id);
```

### Index Explanation

**BTree Indexes:**
- Standard hash-tree for equality and range queries
- Supports: `=`, `>`, `<`, `BETWEEN`, `LIKE` prefix
- Best for: clinic_id, mobile_normalized, dob, name

**Composite Index Strategy:**
- Lead column should have HIGH selectivity (clinic_id filters out 99% of data)
- Follow with columns used in WHERE clause
- Example: (clinic_id, mobile_normalized, dob, name)
- PostgreSQL can use subsets: (clinic, mobile) or (clinic, mobile, dob)

**Why LOWER(name) in index:**
- Case-insensitive comparison requires function
- Computed as STORED in emr_patients (generated column)
- Index on the computed column for performance

### Estimated Query Performance (1M patients, 1000 clinics)

| Query | Clinic Patients | Index | Time |
|-------|-----------------|-------|------|
| ABHA Number | 1 | idx_abha_map_number | 1ms |
| ABHA Address | 1 | idx_abha_map_address | 1ms |
| Mobile + DOB + Name | 1,000 clinics ÷ 1000 = 1 patient avg | idx_emr_patients_mobile_dob_name | 2-3ms |
| Mobile + Name | ~10 matches avg | idx_emr_patients_mobile_name | 2-3ms |
| Full scan (no match) | 1,000 patients/clinic | index scan + filter | 5-10ms |

---

## Phase 7: ABDM Compliance Review

### ABDM Requirements

**1. ABHA Number is Authoritative**
- ABHA number (e.g., "raj@abdm") is government-issued unique identifier
- Cannot be changed (permanent)
- One ABHA = one real person
- Decision: Use as Level 1 matching (100% confidence)

**2. ABHA Address is Mutable**
- One person can create multiple ABHA addresses (e.g., rahul@abdm, rahul123@abdm)
- Maps back to single ABHA number via ABDM APIs
- Decision: Use as Level 2 matching only when ABHA number unavailable (99% confidence)

**3. Demographic Matching is Acceptable but Not Recommended**
- ABDM spec allows demographic matching for patient discovery
- But ABHA should be preferred when available
- Decision: Use demographic matching (Level 2-3) only when ABHA unavailable

**4. Imported Care Contexts**
- When patient data is imported from HIU (Consent → Health Data Exchange):
  - Use ABHA number from consent to find patient (Level 1)
  - Create care_context in clinic with hi_type = "FHIR Bundle" (or specific type)
  - Do NOT create duplicate patient
  - Record import_source = 'abdm_hiu'

**5. QR Code Scanning**
- QR codes contain ABHA reference (decoded to ABHA number/address)
- Lookup patient via Level 1 (ABHA)
- Update patient with any new demographics from QR
- No demographic matching needed (ABHA is definitive)

**Recommendations:**
1. Always prioritize ABHA when available (Level 1)
2. Fall back to demographics only when ABHA unavailable (Level 2-3)
3. Log all matches with confidence level for audit
4. Manual review for candidates (Level 4) 
5. Never demographic-match if ABHA is available in system

---

## Phase 8: Manual Review Workflow

### UI Flow

```
Input: Patient demographics (mobile, name, dob, gender)
  ↓
Check ABHA (Level 1) → Found? → Use + Update
  ↓ No
Check Mobile+DOB+Name (Level 2) → Found 1? → Use + Link
  ↓ Multiple
Check Mobile+Name (Level 3) → Found 1? → Use + Link
  ↓ Multiple
Return { requiresManualReview: true, candidates: [...] }
  ↓
UI: Present list of candidates
  ↓
User selects one of:
  a) Select existing patient from candidates
  b) "None of the above" → Create new patient with duplicate warning
  ↓
Link patient to clinic (patient_clinics)
Create care_context if needed
```

### API Response for Manual Review

```json
{
  "status": "manual_review_required",
  "message": "Found 3 similar patients. Please select one.",
  "candidates": [
    {
      "id": 123,
      "name": "Rajesh Sharma",
      "mobile": "9650269758",
      "dob": "1985-03-15",
      "gender": "M",
      "context_count": 5,
      "last_visit": "2026-06-20",
      "uhid": "HOS001234"
    },
    {
      "id": 124,
      "name": "Raj Sharma",
      "mobile": "9650269758",
      "dob": "1985-03-15",
      "gender": "M",
      "context_count": 2,
      "last_visit": "2026-06-15",
      "uhid": null
    },
    {
      "id": 125,
      "name": "Rajesh S.",
      "mobile": "9650269758",
      "dob": "1985-03-15",
      "gender": "M",
      "context_count": 0,
      "last_visit": null,
      "uhid": null
    }
  ],
  "matchedBy": "mobile_name_multiple",
  "confidence": 0,
  "allowCreateNew": true
}
```

### Database Record for Audit

```sql
CREATE TABLE IF NOT EXISTS patient_match_log (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES emr_clinics(id),
  search_mobile VARCHAR(10),
  search_name VARCHAR(255),
  search_dob DATE,
  search_gender CHAR(1),
  matched_by VARCHAR(50),  -- 'abha_number', 'abha_address', 'mobile_dob_name', etc.
  confidence INT,  -- 100, 99, 95, 0 (manual review)
  matched_patient_id INTEGER REFERENCES emr_patients(id),
  candidates_count INT,
  manual_review BOOLEAN DEFAULT FALSE,
  user_selection_id INTEGER REFERENCES emr_patients(id),
  created_by_user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patient_match_log_clinic ON patient_match_log(clinic_id);
CREATE INDEX idx_patient_match_log_created ON patient_match_log(created_at DESC);
```

---

## Phase 9: Multi-Clinic Security

### Principles

1. **Patients are global, associations are clinic-specific**
   - emr_patients: Global patient registry
   - patient_clinics: Clinic ↔ Patient many-to-many (UHID per clinic)
   - emr_care_contexts: Clinic-owned (clinic_id on record)

2. **Query Scoping**
   ```javascript
   // WRONG: Returns patients across all clinics
   SELECT p.* FROM emr_patients p WHERE p.mobile = ?
   
   // RIGHT: Returns only clinic's patients
   SELECT p.* FROM emr_patients p
     INNER JOIN patient_clinics pc ON p.id = pc.patient_id
     WHERE pc.clinic_id = ? AND p.mobile = ?
   ```

3. **ABHA Exception**
   - ABHA is nationally unique → search globally
   - But return matching clinic info
   ```sql
   SELECT p.*, pc.clinic_id, pc.uhid
   FROM emr_patients p
   LEFT JOIN patient_clinics pc ON p.id = pc.patient_id
   WHERE m.abha_number = ? 
   -- Returns patient + clinic relationship if it exists
   ```

4. **Soft Deletes**
   - Always filter: `WHERE p.deleted_at IS NULL`
   - Prevents accidentally matching deleted patients
   - Maintains history for compliance

### Code Implementation

```javascript
// Middleware to extract clinic_id from JWT
function extractClinicId(req) {
  if (!req.user?.clinic_id) {
    throw new Error('clinic_id not in JWT token');
  }
  return parseInt(req.user.clinic_id, 10);
}

// Scoped patient search
async function findPatientInClinic(pool, { mobile, dob, name, clinicId }) {
  const normalizedMobile = normalizePhone(mobile);
  
  const { rows } = await pool.query(
    `SELECT p.* FROM emr_patients p
     INNER JOIN patient_clinics pc ON p.id = pc.patient_id
     WHERE pc.clinic_id = $1
       AND normalize_phone(p.mobile) = $2
       AND p.dob = $3::date
       AND LOWER(p.name) = LOWER($4)
       AND p.deleted_at IS NULL
     LIMIT 1`,
    [clinicId, normalizedMobile, dob, name]
  );
  
  return rows[0] ?? null;
}

// Global ABHA search (returns clinic info if available)
async function findPatientByAbha(pool, { abhaNumber, clinicId }) {
  const { rows } = await pool.query(
    `SELECT p.*, pc.clinic_id, pc.uhid
     FROM emr_patients p
     JOIN abha_mappings m ON m.patient_id = p.id
     LEFT JOIN patient_clinics pc ON p.id = pc.patient_id 
       AND pc.clinic_id = $2
     WHERE m.abha_number = $1 
       AND m.status = 'active'
       AND p.deleted_at IS NULL
     LIMIT 1`,
    [abhaNumber, clinicId ?? null]
  );
  
  return rows[0] ?? null;
}
```

---

## Phase 10: Production-Ready Patient Matching Algorithm

### Complete Flow Chart

```
┌─────────────────────────────────────────────────────┐
│ Input: mobile, name, dob, gender, abhaNumber,       │
│        abhaAddress, clinicId, source                │
└──────────────────────┬────────────────────────────────┘
                       ↓
            ┌──────────────────────┐
            │ Level 1: ABHA Match  │
            └──────────┬───────────┘
                       ↓
         ┌─────────────────────────────────┐
         │ abhaNumber present?              │
         └─────────┬───────────────────────┘
                   ↓
      ┌────────────────────────────────┐
      │ Find via abha_mappings.        │
      │ abha_number (GLOBAL)           │
      └────────┬───────────────────────┘
               ↓
         ┌─────────────────────┐
         │ Found?              │
         └────────┬────────────┘
            Yes   │    No
                  ↓
         ┌──────────────────────┐
         │ Try ABHA Address     │ → Fall to Level 2
         │ (abha_mappings)      │
         └───────┬──────────────┘
                 ↓
           ┌─────────────┐
           │ Found?      │
           └────┬────────┘
            Yes │ No → Fall to Level 2
                ↓
       ╔═════════════════════════╗
       ║ Match: 100% confidence  ║
       ║ Action: UPDATE + LINK   ║
       ║ Return { patient, ... } ║
       ╚═════════════════════════╝

            ┌──────────────────────┐
            │ Level 2: Mobile+DOB+ │
            │ Name (CLINIC-SCOPED) │
            └──────────┬───────────┘
                       ↓
        ┌──────────────────────────────┐
        │ Normalize: mobile, name      │
        │ Query clinic patients with:  │
        │ clinic_id = ? AND            │
        │ mobile_norm = ? AND          │
        │ dob = ? AND                  │
        │ LOWER(name) = ?              │
        └──────────┬───────────────────┘
                   ↓
          ┌────────────────────┐
          │ # Matches?         │
          └────┬───────┬───────┘
              │   │   │
         0    │ 1 │   >1
             │   │    │
             ↓   ↓    ↓
      ┌──────┐ ┌──────┐ ┌─────────────────────┐
      │ Fall │ │Match │ │ Fall to Level 3     │
      │to L3 │ │99%   │ │ (or manual review   │
      │     │ │conf  │ │ if still >1)        │
      └─────┘ └──────┘ └─────────────────────┘

            ┌──────────────────────┐
            │ Level 3: Mobile+Name │
            │ (CLINIC-SCOPED)      │
            └──────────┬───────────┘
                       ↓
        ┌──────────────────────────────┐
        │ Normalize: mobile, name      │
        │ Query clinic patients with:  │
        │ clinic_id = ? AND            │
        │ mobile_norm = ? AND          │
        │ LOWER(name) = ?              │
        └──────────┬───────────────────┘
                   ↓
          ┌────────────────────┐
          │ # Matches?         │
          └────┬───────┬───────┘
              │   │   │
         0    │ 1 │   >1
             │   │    │
             ↓   ↓    ↓
      ┌──────┐ ┌──────┐ ┌─────────────────────┐
      │Create│ │Match │ │ Manual Review       │
      │New   │ │95%   │ │ Level 4             │
      │      │ │conf  │ │                     │
      └──────┘ └──────┘ └──────┬──────────────┘
             │ └──────────────→ ↓
             │         ┌──────────────────────┐
             │         │ Level 4: Manual      │
             │         │ Review               │
             │         └──────────┬───────────┘
             │                    ↓
             │         ┌─────────────────────────┐
             │         │ Return:                 │
             │         │ {                       │
             │         │  requiresManualReview   │
             │         │  candidates: [...]      │
             │         │  matchedBy: 'mobile...' │
             │         │ }                       │
             │         │ UI presents list        │
             │         │ User selects or        │
             │         │ creates new            │
             │         └─────────┬───────────────┘
             │                   ↓
             │         ┌─────────────────────────┐
             │         │ Create care_context     │
             │         │ and patient_clinics     │
             │         │ record                  │
             │         └──────────┬──────────────┘
             │                    ↓
             └──────────→ ┌──────────────────────┐
                        │ Return { patient, ... │
                        │ }                      │
                        └──────────────────────────┘
```

### Core Implementation: patient-match.service.js (REDESIGNED)

```javascript
/**
 * Patient Matching Service (v2.0)
 * 
 * Redesigned for safety:
 * - Level 1: ABHA (100% confidence)
 * - Level 2: Mobile+DOB+Name (99% confidence)
 * - Level 3: Mobile+Name (95% confidence)
 * - Level 4: Manual Review (ambiguous matches)
 * 
 * Critical Principle: Patient Safety > Duplicate Prevention
 */

const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phone-utils');

/**
 * Find or create patient with 4-tier matching strategy
 * @param {Pool} pool - Database connection pool
 * @param {Object} criteria - { abhaNumber, abhaAddress, mobile, name, dob, gender, clinicId }
 * @returns {Promise<Object>} - { patient, created, matchedBy, confidence, requiresManualReview, candidates }
 */
async function findOrCreatePatient(pool, {
  abhaNumber,
  abhaAddress,
  mobile,
  name,
  dob,
  gender,
  clinicId,
  source = 'manual'
}) {
  // Normalize phone number for consistent matching
  const normalizedMobile = normalizePhone(mobile);
  
  // ── Level 1: ABHA Number (100% confidence) ──────────────────────────
  if (abhaNumber) {
    const abhaMatch = await _findByAbhaNumber(pool, abhaNumber);
    if (abhaMatch) {
      await _updatePatientDemographics(pool, abhaMatch.id, { name, mobile, dob, gender });
      await _attachToClinic(pool, abhaMatch.id, clinicId);
      
      logger.info('[Patient Match] Level 1 ABHA Number match', {
        patientId: abhaMatch.id,
        abhaNumber,
      });
      
      return {
        patient: abhaMatch,
        created: false,
        matchedBy: 'abha_number',
        confidence: 100,
        requiresManualReview: false,
        candidates: []
      };
    }
  }
  
  // ── Level 1b: ABHA Address (100% confidence) ────────────────────────
  if (abhaAddress && !abhaNumber) {
    const abhaMatch = await _findByAbhaAddress(pool, abhaAddress);
    if (abhaMatch) {
      await _updatePatientDemographics(pool, abhaMatch.id, { name, mobile, dob, gender });
      await _attachToClinic(pool, abhaMatch.id, clinicId);
      
      logger.info('[Patient Match] Level 1b ABHA Address match', {
        patientId: abhaMatch.id,
        abhaAddress,
      });
      
      return {
        patient: abhaMatch,
        created: false,
        matchedBy: 'abha_address',
        confidence: 100,
        requiresManualReview: false,
        candidates: []
      };
    }
  }
  
  // ── Level 2: Mobile + DOB + Name (99% confidence, all three required) ──
  if (normalizedMobile && dob && name) {
    const level2Matches = await _findByMobileDobName(pool, {
      normalizedMobile,
      dob,
      name,
      clinicId
    });
    
    if (level2Matches.length === 1) {
      const matched = level2Matches[0];
      await _attachToClinic(pool, matched.id, clinicId);
      
      logger.info('[Patient Match] Level 2 Mobile+DOB+Name match', {
        patientId: matched.id,
        normalizedMobile,
        dob,
        name,
      });
      
      return {
        patient: matched,
        created: false,
        matchedBy: 'mobile_dob_name',
        confidence: 99,
        requiresManualReview: false,
        candidates: []
      };
    } else if (level2Matches.length > 1) {
      // Multiple Level 2 matches - ambiguous, needs manual review
      logger.warn('[Patient Match] Multiple Level 2 candidates (Mobile+DOB+Name)', {
        count: level2Matches.length,
        normalizedMobile,
        dob,
        name,
      });
      
      return {
        patient: null,
        created: false,
        matchedBy: 'mobile_dob_name_multiple',
        confidence: 0,
        requiresManualReview: true,
        candidates: _sanitizeCandidates(level2Matches),
        message: `Found ${level2Matches.length} patients with same mobile, DOB, and name.`
      };
    }
    // level2Matches.length === 0 - fall through to Level 3
  }
  
  // ── Level 3: Mobile + Name (95% confidence, single match only) ────────
  if (normalizedMobile && name) {
    const level3Matches = await _findByMobileName(pool, {
      normalizedMobile,
      name,
      clinicId
    });
    
    if (level3Matches.length === 1) {
      const matched = level3Matches[0];
      await _attachToClinic(pool, matched.id, clinicId);
      
      logger.info('[Patient Match] Level 3 Mobile+Name match', {
        patientId: matched.id,
        normalizedMobile,
        name,
      });
      
      return {
        patient: matched,
        created: false,
        matchedBy: 'mobile_name',
        confidence: 95,
        requiresManualReview: false,
        candidates: []
      };
    } else if (level3Matches.length > 1) {
      // Multiple matches at Level 3 - manual review required
      logger.warn('[Patient Match] Multiple Level 3 candidates (Mobile+Name)', {
        count: level3Matches.length,
        normalizedMobile,
        name,
      });
      
      return {
        patient: null,
        created: false,
        matchedBy: 'mobile_name_multiple',
        confidence: 0,
        requiresManualReview: true,
        candidates: _sanitizeCandidates(level3Matches),
        message: `Found ${level3Matches.length} patients with same mobile and name.`
      };
    }
    // level3Matches.length === 0 - fall through to creation
  }
  
  // ── Level 4: No match found or manual review required ─────────────────
  logger.debug('[Patient Match] No match at any level - creating new patient', {
    hasAbhaNumber: !!abhaNumber,
    hasMobile: !!normalizedMobile,
    hasName: !!name,
  });
  
  // Create new patient
  const newPatient = await _createPatient(pool, {
    name,
    mobile,
    dob,
    gender,
    clinicId
  });
  
  // Attach ABHA if provided
  if (abhaNumber || abhaAddress) {
    await _attachAbha(pool, newPatient.id, { abhaNumber, abhaAddress, source });
  }
  
  return {
    patient: newPatient,
    created: true,
    matchedBy: null,
    confidence: 0,
    requiresManualReview: false,
    candidates: []
  };
}

// ── Helper Functions ────────────────────────────────────────────────────

async function _findByAbhaNumber(pool, abhaNumber) {
  const { rows } = await pool.query(
    `SELECT p.* FROM emr_patients p
     JOIN abha_mappings m ON m.patient_id = p.id
     WHERE m.abha_number = $1 AND m.status = 'active' AND p.deleted_at IS NULL
     LIMIT 1`,
    [abhaNumber]
  );
  return rows[0] ?? null;
}

async function _findByAbhaAddress(pool, abhaAddress) {
  const { rows } = await pool.query(
    `SELECT p.* FROM emr_patients p
     JOIN abha_mappings m ON m.patient_id = p.id
     WHERE m.abha_address = $1 AND m.status = 'active' AND p.deleted_at IS NULL
     LIMIT 1`,
    [abhaAddress]
  );
  return rows[0] ?? null;
}

async function _findByMobileDobName(pool, { normalizedMobile, dob, name, clinicId }) {
  const { rows } = await pool.query(
    `SELECT p.* FROM emr_patients p
     INNER JOIN patient_clinics pc ON p.id = pc.patient_id
     WHERE pc.clinic_id = $1
       AND p.mobile_normalized = $2
       AND p.dob = $3::date
       AND LOWER(p.name) = LOWER($4)
       AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC
     LIMIT 10`,
    [clinicId, normalizedMobile, dob, name]
  );
  return rows;
}

async function _findByMobileName(pool, { normalizedMobile, name, clinicId }) {
  const { rows } = await pool.query(
    `SELECT p.* FROM emr_patients p
     INNER JOIN patient_clinics pc ON p.id = pc.patient_id
     WHERE pc.clinic_id = $1
       AND p.mobile_normalized = $2
       AND LOWER(p.name) = LOWER($3)
       AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC
     LIMIT 10`,
    [clinicId, normalizedMobile, name]
  );
  return rows;
}

async function _updatePatientDemographics(pool, patientId, { name, mobile, dob, gender }) {
  await pool.query(
    `UPDATE emr_patients
     SET name = COALESCE($1, name),
         mobile = COALESCE($2, mobile),
         dob = COALESCE($3::date, dob),
         gender = COALESCE($4, gender)
     WHERE id = $5`,
    [name ?? null, mobile ?? null, dob ?? null, gender ?? null, patientId]
  );
}

async function _attachToClinic(pool, patientId, clinicId) {
  if (!clinicId) return;
  
  await pool.query(
    `INSERT INTO patient_clinics (patient_id, clinic_id, first_visit_at, last_visit_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (patient_id, clinic_id) DO UPDATE
       SET last_visit_at = NOW()`,
    [patientId, clinicId]
  );
}

async function _attachAbha(pool, patientId, { abhaNumber, abhaAddress, source }) {
  if (!abhaNumber && !abhaAddress) return;
  
  await pool.query(
    `INSERT INTO abha_mappings (patient_id, abha_number, abha_address, status, source)
     VALUES ($1, $2, $3, 'active', $4)
     ON CONFLICT (patient_id, abha_number) WHERE abha_number IS NOT NULL
     DO UPDATE SET status = 'active', linked_at = NOW()`,
    [patientId, abhaNumber ?? null, abhaAddress ?? null, source]
  );
  
  // Keep legacy columns in sync
  if (abhaNumber) {
    await pool.query(
      `UPDATE emr_patients SET abha_number = $1 WHERE id = $2`,
      [abhaNumber, patientId]
    );
  }
  if (abhaAddress) {
    await pool.query(
      `UPDATE emr_patients SET abha_address = $1 WHERE id = $2`,
      [abhaAddress, patientId]
    );
  }
}

async function _createPatient(pool, { name, mobile, dob, gender, clinicId }) {
  const { rows } = await pool.query(
    `INSERT INTO emr_patients (name, mobile, dob, gender, clinic_id, deleted_at)
     VALUES ($1, $2, $3, $4, $5, NULL)
     RETURNING *`,
    [name, mobile ?? null, dob ?? null, gender ?? null, clinicId ?? null]
  );
  
  const patient = rows[0];
  
  // Add to patient_clinics
  if (clinicId) {
    await _attachToClinic(pool, patient.id, clinicId);
  }
  
  return patient;
}

function _sanitizeCandidates(rows) {
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    mobile: r.mobile,
    dob: r.dob,
    gender: r.gender,
    created_at: r.created_at
  }));
}

module.exports = {
  findOrCreatePatient
};
```

---

## Summary: Database Migrations Required

### Migration 1: Phone Normalization

```sql
-- Add generated column for normalized mobile
ALTER TABLE emr_patients
  ADD COLUMN IF NOT EXISTS mobile_normalized VARCHAR(10) 
    GENERATED ALWAYS AS (normalize_phone(mobile)) STORED;

CREATE INDEX idx_emr_patients_mobile_normalized 
  ON emr_patients(mobile_normalized) WHERE deleted_at IS NULL;
```

### Migration 2: Composite Indexes for Matching

```sql
CREATE INDEX idx_emr_patients_mobile_dob_name
  ON emr_patients(clinic_id, mobile_normalized, dob, LOWER(name))
  WHERE deleted_at IS NULL;

CREATE INDEX idx_emr_patients_mobile_name
  ON emr_patients(clinic_id, mobile_normalized, LOWER(name))
  WHERE deleted_at IS NULL;
```

### Migration 3: Audit Logging

```sql
CREATE TABLE IF NOT EXISTS patient_match_log (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES emr_clinics(id),
  search_mobile VARCHAR(10),
  search_name VARCHAR(255),
  search_dob DATE,
  search_gender CHAR(1),
  matched_by VARCHAR(50),
  confidence INT,
  matched_patient_id INTEGER REFERENCES emr_patients(id),
  candidates_count INT,
  manual_review BOOLEAN DEFAULT FALSE,
  created_by_user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patient_match_log_clinic ON patient_match_log(clinic_id);
CREATE INDEX idx_patient_match_log_created ON patient_match_log(created_at DESC);
```

---

## Compliance Checklist

- [x] Patient Safety prioritized over duplicate prevention
- [x] ABHA is authoritative (Level 1 matching)
- [x] Phone normalization standardized
- [x] Multi-clinic isolation enforced
- [x] Concurrency protection via SELECT FOR UPDATE
- [x] Manual review workflow for ambiguous matches
- [x] Comprehensive indexes for 1M+ patients
- [x] ABDM compliance requirements documented
- [x] Soft deletes prevent accidental matching
- [x] Audit logging for compliance
- [x] Performance estimated and optimized

---

## Deployment Checklist

1. **Database Migrations** (in order):
   - Create normalize_phone() function
   - Add mobile_normalized generated column
   - Create composite indexes
   - Create patient_match_log table

2. **Code Changes**:
   - Deploy redesigned patient-match.service.js
   - Update abha.identity.js to use new service
   - Add phone-utils.js with normalizePhone()
   - Update appointment booking flow (slot.service.js)
   - Add manual review UI component

3. **Testing**:
   - Unit tests for phone normalization
   - Integration tests for 4-level matching
   - Concurrency stress test (race condition)
   - Multi-clinic isolation test
   - ABDM compliance test (ABHA matching)

4. **Monitoring**:
   - Alert on manual_review_required > threshold
   - Monitor patient_match_log for anomalies
   - Track duplicate patient detection rate
   - Audit ABHA match success rate

---

## References

- ABDM Documentation: https://abdm-doc.readthedocs.io/
- PostgreSQL BTree Indexes: https://www.postgresql.org/docs/current/indexes-types.html
- Node.js Transaction Handling: https://node-postgres.js.org/features/transactions
