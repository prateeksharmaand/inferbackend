# EMR Visit Layer Architecture

## Executive Summary

Implementing a Visit abstraction layer to decouple patient clinic arrivals from appointments and doctor assignments, enabling support for non-clinical workflows (lab, vaccination, report collection, etc.) while reusing existing queue infrastructure.

---

## 1. Database Design

### 1.1 New Table: emr_visits

```sql
CREATE TABLE emr_visits (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES emr_patients(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES emr_appointments(id) ON DELETE SET NULL,
  doctor_id INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,
  
  visit_type VARCHAR(50) NOT NULL,
  -- CONSULTATION | LAB | VACCINATION | PHARMACY | REPORT_COLLECTION | 
  -- REGISTRATION | INSURANCE | PROCEDURE | FOLLOWUP | OTHER
  
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  -- WAITING | IN_PROGRESS | COMPLETED | CANCELLED | NO_SHOW
  
  queue_number INTEGER,
  -- Token/Queue number for display
  
  check_in_time TIMESTAMPTZ,
  -- When patient checked in
  
  check_out_time TIMESTAMPTZ,
  -- When patient completed visit
  
  notes TEXT,
  -- Visit notes (reason, special requirements, etc.)
  
  created_by INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,
  -- Staff member who created visit
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_emr_visits_clinic_id ON emr_visits(clinic_id);
CREATE INDEX idx_emr_visits_patient_id ON emr_visits(patient_id);
CREATE INDEX idx_emr_visits_appointment_id ON emr_visits(appointment_id);
CREATE INDEX idx_emr_visits_doctor_id ON emr_visits(doctor_id);
CREATE INDEX idx_emr_visits_status ON emr_visits(status);
CREATE INDEX idx_emr_visits_visit_type ON emr_visits(visit_type);
CREATE INDEX idx_emr_visits_created_at ON emr_visits(created_at DESC);
CREATE INDEX idx_emr_visits_clinic_date ON emr_visits(clinic_id, created_at DESC);
```

### 1.2 Modified Table: emr_encounters

```sql
ALTER TABLE emr_encounters
ADD COLUMN IF NOT EXISTS visit_id INTEGER REFERENCES emr_visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_emr_encounters_visit_id ON emr_encounters(visit_id);
```

### 1.3 Visit Type Constants

```javascript
const VISIT_TYPES = {
  CONSULTATION: 'consultation',
  LAB: 'lab',
  VACCINATION: 'vaccination',
  PHARMACY: 'pharmacy',
  REPORT_COLLECTION: 'report_collection',
  REGISTRATION: 'registration',
  INSURANCE: 'insurance',
  PROCEDURE: 'procedure',
  FOLLOWUP: 'followup',
  OTHER: 'other'
};

const VISIT_STATUSES = {
  WAITING: 'waiting',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show'
};
```

---

## 2. API Endpoints

### 2.1 Create Visit

```http
POST /api/emr/visits
```

**Request Body:**
```json
{
  "clinic_id": 1,
  "patient_id": 123,
  "appointment_id": null,
  "doctor_id": null,
  "visit_type": "lab",
  "status": "waiting",
  "notes": "Lab test - blood work"
}
```

**Response:**
```json
{
  "id": 1001,
  "clinic_id": 1,
  "patient_id": 123,
  "appointment_id": null,
  "doctor_id": null,
  "visit_type": "lab",
  "status": "waiting",
  "queue_number": 15,
  "check_in_time": "2026-06-24T10:30:00Z",
  "check_out_time": null,
  "notes": "Lab test - blood work",
  "created_by": 5,
  "created_at": "2026-06-24T10:30:00Z",
  "updated_at": "2026-06-24T10:30:00Z"
}
```

### 2.2 List Visits (Queue View)

```http
GET /api/emr/visits?clinic_id=1&date=2026-06-24&visit_type=lab&status=waiting
```

**Query Parameters:**
- `clinic_id` (required)
- `date` (optional) - default: today
- `visit_type` (optional) - filter by CONSULTATION, LAB, etc.
- `status` (optional) - filter by WAITING, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW
- `doctor_id` (optional) - filter by assigned doctor
- `skip_appointments` (boolean) - include/exclude appointment-based visits

**Response:**
```json
{
  "date": "2026-06-24",
  "visits": [
    {
      "id": 1001,
      "patient_id": 123,
      "patient_name": "John Doe",
      "visit_type": "lab",
      "status": "waiting",
      "queue_number": 15,
      "doctor_id": null,
      "doctor_name": null,
      "check_in_time": "2026-06-24T10:30:00Z",
      "appointment_id": null
    }
  ],
  "byStatus": {
    "waiting": 10,
    "in_progress": 3,
    "completed": 25,
    "no_show": 2,
    "cancelled": 1
  },
  "byType": {
    "consultation": 5,
    "lab": 10,
    "vaccination": 3,
    "report_collection": 2,
    "other": 15
  }
}
```

### 2.3 Update Visit Status

```http
PATCH /api/emr/visits/:id/status
```

**Request Body:**
```json
{
  "status": "in_progress",
  "doctor_id": null
}
```

**Response:** Updated visit object

### 2.4 Check-in Visit

```http
POST /api/emr/visits/:id/checkin
```

**Response:** Updated visit with check_in_time set

### 2.5 Check-out Visit

```http
POST /api/emr/visits/:id/checkout
```

**Request Body (optional):**
```json
{
  "status": "completed"
}
```

**Response:** Updated visit with check_out_time set

### 2.6 Assign Doctor to Visit

```http
PATCH /api/emr/visits/:id/assign-doctor
```

**Request Body:**
```json
{
  "doctor_id": 42
}
```

**Response:** Updated visit with doctor_id set

### 2.7 Get Visit Details

```http
GET /api/emr/visits/:id
```

**Response:** Full visit object with patient and appointment details

---

## 3. Service Layer Implementation

### 3.1 Visit Service (backend/src/services/visit.service.js)

```javascript
const logger = require('../utils/logger');
const { pool } = require('../config/database');

class VisitService {
  /**
   * Create a visit for a patient
   */
  async createVisit(clinicId, patientId, {
    appointmentId = null,
    doctorId = null,
    visitType = 'other',
    notes = null,
    createdBy = null
  }) {
    // Validate visit_type
    const validTypes = ['consultation', 'lab', 'vaccination', 'pharmacy', 
                        'report_collection', 'registration', 'insurance', 
                        'procedure', 'followup', 'other'];
    if (!validTypes.includes(visitType)) {
      throw new Error(`Invalid visit_type: ${visitType}`);
    }

    // Generate queue number
    const { rows: queueRows } = await pool.query(
      `SELECT MAX(queue_number) as max_queue FROM emr_visits 
       WHERE clinic_id = $1 AND DATE(created_at) = CURRENT_DATE`,
      [clinicId]
    );
    const queueNumber = (queueRows[0]?.max_queue || 0) + 1;

    // Create visit
    const { rows } = await pool.query(
      `INSERT INTO emr_visits 
       (clinic_id, patient_id, appointment_id, doctor_id, visit_type, 
        status, queue_number, check_in_time, notes, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, NOW(), NOW())
       RETURNING *`,
      [clinicId, patientId, appointmentId, doctorId, visitType, 
       'waiting', queueNumber, notes, createdBy]
    );

    const visit = rows[0];
    logger.info('Visit created', {
      visitId: visit.id,
      clinicId,
      patientId,
      visitType,
      queueNumber
    });

    return visit;
  }

  /**
   * List visits for a clinic on a specific date
   */
  async listVisits(clinicId, date, { visitType = null, status = null, doctorId = null } = {}) {
    let sql = `
      SELECT v.*, 
             p.name as patient_name, 
             p.mobile as patient_mobile,
             d.name as doctor_name
      FROM emr_visits v
      LEFT JOIN emr_patients p ON v.patient_id = p.id
      LEFT JOIN emr_clinic_staff d ON v.doctor_id = d.id
      WHERE v.clinic_id = $1 
        AND DATE(v.created_at) = $2
    `;
    
    const params = [clinicId, date];
    let idx = 3;

    if (visitType) {
      sql += ` AND v.visit_type = $${idx++}`;
      params.push(visitType);
    }
    if (status) {
      sql += ` AND v.status = $${idx++}`;
      params.push(status);
    }
    if (doctorId) {
      sql += ` AND v.doctor_id = $${idx++}`;
      params.push(doctorId);
    }

    sql += ` ORDER BY v.queue_number, v.created_at`;

    const { rows } = await pool.query(sql, params);
    return rows;
  }

  /**
   * Update visit status
   */
  async updateVisitStatus(visitId, clinicId, newStatus) {
    const validStatuses = ['waiting', 'in_progress', 'completed', 'cancelled', 'no_show'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const { rows } = await pool.query(
      `UPDATE emr_visits SET status = $1, updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3
       RETURNING *`,
      [newStatus, visitId, clinicId]
    );

    if (!rows.length) throw new Error('Visit not found');

    logger.info('Visit status updated', {
      visitId,
      newStatus,
      clinicId
    });

    return rows[0];
  }

  /**
   * Check-in visit (set check_in_time and status to in_progress)
   */
  async checkInVisit(visitId, clinicId) {
    const { rows } = await pool.query(
      `UPDATE emr_visits 
       SET check_in_time = NOW(), status = 'in_progress', updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2
       RETURNING *`,
      [visitId, clinicId]
    );

    if (!rows.length) throw new Error('Visit not found');
    return rows[0];
  }

  /**
   * Check-out visit (set check_out_time and status)
   */
  async checkOutVisit(visitId, clinicId, finalStatus = 'completed') {
    const { rows } = await pool.query(
      `UPDATE emr_visits 
       SET check_out_time = NOW(), status = $1, updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3
       RETURNING *`,
      [finalStatus, visitId, clinicId]
    );

    if (!rows.length) throw new Error('Visit not found');
    return rows[0];
  }

  /**
   * Assign doctor to visit
   */
  async assignDoctor(visitId, clinicId, doctorId) {
    const { rows } = await pool.query(
      `UPDATE emr_visits SET doctor_id = $1, updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3
       RETURNING *`,
      [doctorId, visitId, clinicId]
    );

    if (!rows.length) throw new Error('Visit not found');
    return rows[0];
  }
}

module.exports = new VisitService();
```

### 3.2 Visit Controller (backend/src/emr/emr.visit.controller.js)

```javascript
const { pool } = require('../config/database');
const VisitService = require('../services/visit.service');
const logger = require('../utils/logger');

const createVisit = async (req, res) => {
  try {
    const { patient_id, appointment_id, doctor_id, visit_type, notes } = req.body;
    const clinicId = req.emrUser.clinic_id;
    const createdBy = req.emrUser.id;

    if (!patient_id) return res.status(400).json({ error: 'patient_id required' });
    if (!visit_type) return res.status(400).json({ error: 'visit_type required' });

    const visit = await VisitService.createVisit(clinicId, patient_id, {
      appointmentId: appointment_id,
      doctorId: doctor_id,
      visitType: visit_type,
      notes,
      createdBy
    });

    res.status(201).json(visit);
  } catch (err) {
    logger.error('Create visit failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const listVisits = async (req, res) => {
  try {
    const { date, visit_type, status, doctor_id } = req.query;
    const clinicId = req.emrUser.clinic_id;
    const queryDate = date || new Date().toISOString().slice(0, 10);

    const visits = await VisitService.listVisits(clinicId, queryDate, {
      visitType: visit_type,
      status,
      doctorId: doctor_id
    });

    // Group by status and type
    const byStatus = {};
    const byType = {};

    visits.forEach(v => {
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
      byType[v.visit_type] = (byType[v.visit_type] || 0) + 1;
    });

    res.json({
      date: queryDate,
      visits,
      byStatus,
      byType,
      total: visits.length
    });
  } catch (err) {
    logger.error('List visits failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const clinicId = req.emrUser.clinic_id;

    const visit = await VisitService.updateVisitStatus(id, clinicId, status);
    res.json(visit);
  } catch (err) {
    logger.error('Update visit status failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const checkIn = async (req, res) => {
  try {
    const { id } = req.params;
    const clinicId = req.emrUser.clinic_id;

    const visit = await VisitService.checkInVisit(id, clinicId);
    res.json(visit);
  } catch (err) {
    logger.error('Check-in visit failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const checkOut = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const clinicId = req.emrUser.clinic_id;

    const visit = await VisitService.checkOutVisit(id, clinicId, status || 'completed');
    res.json(visit);
  } catch (err) {
    logger.error('Check-out visit failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const assignDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const { doctor_id } = req.body;
    const clinicId = req.emrUser.clinic_id;

    if (!doctor_id) return res.status(400).json({ error: 'doctor_id required' });

    const visit = await VisitService.assignDoctor(id, clinicId, doctor_id);
    res.json(visit);
  } catch (err) {
    logger.error('Assign doctor failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createVisit,
  listVisits,
  updateStatus,
  checkIn,
  checkOut,
  assignDoctor
};
```

---

## 4. Queue Screen Modifications

### 4.1 Updated Queue Routes

```javascript
// In emr.routes.js
const visit = require('./emr.visit.controller');

// Visit CRUD
router.post('/visits', visit.createVisit);
router.get('/visits', visit.listVisits);
router.patch('/visits/:id/status', visit.updateStatus);
router.post('/visits/:id/checkin', visit.checkIn);
router.post('/visits/:id/checkout', visit.checkOut);
router.patch('/visits/:id/assign-doctor', visit.assignDoctor);
```

### 4.2 Frontend Queue Component Changes

```javascript
// emr-web/src/pages/Queue.jsx modifications

const VISIT_TYPE_FILTERS = {
  'All': null,
  'Consultations': 'consultation',
  'Lab': 'lab',
  'Vaccination': 'vaccination',
  'Report Collection': 'report_collection',
  'Registration': 'registration',
  'Insurance': 'insurance',
  'Pharmacy': 'pharmacy',
  'Procedures': 'procedure'
};

// Add filter state
const [visitTypeFilter, setVisitTypeFilter] = useState(null);

// Fetch visits instead of appointments
const fetchVisits = useCallback(() => {
  if (!activeQueue) return;
  setLoading(true);
  const d = `${q.getFullYear()}-${String(q.getMonth()+1).padStart(2,'0')}-${String(q.getDate()).padStart(2,'0')}`;
  const filters = visitTypeFilter ? `&visit_type=${visitTypeFilter}` : '';
  
  api.get(`/visits?clinic_id=${clinicId}&date=${d}${filters}`)
    .then(data => { setBoard(data); setLoading(false); })
    .catch(() => setLoading(false));
}, [activeQueue, queueDate, visitTypeFilter, clinicId]);
```

### 4.3 Visit Card Component

```javascript
// Display visit details in queue
function VisitCard({ visit, onStatusChange, onAssignDoctor, onCheckIn, onCheckOut }) {
  return (
    <div className={styles.visitCard}>
      <div className={styles.header}>
        <span className={styles.queueNumber}>#{visit.queue_number}</span>
        <span className={styles.patientName}>{visit.patient_name}</span>
        <span className={styles.visitType}>{visit.visit_type.toUpperCase()}</span>
        {visit.doctor_name && <span className={styles.doctor}>{visit.doctor_name}</span>}
      </div>
      <div className={styles.status}>
        <span className={styles.statusBadge}>{visit.status}</span>
      </div>
      <div className={styles.actions}>
        {visit.status === 'waiting' && (
          <button onClick={() => onCheckIn(visit.id)}>Check In</button>
        )}
        {visit.status === 'in_progress' && (
          <button onClick={() => onCheckOut(visit.id)}>Check Out</button>
        )}
      </div>
    </div>
  );
}
```

---

## 5. Backward Compatibility Strategy

### 5.1 Appointment to Visit Mapping

Existing appointments can continue to work:

```javascript
// When appointment is checked in, automatically create visit
async function handleAppointmentCheckIn(appointmentId) {
  const appt = await getAppointment(appointmentId);
  
  // Create corresponding visit
  const visit = await VisitService.createVisit(appt.clinic_id, appt.patient_id, {
    appointmentId: appt.id,
    doctorId: appt.doctor_id,
    visitType: 'consultation',  // Appointments are clinical consultations
    notes: `From appointment ${appt.id}`
  });
  
  // Update appointment with visit_id (optional)
  await updateAppointmentVisit(appt.id, visit.id);
}
```

### 5.2 Encounter Creation Updates

```javascript
// When creating encounter, link to visit if exists
async function saveEncounter(appointmentId, data) {
  const appointment = await getAppointment(appointmentId);
  
  // Find associated visit
  let visitId = null;
  if (appointment) {
    const visits = await pool.query(
      `SELECT id FROM emr_visits WHERE appointment_id = $1 LIMIT 1`,
      [appointmentId]
    );
    if (visits.rows.length) visitId = visits.rows[0].id;
  }
  
  // Create encounter with visit_id
  const encounter = await createEncounter({
    ...data,
    visit_id: visitId
  });
  
  return encounter;
}
```

---

## 6. ABDM Compatibility

### 6.1 Care Context Generation

**UNCHANGED:** Care Contexts are still generated only from Encounters

```javascript
// In emr.appointment.controller.js saveEncounter()
// No changes to ABDM workflow

if (a.emr_patient_id) {
  // ... existing care context creation code ...
  // This remains unchanged - visits do not trigger care context creation
}
```

### 6.2 Visit Data in FHIR

Visits are NOT included in FHIR bundles. Only clinical Encounters generate FHIR resources.

```javascript
// Example: Lab visit does not create FHIR bundle
// Only if lab creates an Encounter would FHIR be generated
const visit = {
  visit_type: 'lab',
  // NO fhir_bundle, NO care_context
};

// Example: Consultation visit with encounter
const visit = {
  visit_type: 'consultation',
  // Linked to encounter
};
const encounter = {
  visit_id: visit.id,
  // Generates FHIR bundle and care context
};
```

---

## 7. Migration Plan

### Phase 1: Database & API (Week 1)

- [ ] Create migration: emr_visits table
- [ ] Create migration: add visit_id to emr_encounters
- [ ] Create visit service
- [ ] Create visit controller
- [ ] Add visit routes
- [ ] Deploy to staging
- [ ] Test visit CRUD operations

### Phase 2: Queue Integration (Week 2)

- [ ] Update Queue component to support visit filtering
- [ ] Create Visit filter buttons (Consultations, Lab, Vaccination, etc.)
- [ ] Create VisitCard component
- [ ] Add visit check-in/check-out actions
- [ ] Test queue display with visits
- [ ] Verify appointment compatibility

### Phase 3: Workflow Integration (Week 3)

- [ ] Auto-create visit when appointment checked in
- [ ] Update encounter creation to link visits
- [ ] Implement visit-to-appointment backward mapping
- [ ] Test end-to-end workflows
- [ ] ABDM compatibility verification

### Phase 4: Analytics & Optimization (Week 4)

- [ ] Add visit analytics
- [ ] Create visit dashboards
- [ ] Performance tuning
- [ ] User training
- [ ] Full production deployment

---

## 8. Data Migration Script

```sql
-- Migration: 056_add_visits_layer.sql

-- Create visits table
CREATE TABLE emr_visits (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES emr_clinics(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES emr_patients(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES emr_appointments(id) ON DELETE SET NULL,
  doctor_id INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,
  
  visit_type VARCHAR(50) NOT NULL DEFAULT 'other',
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  queue_number INTEGER,
  
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  notes TEXT,
  
  created_by INTEGER REFERENCES emr_clinic_staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add visit_id to encounters
ALTER TABLE emr_encounters
ADD COLUMN IF NOT EXISTS visit_id INTEGER REFERENCES emr_visits(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX idx_emr_visits_clinic_id ON emr_visits(clinic_id);
CREATE INDEX idx_emr_visits_patient_id ON emr_visits(patient_id);
CREATE INDEX idx_emr_visits_appointment_id ON emr_visits(appointment_id);
CREATE INDEX idx_emr_visits_doctor_id ON emr_visits(doctor_id);
CREATE INDEX idx_emr_visits_status ON emr_visits(status);
CREATE INDEX idx_emr_visits_visit_type ON emr_visits(visit_type);
CREATE INDEX idx_emr_visits_created_at ON emr_visits(created_at DESC);
CREATE INDEX idx_emr_visits_clinic_date ON emr_visits(clinic_id, created_at DESC);
CREATE INDEX idx_emr_encounters_visit_id ON emr_encounters(visit_id);

-- Optionally, backfill visits from existing appointments (checked in ones)
-- This is optional and can be done post-deployment
-- INSERT INTO emr_visits (clinic_id, patient_id, appointment_id, doctor_id, visit_type, status, check_in_time, created_at)
-- SELECT a.clinic_id, a.emr_patient_id, a.id, a.doctor_id, 'consultation', a.status, a.checked_in_at, a.created_at
-- FROM emr_appointments a
-- WHERE a.status IN ('checked_in', 'ongoing', 'completed')
--   AND NOT EXISTS (SELECT 1 FROM emr_visits WHERE appointment_id = a.id);
```

---

## 9. Rollback Strategy

### If issues detected:

```sql
-- Step 1: Disable new visit routes (code change + deploy)
-- Remove visit routes from emr.routes.js

-- Step 2: Drop visits table (if needed)
ALTER TABLE emr_encounters DROP COLUMN IF EXISTS visit_id;
DROP TABLE IF EXISTS emr_visits;

-- Step 3: Restart affected services
```

### Backward compatibility:

- Existing appointments continue to work unchanged
- Existing encounters work without visit_id
- Queue screen can fall back to appointment-based display
- No data loss on rollback

---

## 10. Testing Plan

### Unit Tests

```javascript
// test/services/visit.service.test.js
describe('VisitService', () => {
  it('should create visit with queue number', async () => {
    const visit = await VisitService.createVisit(1, 123, {
      visitType: 'lab',
      notes: 'Blood work'
    });
    expect(visit.queue_number).toBe(1);
    expect(visit.status).toBe('waiting');
  });

  it('should list visits by type', async () => {
    const visits = await VisitService.listVisits(1, '2026-06-24', {
      visitType: 'lab'
    });
    expect(visits.every(v => v.visit_type === 'lab')).toBe(true);
  });

  it('should check in visit', async () => {
    const visit = await VisitService.checkInVisit(1, 1);
    expect(visit.status).toBe('in_progress');
    expect(visit.check_in_time).not.toBeNull();
  });
});
```

### Integration Tests

```javascript
// test/integration/visit-workflow.test.js
describe('Visit Workflows', () => {
  it('should support consultation workflow', async () => {
    // 1. Create visit
    const visit = await api.post('/visits', {
      patient_id: 123,
      visit_type: 'consultation'
    });
    
    // 2. Assign doctor
    await api.patch(`/visits/${visit.id}/assign-doctor`, {
      doctor_id: 42
    });
    
    // 3. Check in
    const checkedIn = await api.post(`/visits/${visit.id}/checkin`, {});
    
    // 4. Create encounter
    const encounter = await api.post(`/appointments/${visit.appointment_id}/encounter`, {
      chief_complaint: 'Headache'
    });
    
    // 5. Check out
    const checkedOut = await api.post(`/visits/${visit.id}/checkout`, {});
    
    expect(encounter.visit_id).toBe(visit.id);
  });

  it('should support lab workflow without doctor', async () => {
    // 1. Create visit
    const visit = await api.post('/visits', {
      patient_id: 123,
      visit_type: 'lab'
      // No doctor_id
    });
    
    // 2. Check in
    await api.post(`/visits/${visit.id}/checkin`, {});
    
    // 3. Check out
    const checkedOut = await api.post(`/visits/${visit.id}/checkout`, {});
    
    expect(checkedOut.status).toBe('completed');
    expect(checkedOut.doctor_id).toBeNull();
  });
});
```

### Queue Display Tests

```javascript
// test/integration/queue-display.test.js
describe('Queue Display with Visits', () => {
  it('should show visits filtered by type', async () => {
    const response = await api.get('/visits?visit_type=lab');
    
    expect(response.visits.every(v => v.visit_type === 'lab')).toBe(true);
    expect(response.byType.lab).toBeGreaterThan(0);
  });

  it('should show visit counts by status', async () => {
    const response = await api.get('/visits');
    
    expect(response.byStatus.waiting).toBeDefined();
    expect(response.byStatus.in_progress).toBeDefined();
    expect(response.byStatus.completed).toBeDefined();
  });
});
```

---

## 11. Production Deployment Plan

### Pre-deployment Checklist

- [ ] All tests passing
- [ ] Database migration tested on staging
- [ ] Backward compatibility verified
- [ ] ABDM workflows tested
- [ ] Performance benchmarks acceptable
- [ ] Documentation updated
- [ ] Team training completed

### Deployment Steps

1. **Database Deployment (0 downtime)**
   ```bash
   # 1. Create new tables (non-blocking)
   psql $DB_URL -f migrations/056_add_visits_layer.sql
   
   # 2. Verify schema
   psql $DB_URL -c "\dt emr_visits"
   ```

2. **Backend Deployment (rolling)**
   ```bash
   # 1. Deploy new code with visit service
   docker pull infer-backend:v2.x.x
   
   # 2. Rolling restart (one pod at a time)
   kubectl set image deployment/infer-backend infer=infer-backend:v2.x.x
   
   # 3. Monitor logs
   kubectl logs -f deployment/infer-backend
   ```

3. **Frontend Deployment**
   ```bash
   # 1. Deploy updated Queue component
   docker pull infer-web:v2.x.x
   
   # 2. Rolling restart
   kubectl set image deployment/infer-web infer-web=infer-web:v2.x.x
   ```

4. **Post-deployment Verification**
   - [ ] Visit creation working
   - [ ] Queue display showing visits
   - [ ] Appointment backward compatibility working
   - [ ] Encounter creation linking visits
   - [ ] ABDM care contexts still generating from encounters
   - [ ] No performance degradation
   - [ ] Error rates normal

### Monitoring

```javascript
// New monitoring metrics
logger.info('Visit created', { visitId, visitType, clinicId });
logger.info('Visit status updated', { visitId, newStatus });
logger.info('Appointment to visit auto-created', { appointmentId, visitId });

// Alerts
- Alert if visit creation fails
- Alert if appointment to visit mapping fails
- Alert if visit list query exceeds 5 seconds
```

---

## 12. Success Metrics

- ✅ All visit types working independently
- ✅ Existing appointments continue working
- ✅ Queue screen displays both appointments and visits
- ✅ Encounter creation links to visits
- ✅ ABDM care contexts still generated correctly
- ✅ No data loss during migration
- ✅ Performance impact < 5%
- ✅ Zero downtime deployment
- ✅ All tests passing
- ✅ Full rollback capability

---

## Summary

This Visit layer implementation:

1. **Decouples** patient arrivals from appointments and doctors
2. **Enables** non-clinical workflows (lab, vaccination, registration)
3. **Reuses** existing queue infrastructure
4. **Maintains** backward compatibility with appointments
5. **Preserves** ABDM workflows (Care Contexts from Encounters only)
6. **Supports** future analytics and optimizations

The architecture is modular, testable, and can be deployed with zero downtime.
