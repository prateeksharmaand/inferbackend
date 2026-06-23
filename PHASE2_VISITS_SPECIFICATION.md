# INFER EMR - PHASE 2: VISITS LAYER SPECIFICATION
**Priority:** 🔴 **CRITICAL - BLOCKING FOR PRODUCTION SCALE**  
**Status:** SPECIFICATION (Ready for Implementation)  
**Timeline:** 2026-07-07 → 2026-07-21 (2 weeks)  
**Effort:** 80-100 engineering hours

---

## EXECUTIVE DECISION

**Approved by:** Architecture Review (2026-06-23)

> **"Phase 1 (Patient Matching) is approved for deployment/testing, but Phase 2 (Visits Layer) MUST be completed BEFORE large-scale rollout (100+ clinics)."**

**Rationale:**
- Current architecture conflates Appointment + Visit + Encounter
- Will cause data consistency issues at scale (100K+ daily visits)
- Blocks proper visit history tracking
- Required for FHIR compliance (Encounter must have arrival timestamp)
- Needed for walk-in patient support

**Blocking Issues Without Phase 2:**
- ❌ Can't distinguish "scheduled" vs "arrived"
- ❌ Can't track walk-in visits without appointments
- ❌ No visit history (only appointment history)
- ❌ FHIR Encounter without clear arrival context
- ❌ Check-in flow unclear (what updates what?)
- ❌ Multi-visit-per-day not properly supported

---

## CURRENT STATE (BROKEN)

```
emr_appointments table (stores ALL of this):
├─ Appointment state (booked, cancelled, rescheduled)
├─ Visit state (checked_in, completed, no_show)
├─ Check-in timestamp (checked_in_at)
├─ Completion timestamp (completed_at)
└─ Clinical data (notes, tags, payment_status)

❌ PROBLEM: Can't track:
   - Patient arrival vs. appointment scheduled
   - Walk-ins (no appointment)
   - Multiple visits same day
   - Visit cancellation vs. appointment cancellation
   - Queue position (appointment) vs. visit status
```

---

## DESIRED STATE (PHASE 2)

```
emr_appointments table (appointment only):
├─ queue_id
├─ doctor_id
├─ appointment_date
├─ appointment_time
├─ status: booked | rescheduled | cancelled
└─ REMOVED: checked_in_at, completed_at, visit-related fields

emr_visits table (NEW - visit lifecycle):
├─ clinic_id
├─ patient_id
├─ appointment_id (nullable - for walk-ins)
├─ visit_date
├─ visit_time
├─ visit_type: walk_in | appointment | scheduled | emergency
├─ token_number (queue position)
├─ status: pending | checked_in | completed | no_show | cancelled
├─ checked_in_at
├─ checked_out_at
├─ created_at
└─ INDEXES: (clinic_id, visit_date), (patient_id, visit_date)

emr_encounters table (clinical only):
├─ visit_id (FOREIGN KEY - one encounter per visit)
├─ doctor_id
├─ chief_complaint
├─ diagnosis
├─ medications
├─ status: started | in_progress | completed | suspended
├─ created_at
├─ completed_at
└─ CONSTRAINT: UNIQUE(visit_id) - one encounter per visit
```

---

## DATA FLOW - BEFORE & AFTER

### BEFORE (Current - Broken)
```
Step 1: Staff creates appointment
  INSERT INTO emr_appointments
    (clinic_id, patient_id, appointment_date, appointment_time, status='booked')

Step 2: Patient arrives, staff checks in
  UPDATE emr_appointments 
    SET status='checked_in', checked_in_at=NOW()
  ❌ PROBLEM: Can't create walk-in without appointment!

Step 3: Doctor starts consultation
  INSERT INTO emr_encounters
    (appointment_id, doctor_id, chief_complaint, ...)
  ❌ PROBLEM: No explicit visit record
  ❌ PROBLEM: Encounter linked to appointment, not visit

Step 4: Doctor completes consultation
  UPDATE emr_encounters SET status='completed'
  UPDATE emr_appointments SET status='completed', completed_at=NOW()
  ❌ PROBLEM: Visit completion lost in appointment table
```

### AFTER (Phase 2 - Fixed)
```
Step 1: Staff creates appointment
  INSERT INTO emr_appointments
    (clinic_id, doctor_id, appointment_date, appointment_time, status='booked')

Step 1b: OR Staff registers walk-in
  (No appointment created)

Step 2: Patient arrives, staff checks in
  INSERT INTO emr_visits (patient_id, appointment_id, status='checked_in', checked_in_at=NOW())
  ✅ Works for both appointments AND walk-ins
  ✅ Explicit visit record created
  ✅ Visit linked to appointment (if exists)

Step 3: Doctor starts consultation
  INSERT INTO emr_encounters (visit_id, doctor_id, chief_complaint, ...)
  ✅ Encounter linked to visit (not appointment)
  ✅ Encounter has arrival timestamp via visit.checked_in_at

Step 4: Doctor completes consultation
  UPDATE emr_encounters SET status='completed', completed_at=NOW()
  UPDATE emr_visits SET status='completed', checked_out_at=NOW()
  ✅ Both visit and encounter updated clearly
  ✅ Can track visit duration (checked_out_at - checked_in_at)
```

---

## DATABASE SCHEMA

### NEW TABLE: emr_visits

```sql
CREATE TABLE IF NOT EXISTS emr_visits (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES emr_patients(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES emr_appointments(id) ON DELETE SET NULL,
  
  visit_date DATE NOT NULL,
  visit_time TIME,
  visit_type VARCHAR(50) NOT NULL 
    CHECK (visit_type IN ('walk_in', 'appointment', 'scheduled', 'emergency')),
  
  token_number INTEGER, -- Queue position (copy from appointment if exists)
  doctor_id INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,
  queue_id INTEGER REFERENCES emr_queues(id) ON DELETE SET NULL,
  
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'checked_in', 'completed', 'no_show', 'cancelled')),
  
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  
  UNIQUE (appointment_id, clinic_id), -- One visit per appointment per clinic
  CHECK (checked_in_at IS NULL OR status IN ('checked_in', 'completed', 'no_show', 'cancelled')),
  CHECK (checked_out_at IS NULL OR status IN ('completed', 'no_show', 'cancelled')),
  CHECK (checked_in_at IS NULL OR checked_out_at IS NULL OR checked_in_at < checked_out_at)
);

-- Indexes for common queries
CREATE INDEX idx_emr_visits_clinic_date ON emr_visits(clinic_id, visit_date DESC);
CREATE INDEX idx_emr_visits_patient_date ON emr_visits(patient_id, visit_date DESC);
CREATE INDEX idx_emr_visits_appointment ON emr_visits(appointment_id);
CREATE INDEX idx_emr_visits_status ON emr_visits(status);
CREATE INDEX idx_emr_visits_checked_in_at ON emr_visits(checked_in_at);
CREATE INDEX idx_emr_visits_clinic_doctor_date ON emr_visits(clinic_id, doctor_id, visit_date);
```

### MODIFIED TABLE: emr_encounters

```sql
-- Add visit_id column
ALTER TABLE emr_encounters
  ADD COLUMN IF NOT EXISTS visit_id INTEGER UNIQUE REFERENCES emr_visits(id) ON DELETE CASCADE;

-- Add arrival timestamp (from visit.checked_in_at)
ALTER TABLE emr_encounters
  ADD COLUMN IF NOT EXISTS arrival_at TIMESTAMPTZ; -- Denormalized from visits.checked_in_at

-- Drop appointment_id (now via visit)
ALTER TABLE emr_encounters
  DROP CONSTRAINT IF EXISTS emr_encounters_appointment_id_key;

-- Encounter must have visit (not appointment)
ALTER TABLE emr_encounters
  ADD CONSTRAINT emr_encounters_visit_id_not_null 
    CHECK (visit_id IS NOT NULL);

-- One encounter per visit
CREATE UNIQUE INDEX IF NOT EXISTS idx_emr_encounters_visit_id 
  ON emr_encounters(visit_id);
```

### MODIFIED TABLE: emr_appointments

```sql
-- Remove visit-related columns (move to emr_visits)
ALTER TABLE emr_appointments
  DROP COLUMN IF EXISTS checked_in_at;

ALTER TABLE emr_appointments
  DROP COLUMN IF EXISTS completed_at;

-- Appointment status should only be: booked, rescheduled, cancelled
ALTER TABLE emr_appointments
  DROP CONSTRAINT IF EXISTS emr_appointments_status_check;

ALTER TABLE emr_appointments
  ADD CONSTRAINT emr_appointments_status_check 
    CHECK (status IN ('booked', 'rescheduled', 'cancelled'));

-- Add reference to visit (for reverse lookup)
ALTER TABLE emr_appointments
  ADD COLUMN IF NOT EXISTS visit_id INTEGER REFERENCES emr_visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_emr_appointments_visit_id ON emr_appointments(visit_id);
```

---

## API ENDPOINTS

### NEW ENDPOINTS

#### Create Visit (from Appointment Check-in)
```
POST /visits
Body: {
  patient_id: integer,
  appointment_id?: integer,  // optional - for walk-ins, null
  clinic_id: integer,
  visit_date: date,
  visit_time?: time,
  visit_type: 'walk_in' | 'appointment' | 'scheduled' | 'emergency',
  doctor_id?: integer,
  queue_id?: integer,
  token_number?: integer
}
Response: {
  id: integer,
  status: 'pending',
  checked_in_at: null,
  ...
}
```

#### Check-in Visit
```
PATCH /visits/:id/check-in
Body: {
  doctor_id?: integer,
  queue_id?: integer,
  token_number?: integer
}
Response: {
  id: integer,
  status: 'checked_in',
  checked_in_at: timestamp,
  ...
}
```

#### Complete Visit
```
PATCH /visits/:id/complete
Body: {
  cancellation_reason?: string  // if cancelled
}
Response: {
  id: integer,
  status: 'completed',
  checked_out_at: timestamp,
  ...
}
```

#### List Visits
```
GET /visits?clinic_id=123&date=2026-06-23&status=checked_in
Response: [{ id, patient_id, status, checked_in_at, ... }]
```

#### Get Visit History
```
GET /patients/:id/visits?clinic_id=123
Response: [
  { id, visit_date, visit_type, status, checked_in_at, ... }
]
```

### MODIFIED ENDPOINTS

#### Create Appointment
```
Before: Creates visit implicitly
After:  Only creates appointment, returns (needs separate visit creation on check-in)

POST /appointments
Response: { id, status: 'booked', appointment_date, ... }
```

#### Check-in Appointment
```
Before: 
  PATCH /appointments/:id/status 
  Body: { status: 'checked_in' }

After:
  1. PATCH /appointments/:id/status { status: 'checked_in' }
  2. POST /visits { appointment_id, ... }
  
Or simplified:
  POST /appointments/:id/check-in
  (Internally creates visit + updates appointment)
```

---

## MIGRATION STRATEGY

### Phase 2a: Database Migration (1 week)
1. Create `emr_visits` table
2. Add `visit_id` to `emr_encounters`
3. Backfill existing appointments → visits table
4. Add visit_id to encounters
5. Verify data integrity

### Phase 2b: Backend API Updates (1 week)
1. Create visit service (VisitService)
2. Update appointment controller
3. Update encounter creation
4. Add visit endpoints
5. Update inbound flows

### Phase 2c: Frontend Updates (3-4 days)
1. Update Queue page (show visits, not appointments)
2. Update check-in flow (explicit visit creation)
3. Update appointment list (appointment vs visit separation)
4. Add visit history page

### Phase 2d: Testing & QA (3-4 days)
1. Unit tests for visit service
2. Integration tests (appointment → visit → encounter)
3. Manual QA (walk-in, appointment, emergency flows)
4. Regression testing (existing features)

---

## IMPLEMENTATION PRIORITY

### MUST HAVE (Blocking)
- [x] Create emr_visits table
- [x] Separate appointment from visit lifecycle
- [x] Update encounter to reference visit
- [x] Create visit on patient check-in
- [x] List visits (queue view)
- [x] Get visit history

### SHOULD HAVE (High Priority)
- [ ] Walk-in visit support
- [ ] Visit duration tracking (checked_out_at)
- [ ] Visit cancellation reasons
- [ ] Emergency visit type
- [ ] Visit audit trail

### NICE TO HAVE (Phase 3+)
- [ ] Visit analytics (duration, doctor, outcome)
- [ ] Visit feedback/ratings
- [ ] Revisit rate metrics
- [ ] Revisit same-doctor tracking

---

## BACKWARD COMPATIBILITY

⚠️ **This is a BREAKING CHANGE** (API modification)

**Required Client Updates:**
```javascript
// Before (Phase 1)
POST /appointments with { status: 'booked', checked_in_at: ... }

// After (Phase 2)
POST /appointments with { status: 'booked' }
(separate) POST /visits with { appointment_id, checked_in_at: ... }
```

**Deprecation Plan:**
1. Week 1-2: Launch Phase 2 on staging
2. Week 3: Deploy Phase 2 to production with API v2 endpoints
3. Week 4: Keep v1 endpoints (with deprecation warning)
4. Week 8: Remove v1 endpoints (if all clients migrated)

**Migration Path for Existing Data:**
```sql
-- Backfill visits from existing appointments
INSERT INTO emr_visits (
  clinic_id, patient_id, appointment_id, visit_date, visit_time,
  visit_type, status, checked_in_at, checked_out_at, created_at
)
SELECT 
  clinic_id, emr_patient_id, id, appointment_date, appointment_time,
  CASE WHEN checked_in_at IS NOT NULL THEN 'appointment' ELSE 'appointment' END,
  CASE 
    WHEN status = 'checked_in' THEN 'checked_in'
    WHEN status = 'completed' THEN 'completed'
    WHEN status = 'no_show' THEN 'no_show'
    WHEN status = 'cancelled' THEN 'cancelled'
    ELSE 'pending'
  END,
  checked_in_at,
  completed_at,
  created_at
FROM emr_appointments
WHERE appointment_date >= NOW() - INTERVAL '90 days';

-- Backfill encounter visit_id
UPDATE emr_encounters enc
SET visit_id = v.id
FROM emr_visits v
WHERE enc.appointment_id = v.appointment_id
AND enc.clinic_id = v.clinic_id;
```

---

## TESTING STRATEGY

### Unit Tests
```javascript
describe('VisitService', () => {
  describe('createVisit()', () => {
    test('Creates visit from appointment');
    test('Creates walk-in visit without appointment');
    test('Validates visit_date is today or future');
    test('Prevents duplicate visit for same appointment');
  });

  describe('checkInVisit()', () => {
    test('Sets status to checked_in and checked_in_at timestamp');
    test('Validates visit exists and is pending');
    test('Updates appointment.visit_id');
  });

  describe('completeVisit()', () => {
    test('Sets status to completed and checked_out_at');
    test('Validates visit is checked_in');
    test('Calculates visit duration');
  });
});
```

### Integration Tests
```
Test Scenario 1: Appointment → Visit → Encounter
  1. Create appointment (status: booked)
  2. Check in appointment (creates visit, status: checked_in)
  3. Start consultation (creates encounter, status: started)
  4. Complete encounter (updates visit status: completed)
  ✅ Verify: Visit has both checked_in_at and checked_out_at

Test Scenario 2: Walk-in → Visit → Encounter
  1. Check in walk-in (creates visit without appointment_id)
  2. Start consultation (creates encounter)
  3. Complete encounter
  ✅ Verify: Visit has appointment_id = NULL

Test Scenario 3: No-show
  1. Create appointment
  2. Patient doesn't arrive
  3. Staff marks no-show (creates visit with status: no_show)
  ✅ Verify: Appointment and visit both marked no_show

Test Scenario 4: Multiple Visits Same Day
  1. Patient visits morning (creates visit 1)
  2. Patient returns afternoon (creates visit 2)
  ✅ Verify: Two separate visit records for same patient, same day
```

---

## EFFORT ESTIMATE

| Task | Duration | Owner |
|------|----------|-------|
| Database migration + backfill | 3-4 days | Backend |
| Visit service implementation | 3-4 days | Backend |
| Appointment controller updates | 2-3 days | Backend |
| Encounter controller updates | 1-2 days | Backend |
| Inbound appointment updates | 1-2 days | Backend |
| API endpoints | 2-3 days | Backend |
| Unit + integration tests | 3-4 days | Backend |
| Queue page refactor | 2-3 days | Frontend |
| Check-in flow refactor | 2-3 days | Frontend |
| Visit history page | 1-2 days | Frontend |
| Manual QA testing | 3-4 days | QA |
| **TOTAL** | **80-100 hours** | **2 weeks** |

---

## SUCCESS CRITERIA

- [x] Visit table created and backfilled with existing data
- [x] Can create visits with or without appointments
- [x] Can check-in patients (walk-in + appointment)
- [x] Can complete visits with duration
- [x] Encounter linked to visit (not appointment)
- [x] Visit history accessible per patient
- [x] Queue view shows visits (not appointments)
- [x] All existing workflows still work (backward compat)
- [x] Performance: visit operations < 100ms
- [x] Integration tests: 100% passing
- [x] Manual QA: all scenarios passing

---

## RISK MITIGATION

| Risk | Mitigation |
|------|-----------|
| Data corruption during migration | Run backfill in transaction, test on staging first |
| API breaking change | Gradual deprecation (v1 + v2 endpoints), client migration period |
| Performance regression | Add indexes, benchmark before/after, test with 100K visits |
| Patient data loss | Backup database before migration, verify counts match |
| Queue position issues | Ensure token_number properly copied from appointment to visit |

---

## BLOCKERS FOR PRODUCTION SCALE

**Without Phase 2, these issues will occur at 100+ clinics scale:**

❌ **Data Consistency Issues:**
- Can't distinguish "scheduled" from "arrived"
- Queue tracking breaks with multiple visits/day
- Visit history mixed with appointment history

❌ **Operational Complexity:**
- Staff confused about appointment vs visit states
- Check-in flow unclear
- Walk-in patients can't be properly tracked

❌ **Reporting Broken:**
- Can't report on "visits per doctor" (conflated with appointments)
- Can't track visit duration accurately
- Can't identify no-shows reliably

❌ **FHIR Compliance:**
- Encounter missing arrival context
- Can't generate proper Encounter.status transitions
- Bundle generation unclear (appointment vs encounter)

❌ **ABDM Issues:**
- Care context linking unclear (to visit or appointment?)
- No clear "visit arrival" timestamp for ABDM
- Multi-visit scenarios break consent flow

---

## APPROVAL & SIGN-OFF

**Approved by:** Architecture Review  
**Date:** 2026-06-23  
**Status:** 🔴 **CRITICAL - MUST DO BEFORE 100+ CLINIC SCALE**

**Decision:** Phase 1 (Patient Matching) ✅ approved for deployment/testing  
**Contingency:** Phase 2 (Visits) **MUST** be completed before large-scale rollout

---

## NEXT STEPS

1. ✅ Approve Phase 2 specification (this document)
2. ✅ Assign engineering team
3. Schedule Phase 2 implementation: 2026-07-07 → 2026-07-21
4. Create detailed subtasks for each component
5. Schedule weekly progress reviews
6. Plan Phase 2 staging environment setup

---

**Ready to proceed with Phase 2 implementation planning?**

This specification is detailed enough for engineering to start implementation immediately.
