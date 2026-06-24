# Root Cause Analysis: Appointment Not Visible in OPD Queue

## Problem
After creating an appointment and checking in, the appointment is NOT visible in the OPD queue view.

## Root Cause

### Issue: Queue ID Filter
The Queue component fetches appointments **filtered by queue_id**:

**File**: `emr-web/src/pages/Queue.jsx` (line 146)
```javascript
api.get(`/appointments?queue_id=${activeQueue.id}&date=${d}`)
```

This sends the API request:
```
GET /appointments?queue_id=1&date=2026-06-23
```

### Backend Filtering
**File**: `backend/src/emr/emr.appointment.controller.js` (line 129)
```javascript
if (queue_id) {
  sql += ` AND (a.queue_id = $${idx} OR a.channel IN ('whatsapp','sms','ivr','chat','online'))`;
  params.push(queue_id);
}
```

The query only shows appointments where:
- `a.queue_id = 1` (matches selected queue), **OR**
- `a.channel IN ('whatsapp','sms','ivr','chat','online')` (inbound channels)

### When Appointment Goes Missing
If appointment has:
- ❌ `queue_id = NULL` (not assigned to any queue)
- ❌ `channel = 'walk_in'` (not an inbound channel)

Then it **fails both conditions** and is filtered out ❌

## Why This Happens

### Scenario 1: Queue Not Selected During Appointment Creation
When creating appointment via BookAppointmentModal:
- User doesn't select a queue
- `queue_id` remains empty/null
- Appointment created with `queue_id = NULL`
- Won't appear in queue view

### Scenario 2: Channel is Not Inbound
- If channel is 'walk_in', 'doctor', 'staff', etc.
- Won't match the inbound channels filter
- Combined with null queue_id = invisible

## How to Verify

### Check the Appointment Data
```sql
SELECT id, patient_name, queue_id, channel, status, created_at 
FROM emr_appointments 
WHERE patient_name LIKE '%Prateek%'
ORDER BY created_at DESC;
```

Look for:
- **queue_id = NULL** → Problem! Needs queue assignment
- **channel = 'walk_in'** → OK, but needs non-null queue_id
- **status = 'checked_in'** → Status is correct

### Example
```
 id |     patient_name     | queue_id | channel  | status
----+----------------------+----------+----------+-----------
 10 | Prateek Sharma       |   NULL   | walk_in  | checked_in  ← WON'T SHOW
 11 | Prateek Sharma       |    1     | walk_in  | checked_in  ← WILL SHOW
```

## Solutions

### Solution 1: Make Queue Selection Mandatory
Force user to select queue before creating appointment:
```javascript
// In BookAppointmentModal.jsx
if (!form.queue_id) return setError('Please select a queue');
```

### Solution 2: Auto-assign to Default Queue
If no queue selected, assign to first available queue:
```javascript
// In createAppointment (backend)
const queueId = queue_id || (await getDefaultQueue());
INSERT INTO emr_appointments (queue_id, ...) VALUES (${queueId}, ...);
```

### Solution 3: Show All Clinic Appointments Option
Add toggle in Queue view to show all appointments (not just for selected queue):
```javascript
// In Queue.jsx
api.get(`/appointments?date=${d}${showAll ? '' : `&queue_id=${activeQueue.id}`)
```

### Solution 4: Change Backend Filter Logic
If queue_id is NULL, consider channel as the routing logic:
```sql
WHERE a.clinic_id = $1 
  AND a.appointment_date = $2
  AND (
    a.queue_id = $3                  -- Assigned to this queue, OR
    OR a.channel IN (...)            -- Inbound appointment, OR
    OR a.queue_id IS NULL            -- Unassigned walk-in (show in any queue view)
  )
```

## Recommended Fix
**Priority**: Implement **Solution 1** (Mandatory Queue Selection)

**Why**: 
- Simplest to implement
- Prevents confusing missing appointments
- Ensures proper patient flow management
- Aligns with clinic workflow (patients must go to a queue)

**Implementation**:
```javascript
// BookAppointmentModal.jsx - handleSubmit()
if (mode === 'checkin' && !form.queue_id) {
  return setError('Please select a queue to check in');
}
```

## Testing Checklist
- [ ] Create appointment WITHOUT selecting queue → Error shown
- [ ] Create appointment WITH queue selected → Appears in queue
- [ ] Checkin appointment → Moves to "MY OPD" section
- [ ] Verify status updates to "checked_in"
- [ ] Verify checked_in_at timestamp is set

---

## Summary
The appointment IS created and checked in successfully, but it's not visible because:
1. ❌ Queue was not selected during creation (queue_id = NULL)
2. ❌ Walk-in appointments without a queue assignment are filtered out
3. ✅ Only appointments with a valid queue_id show in that queue's view

Fix: **Make queue selection mandatory** for checkin flow.
