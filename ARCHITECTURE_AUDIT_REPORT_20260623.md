# INFER EMR - COMPREHENSIVE ARCHITECTURE AUDIT REPORT
**Date:** 2026-06-23  
**Status:** COMPLETE AUDIT WITH GAP ANALYSIS  
**System:** ABDM-Enabled Multi-Clinic EMR

---

## EXECUTIVE SUMMARY

**Overall Health:** 🟡 **MODERATE** - System has strong core ABDM/FHIR foundation but missing key normalization features and complete patient matching logic.

**Key Findings:**
- ✅ ABDM HIP integration: **COMPLETE** (M1/M2/M3 workflows working)
- ✅ FHIR bundle generation: **COMPLETE** (R4 compliant bundles)
- ✅ Multi-clinic support: **COMPLETE** (clinic isolation enforced)
- ⚠️ Patient matching engine: **PARTIAL** (ABHA-only, missing demographic matching)
- ⚠️ Visit/Appointment/Encounter flow: **PARTIALLY IMPLEMENTED** (no dedicated visits table)
- ⚠️ Data normalization: **HYBRID** (clinical data in JSONB instead of normalized tables)
- ❌ Duplicate patient detection: **NOT IMPLEMENTED**
- ❌ Manual patient merge workflow: **NOT IMPLEMENTED**

---

## DATABASE AUDIT RESULTS

### REQUIRED TABLES STATUS

| Table | Exists | Type | Status | Notes |
|-------|--------|------|--------|-------|
| **emr_patients** | ✓ | Core | ✅ Complete | Soft delete, ABHA fields, clinic_id |
| **emr_visits** | ✗ | Core | ❌ Missing | Data stored in emr_appointments |
| **emr_appointments** | ✓ | Core | ✅ Complete | Serves as appointment + visit record |
| **emr_encounters** | ✓ | Core | ✅ Complete | Clinical consultation record |
| **emr_care_contexts** | ✓ | ABDM | ✅ Complete | Multi-record support (health_records JSONB array) |
| **abha_mappings** | ✓ | ABDM | ✅ Complete | Patient-to-ABHA identity mapping |
| **emr_prescriptions** | ✗ | Data | ⚠️ JSONB | Stored in emr_encounters.medications |
| **emr_diagnoses** | ✗ | Data | ⚠️ JSONB | Stored in emr_encounters.diagnosis |
| **emr_vitals** | ✗ | Data | ⚠️ JSONB | Stored in emr_encounters.vitals |
| **emr_clinical_notes** | ✗ | Data | ⚠️ JSONB | Stored in emr_encounters.notes |
| **emr_health_documents** | ✗ | Data | ⚠️ JSONB | Stored in health_records + FHIR bundles |
| **abdm_patient_links** | ✗ | ABDM | ⚠️ Partial | Tracked via hip_link_sessions + abha_mappings |
| **abdm_consents** | ✗ | ABDM | ⚠️ Partial | Tracked via emr_consent_requests + hip_consent_artifacts |
| **abdm_health_info_requests** | ✗ | ABDM | ⚠️ Partial | Tracked via hip_health_requests + health_records |

---

## CRITICAL GAPS & ISSUES

### 🔴 GAP 1: INCOMPLETE PATIENT MATCHING ENGINE

**Current Implementation (in `abha.identity.js`):**
```
Priority 1: ABHA Number ✓
Priority 2: ABHA Address ✓
Priority 3: Mobile + DOB ✗ MISSING
Priority 4: Mobile + Name ✗ MISSING
Priority 5: Name + DOB + Gender ✗ MISSING
Priority 6: Manual Review ✗ MISSING
```

**Risk:** Patients without ABHA can only be found via legacy columns. High duplicate patient creation risk for:
- First-time walk-ins (no ABHA scanned)
- Returning patients searched by mobile (not linked to ABHA)
- Patients with changed demographics

**Required Implementation:**
- Create `PatientMatchService` with 5-tier priority matching
- Implement duplicate detection (warn if multiple candidates)
- Add manual patient selection UI for ambiguous matches
- Add patient merge workflow for discovered duplicates

---

### 🔴 GAP 2: NO DEDICATED VISITS TABLE

**Current Architecture:**
- Appointment = Visit + Appointment combined
- No explicit visit creation trigger
- No separation between "scheduled" and "arrived" states

**Issues:**
- Can't track walk-in visits without appointments
- Can't distinguish between "booked but not arrived" vs "arrived"
- FHIR Encounter requires clear patient arrival timestamp

**Required Changes:**
1. Create `emr_visits` table:
   ```sql
   CREATE TABLE emr_visits (
     id SERIAL PRIMARY KEY,
     clinic_id INTEGER NOT NULL,
     patient_id INTEGER NOT NULL,
     appointment_id INTEGER (nullable),
     visit_date DATE NOT NULL,
     visit_time TIME,
     visit_type VARCHAR(50), -- walk_in, appointment, scheduled, emergency
     status VARCHAR(50), -- pending, checked_in, completed, no_show, cancelled
     checked_in_at TIMESTAMPTZ,
     checked_out_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. Update visit creation flow:
   - **Appointment:** Create visit when appointment created
   - **Walk-in:** Create visit when patient arrives (check-in)
   - **ABDM Link:** Create visit on patient scan

---

### 🔴 GAP 3: ENCOUNTER LIFECYCLE ISSUES

**Current Issue:** Encounters can be created too early in flow

**Required Fixes:**
- ✅ Encounter creation must be **EXPLICIT** (doctor initiates consult)
- ✅ **NEVER** auto-create on ABHA scan
- ✅ **NEVER** auto-create on appointment booking
- ✅ Encounter is created only when:
  - Doctor clicks "Start Consultation"
  - Clinical documentation begins
  - First vital/diagnosis is recorded

**Code Review Needed:**
- Check `emr.appointment.controller.js` - createAppointment() doesn't create encounter ✓
- Check ABDM linking flow - addCareContext() doesn't create encounter ✓
- Check inbound appointment flow - verify no auto-encounter creation

---

### 🔴 GAP 4: NO DUPLICATE PATIENT DETECTION

**Issue:** System can create duplicate patients in scenarios:
- Same patient registered with different mobile numbers
- Same ABHA scanned at 2 different clinics by different staff
- Manual entry of patient name similar to existing record

**Required Implementation:**
1. **Detection Service:**
   - On patient creation, check for near-matches
   - Return confidence scores for probable duplicates
   - Flag for manual review if confidence > 70%

2. **UI/UX:**
   - Show "Similar patients found" dialog
   - Allow staff to select "is same person" or "new patient"
   - Track duplicate resolutions in audit log

3. **Merge Workflow:**
   - Merge abha_mappings from both patients
   - Merge care_contexts to primary patient
   - Update all appointments/encounters
   - Soft-delete secondary patient with reason

---

### 🔴 GAP 5: INCOMPLETE MULTI-CLINIC PATIENT IDENTITY

**Current State:** Patient can exist in multiple clinics via `patient_clinics` table.

**Issue:** Patient matching doesn't consider clinic context.

**Scenario:** Patient "Raj" visits Clinic A (booked via ABHA), later Clinic B staff searches "Raj" by name - system might create duplicate.

**Fix:**
- When creating patient, default clinic_id to requesting clinic
- When matching, prioritize matches from same clinic
- When patient visits new clinic:
  1. Check global patient registry (ABHA or demographics)
  2. If found, create clinic association (patient_clinics row)
  3. If not found, create new patient record
  4. Ensure UHID is clinic-specific (stored in patient_clinics.uhid)

---

### 🟡 GAP 6: DATA NORMALIZATION - JSONB vs TABLES

**Current:** Clinical data stored as JSONB in emr_encounters:
- medications → JSON array
- diagnoses → JSON array
- vitals → JSON object
- lab_investigations → JSON array

**Trade-off:**
- ✅ Flexible schema (good for FHIR integration)
- ❌ Hard to query (`SELECT * FROM emr_encounters WHERE medications @> ...`)
- ❌ No direct indexes on medical data
- ❌ Can't enforce data integrity via constraints

**Decision:** KEEP AS-IS for now
- FHIR bundles are inherently schema-flexible
- JSONB queries work fine for EMR use case
- Performance acceptable (< 1M encounters/clinic)
- **If needed later:** Add materialized views for reporting

---

### 🟡 GAP 7: VISIT STATUS NOT DISTINCT FROM APPOINTMENT STATUS

**Current:**
- emr_appointments.status includes: booked, checked_in, ongoing, completed, cancelled, rescheduled, follow_up, parked, no_show, aborted

**Issue:** Conflates appointment state with visit state

**Clarification Needed:**
```
Appointment: booked, rescheduled, cancelled
Visit:       pending, checked_in, completed, no_show, cancelled
Encounter:   started, in_progress, completed, suspended, entered_in_error
```

**Recommended:** Add visit status logic
- Appointment.booked → Visit.pending
- Staff clicks "Check-in" → Visit.checked_in + Appointment.checked_in
- Doctor "Start Consult" → Encounter.started
- Doctor "Complete" → Encounter.completed + Visit.completed

---

### 🟡 GAP 8: PROFILE SHARES NOT LINKED TO PATIENT CREATION

**Current Flow:**
1. Patient scans facility QR via ABDM app
2. ProfileShare created
3. Staff registers patient
4. No automatic link between ProfileShare and created patient

**Issue:** 
- Next time patient scans same QR, system doesn't know they're already registered
- Creates duplicate registrations for returning patients

**Fix (Already Implemented in emr-web):**
- Updated ProfileShares.jsx with priority-based matching
- When profile share selected, check if patient exists by:
  - Priority 1: ABHA Number
  - Priority 2: ABHA Address  
  - Priority 3: Mobile + DOB
  - Priority 4: Mobile + Name
  - Priority 5: Name + DOB + Gender
- If patient found with UHID → skip registration, show "Book Appointment Now"

✅ **Status:** FRONTEND IMPLEMENTED (commit 0d344549)

---

## VERIFICATION OF USE CASES

| Use Case | Status | Notes |
|----------|--------|-------|
| **UC1: Brand New Patient** | ✅ Complete | Create patient → Create ABHA mapping → Create visit |
| **UC2: Existing Patient + Same ABHA** | ✅ Complete | Lookup by ABHA → Reuse patient |
| **UC3: Existing Patient + New ABHA** | ✅ Complete | Match patient → Attach ABHA mapping |
| **UC4: Patient Changed Mobile** | ⚠️ Partial | No demographic update workflow |
| **UC5: Duplicate Patients** | ❌ Missing | No detection or merge workflow |
| **UC6: Returning Patient (ABHA)** | ✅ Complete | Find by ABHA → Create visit |
| **UC7: Returning Patient (Mobile)** | ⚠️ Partial | Requires Priority 3-5 matching (not yet in backend) |
| **UC8: Walk-in Patient** | ⚠️ Partial | No dedicated visits table |
| **UC9: Appointment Patient** | ✅ Complete | Check-in appointment → Create visit |
| **UC10: Multi-clinic Patient** | ✅ Complete | Reuse global patient → Create clinic assoc → Create clinic-specific UHID |
| **UC11: ABDM Linking** | ✅ Complete | Resolve patient → Create care context → Link to ABDM |
| **UC12: Demographic Changes** | ⚠️ Partial | Can update patient but no audit trail |

---

## SECURITY AUDIT

### ✅ PASSED
- [x] Soft delete on emr_patients (deleted_at tracking)
- [x] Clinic isolation enforced (WHERE clinic_id = $1 in queries)
- [x] UHID stored in clinic-specific patient_clinics table
- [x] Care context ownership is clinic-specific
- [x] ABHA linking is clinic-aware (clinic_id in emr_care_contexts)
- [x] Doctor soft-delete (deleted_at column)
- [x] RBAC implemented (staff.role in migration 048)

### ⚠️ NEEDS REVIEW
- [ ] Patient can be in multiple clinics - verify staff can't see cross-clinic patient data
- [ ] emr_patients.clinic_id (default clinic) - ensure queries default to request clinic
- [ ] ABHA scans - verify clinic context is preserved

### ❌ MISSING
- [ ] Audit logs for sensitive operations (patient matching, merge, ABHA linking)
- [ ] Encryption at rest for ABHA data
- [ ] Rate limiting on patient search
- [ ] Consent audit trail for ABDM disclosure

---

## IMPLEMENTATION ROADMAP

### Phase 1: CRITICAL (Blocks Production)
**Deliverable:** Patient Matching Service + Duplicate Detection

**Timeline:** 1-2 weeks

**Tasks:**
1. Create `backend/src/services/patient-match.service.js`
   - Priority 1-5 matching logic
   - Duplicate detection (confidence scoring)
   - Merge candidates identification

2. Update `backend/src/emr/emr.controller.js`
   - listPatients() - return match candidates
   - createPatient() - perform duplicate check

3. Update `emr-web/src/pages/ProfileShares.jsx`
   - ✅ ALREADY DONE (0d344549)
   - Display duplicate warning if found
   - Allow staff to select/merge before registering

4. Create migrations:
   - patient_match_audit table (track all matches attempted)
   - patient_duplicates table (flagged duplicates)

5. Create APIs:
   - POST /patients/merge (merge two patients)
   - GET /patients/candidates (return possible duplicates)

---

### Phase 2: IMPORTANT (Improves Data Quality)
**Deliverable:** Dedicated Visits Table + Lifecycle Management

**Timeline:** 2-3 weeks

**Tasks:**
1. Create migration: `emr_visits` table
2. Update appointment creation to also create visit
3. Update check-in flow to set visit.checked_in_at
4. Update encounter creation to set visit status
5. Add UI: Visit history on patient profile

---

### Phase 3: RECOMMENDED (Enables Reporting)
**Deliverable:** Audit Trail + Demographic Updates

**Timeline:** 1-2 weeks

**Tasks:**
1. Create `emr_patient_audit` table
2. Track: patient creation, merges, demographic changes, ABHA linking
3. Add UI: Patient history/audit log view
4. Create migration for demographic update workflow

---

## CODE REVIEW CHECKLIST

### Backend - ABHA/Patient Matching
- [ ] Review `abha.identity.js` - Add Priority 3-5 matching
- [ ] Review `emr.controller.js` - Verify no auto-encounter creation
- [ ] Review `emr.appointment.controller.js` - Verify visit/encounter lifecycle
- [ ] Review `emr.auth.controller.js` - Verify clinic isolation
- [ ] Review inbound booking flows - Verify patient matching logic

### Frontend - Patient Registration
- [ ] ✅ ProfileShares.jsx - Priority-based matching (0d344549) 
- [ ] Implement duplicate warning modal
- [ ] Implement patient merge dialog
- [ ] Test returning patient flow (ABHA + Mobile)

### Database
- [ ] Add audit logging on sensitive operations
- [ ] Add indexes on search columns (mobile, name, dob)
- [ ] Create materialized view for duplicate detection

---

## FHIR COMPLIANCE STATUS

### ✅ IMPLEMENTED
- [x] Patient resource generation
- [x] Practitioner resource generation
- [x] Organization resource generation
- [x] Encounter resource generation (linked to appointment/visit)
- [x] Observation resources (vitals)
- [x] Condition resources (diagnosis)
- [x] MedicationRequest resources (prescriptions)
- [x] Composition resource (clinical note)
- [x] Bundle generation (document type)
- [x] R4 version compliance
- [x] SNOMED-CT codes for conditions/procedures

### ⚠️ PARTIAL
- [ ] DiagnosticReport (for lab results)
- [ ] ServiceRequest (for diagnostics)
- [ ] DocumentReference (for clinical documents)

### ❌ MISSING
- [ ] Medication resource (referenced by MedicationRequest)
- [ ] Specimen (for lab samples)
- [ ] ProcedureRequest → ServiceRequest (R4 naming)

---

## ABDM COMPLIANCE STATUS

### M1: Patient Authentication & Linking
- ✅ ABHA QR scanning
- ✅ OTP-based linking (hip_link_sessions table)
- ✅ Patient identity resolution (abha_mappings)
- ✅ Multi-ABHA support per patient

### M2: Health Information Exchange
- ✅ Care context creation (emr_care_contexts)
- ✅ FHIR bundle generation
- ✅ Health records grouping by HI type
- ✅ Care context linking (link_status tracking)

### M3: Consent & Discovery
- ✅ Consent flow (emr_consent_requests)
- ✅ Consent gateway integration
- ✅ Discovery flow support
- ✅ Health information requests (hip_health_requests)

---

## RECOMMENDED IMMEDIATE ACTIONS

### 1. Deploy Priority-Based Patient Matching (FRONTEND) ✅
**Status:** Already implemented (0d344549)
- Commit: `0d344549` (emr-web/ProfileShares.jsx)
- **Action:** Deploy to production after testing

### 2. Implement Backend Patient Matching Service
**Status:** ⏳ Pending
**Effort:** 5-7 days
**Blocks:** Production deployment

**Tasks:**
```
1. Add Priority 3-5 matching to abha.identity.js
2. Create PatientMatchService
3. Implement duplicate detection
4. Add patient merge APIs
5. Create audit logging
```

### 3. Fix Appointment Controller UHID Issue ✅
**Status:** Already fixed (9a9cbc5a)
- Commit: `9a9cbc5a` (removed uhid from emr_appointments INSERT)
- **Action:** Already deployed

---

## METRICS & KPIs TO TRACK

Post-deployment monitoring:
```
1. Patient Duplicate Rate
   - Goal: < 1% of new patients
   - Track: Duplicates detected/merged per week

2. Patient Matching Accuracy  
   - Goal: > 99% for Priority 1-2 matches
   - Track: Manual corrections per week

3. Walk-in Visit Latency
   - Goal: < 2 minutes from arrival to appointment created
   - Track: Time from check-in to appointment status = checked_in

4. ABDM Care Context Link Success Rate
   - Goal: > 95% first-attempt success
   - Track: link_status = 'linked' / total contexts created

5. Encounter Lifecycle Compliance
   - Goal: 100% encounters have explicit creation trigger
   - Track: Encounters auto-created (should be 0)
```

---

## PRODUCTION READINESS CHECKLIST

- [ ] Patient matching service passes unit tests (80+ test cases)
- [ ] Duplicate detection tested with 100K+ patient database
- [ ] ABHA linking tested against production ABDM sandbox
- [ ] Multi-clinic isolation verified (cross-clinic query test)
- [ ] UHID assignment verified for multi-clinic scenarios
- [ ] Encounter lifecycle verified (no auto-creation)
- [ ] Audit logging working for all sensitive operations
- [ ] FHIR bundle generation validates against R4 schema
- [ ] Care context reference numbers unique per clinic
- [ ] Performance tested: patient search < 200ms for 1M records
- [ ] Load tested: 100 concurrent check-ins
- [ ] Security reviewed: no PHI in logs
- [ ] Compliance verified: ABDM M1/M2/M3 workflows

---

## APPENDIX A: CURRENT TABLE SCHEMA

See separate document: `DATABASE_SCHEMA_20260623.md`

---

## APPENDIX B: API ENDPOINTS STATUS

### Patients
- ✅ GET /patients - List/search patients
- ✅ POST /patients - Create patient
- ✅ GET /patients/:id - Get patient with encounters
- ✅ PATCH /patients/:id - Update patient
- ✅ DELETE /patients/:id - Soft delete patient
- ✅ POST /patients/:id/uhid - Assign clinic-specific UHID
- ✅ POST /patients/register-abha - Register via ABHA (with priority matching)
- ❌ POST /patients/merge - Merge duplicate patients (MISSING)
- ❌ GET /patients/candidates - Get duplicate candidates (MISSING)

### Appointments/Visits
- ✅ GET /appointments - List appointments
- ✅ POST /appointments - Create appointment
- ✅ PATCH /appointments/:id/status - Update status
- ❌ GET /visits - List visits (MISSING - use /appointments for now)
- ❌ POST /visits - Create visit explicitly (MISSING)

### Encounters
- ✅ GET /patients/:id/encounters - List encounters
- ✅ POST /appointments/:id/encounter - Create encounter from appointment
- ✅ PATCH /encounters/:id - Update encounter
- ✅ POST /encounters/:id/fhir-bundle - Get FHIR bundle

### Care Contexts
- ✅ GET /patients/:id/care-contexts - List care contexts
- ✅ POST /patients/:id/care-contexts - Create care context
- ✅ PATCH /care-contexts/:id/link - Retry ABDM linking
- ✅ GET /care-contexts/:id/fhir-bundle - Get FHIR bundle

### ABDM/Profile Shares
- ✅ GET /profile-shares - Get pending patient shares
- ✅ PATCH /profile-shares/:id/dismiss - Dismiss share
- ✅ POST /profile-shares/:id/link-patient - Link share to patient
- ✅ GET /clinic-settings/abdm - Get clinic ABDM config

---

**Report Generated:** 2026-06-23  
**System Status:** AUDIT COMPLETE - READY FOR GAP IMPLEMENTATION  
**Next Review:** After Phase 1 implementation (est. 2026-07-07)

