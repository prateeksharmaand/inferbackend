# Visit Layer Implementation Guide

**Status:** In Progress  
**Last Updated:** 2026-06-24  
**Version:** 2.0  

---

## Architecture Overview

### Core Concept

The Visit Layer decouples patient clinic arrivals from appointments, enabling support for multiple service types while maintaining backward compatibility.

**Key Points:**
- Visit = Patient arrival for specific service
- Appointment = Scheduled time (optional, consultations only)
- Encounter = Clinical documentation (created when doctor starts work)
- Care Context = ABDM representation (from encounters only)

---

## Service Types

| Type | Icon | Doctor | Appointment | ABDM | Notes |
|------|------|--------|-------------|------|-------|
| Consultation | 👨‍⚕️ | ✅ Required | ✅ Required | ✅ Yes | Doctor-patient consultation |
| Lab | 🧪 | ❌ No | ❌ No | ✅ Yes | Blood tests, imaging |
| Vaccination | 💉 | ⚠️ Optional | ❌ No | ✅ Yes | Immunizations |
| Report Collection | 📋 | ❌ No | ❌ No | ❌ No | Collect previous reports |
| Pharmacy | 💊 | ❌ No | ❌ No | ❌ No | Medication pickup |
| Registration | 📝 | ❌ No | ❌ No | ❌ No | Patient registration |
| Insurance | 🛡️ | ❌ No | ❌ No | ❌ No | Insurance docs |
| Procedure | 🏥 | ✅ Required | ✅ Required | ✅ Yes | Surgical/non-surgical |
| Follow-up | ↩️ | ✅ Required | ✅ Required | ✅ Yes | Post-treatment |
| Other | ❓ | ❌ No | ❌ No | ❌ No | Unspecified |

---

## Workflow

### Patient Journey

```
1. Patient Search/Add
   ↓
2. SELECT SERVICE TYPE (NEW)
   ├─ Consultation → Proceed to appointment booking
   └─ Others → Create visit, queue directly
   ↓
3. CREATE VISIT (auto, with service_type)
   ↓
4. For Consultation: BOOK APPOINTMENT
   ├─ Link appointment to visit
   └─ Assign queue + doctor
   ↓
5. QUEUE DISPLAY (with service type badges)
   ↓
6. CHECK IN
   ↓
7. For Consultation: Doctor creates ENCOUNTER
   └─ Generates FHIR + Care Context (ABDM)
   ↓
8. CHECK OUT
```

---

## API Reference

### POST /visits
Create a new visit
```
{
  "patient_id": 123,
  "visit_type": "consultation",
  "status": "waiting",
  "doctor_id": 456,
  "appointment_id": 789,
  "notes": "..."
}
```

### GET /visits
List visits with filters
```
/visits?date=2026-06-24&visit_type=consultation&status=waiting
```

### PATCH /visits/:id
Update visit (link appointment, etc.)
```
{
  "appointment_id": 789
}
```

### PATCH /visits/:id/check-in
Check in patient
```
{}
```

### PATCH /visits/:id/check-out
Check out patient
```
{
  "status": "completed"
}
```

### PATCH /visits/:id/assign-doctor
Assign doctor
```
{
  "doctor_id": 456
}
```

---

## Database Schema

### emr_visits Table
```sql
CREATE TABLE emr_visits (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  appointment_id INTEGER,
  doctor_id INTEGER,
  visit_type VARCHAR(50) NOT NULL DEFAULT 'other',
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  queue_number INTEGER,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Constraints
```sql
ALTER TABLE emr_visits
ADD CONSTRAINT visit_type_check 
CHECK (visit_type IN ('consultation', 'lab', 'vaccination', 'report_collection', 
                      'pharmacy', 'registration', 'insurance', 'procedure', 'followup', 'other'));
```

---

## Doctor Assignment Rules

### Implementation

```javascript
const VISIT_TYPE_RULES = {
  consultation: { requiresDoctor: true, requiresAppointment: true, abdmEligible: true },
  lab: { requiresDoctor: false, requiresAppointment: false, abdmEligible: true },
  vaccination: { requiresDoctor: false, requiresAppointment: false, abdmEligible: true },
  report_collection: { requiresDoctor: false, requiresAppointment: false, abdmEligible: false },
  pharmacy: { requiresDoctor: false, requiresAppointment: false, abdmEligible: false },
  registration: { requiresDoctor: false, requiresAppointment: false, abdmEligible: false },
  insurance: { requiresDoctor: false, requiresAppointment: false, abdmEligible: false },
  procedure: { requiresDoctor: true, requiresAppointment: true, abdmEligible: true },
  followup: { requiresDoctor: true, requiresAppointment: true, abdmEligible: true },
  other: { requiresDoctor: false, requiresAppointment: false, abdmEligible: false }
};
```

### Validation
- For `consultation`, `procedure`, `followup`: Doctor field required, cannot be empty
- For `lab`, `vaccination`: Doctor optional, can proceed without
- For others: Doctor field hidden, not applicable

---

## ABDM Compliance

### Care Context Generation

Care contexts generated ONLY from ENCOUNTERS with clinical data:

```
Visit (visit_type recorded)
  → Encounter (when doctor starts)
  → FHIR Bundle (clinical data)
  → Care Context (ABDM)
  → Consent Gateway
```

### Eligible Service Types
- ✅ Consultation
- ✅ Lab
- ✅ Vaccination
- ✅ Procedure
- ✅ Follow-up
- ❌ Report Collection (administrative)
- ❌ Pharmacy (administrative)
- ❌ Registration (administrative)
- ❌ Insurance (administrative)
- ❌ Other

---

## Implementation Checklist

### Phase 1: Core (Week 1)
- [x] Create Visit table
- [x] Create VisitService + VisitController
- [x] Add Visit API routes
- [x] Create VISIT_TYPE_RULES
- [x] ServiceTypeSelector component
- [x] Integration into AddPatientAbhaFlow

### Phase 2: Queue Integration (Week 2)
- [ ] Display service type badges in Queue
- [ ] Add service type filtering
- [ ] Update AppointmentCard styling
- [ ] Add color-coded badges

### Phase 3: Validation (Week 2)
- [ ] Enforce doctor requirements
- [ ] Validate appointment linking
- [ ] Test complete workflow

### Phase 4: Testing & Deployment (Week 3)
- [ ] Unit tests
- [ ] Integration tests
- [ ] UAT with clinic
- [ ] Production deployment

---

## Testing Checklist

### Manual Tests
```
☐ Consultation: Create visit → Book appointment → Check in → Encounter
☐ Lab: Create visit → No appointment → Check in → No encounter
☐ Walk-in: Service type selector → Visit → Queue → Check in
☐ Doctor mandatory: Show error if not selected for consultation
☐ Doctor optional: Proceed without for lab/vaccination
☐ Queue badges: Service types displayed with colors
☐ Multi-queue: Patient assigned to correct queue
☐ Backward compat: Old appointments still work
☐ ABDM: Care context generated only for consultations
```

---

## Deployment Checklist

```bash
# Pre-deployment
☐ Backup production database
☐ Test migrations on staging
☐ Run backfill script
☐ Verify data integrity

# Deployment
☐ Deploy backend
☐ Run migrations (30 min maintenance)
☐ Run backfill script
☐ Verify endpoints
☐ Deploy frontend
☐ Staff training
☐ Monitor production

# Post-deployment
☐ Check visit creation logs
☐ Verify queue display
☐ Test appointment linking
☐ Check ABDM care context generation
☐ Get feedback from clinic staff
```

---

## FAQ

**Q: Do existing appointments break?**
A: No. Service type defaults to "consultation". Backward compatible.

**Q: What about walk-ins?**
A: Service type selected at check-in. Visit created immediately.

**Q: How does ABDM work?**
A: Only consultations generate care contexts (same as before).

**Q: How to migrate?**
A: Automatic backfill creates "consultation" visits for all existing appointments.

**Q: Can doctors be optional?**
A: Yes, for lab/vaccination/other types. Required for consultation/procedure/followup.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Service type selection rate | >95% |
| Queue display working | 100% |
| Doctor assignment compliance | 100% |
| ABDM care context generation | Unchanged |
| Reception staff training | <10 min |
| Clinic adoption | 100% in week 1 |

---

**Next Steps:**
1. Queue UI updates (service type badges)
2. Doctor assignment validation
3. Comprehensive testing
4. Production deployment
