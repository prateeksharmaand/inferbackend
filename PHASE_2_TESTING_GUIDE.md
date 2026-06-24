# Phase 2 Testing & Validation Guide

**Status:** Phase 2 Complete - Ready for Testing  
**Date:** 2026-06-24  
**Components:** Queue UI, Service Type Filtering, Doctor Assignment Validation  

---

## What Was Implemented in Phase 2

### 1. Service Type Filter UI
- Filter buttons below queue selector showing: All, Consultation, Lab, Vaccination, Report, Pharmacy, Reg, Procedure, Follow-up, Other
- Each button shows count of patients for that service type
- Active filter highlighted in purple
- Colored badges for easy recognition

### 2. Queue Statistics
- Real-time count by service type
- Tooltip showing breakdown by status (Booked/MY OPD/Completed)
- Statistics update as appointments are added/checked-in

### 3. Doctor Assignment Validation
- Mandatory doctor for: Consultation, Procedure, Follow-up
- Optional doctor for: Lab, Vaccination, Report, Pharmacy, Registration, Other
- Validation error prevents booking without required doctor
- Helpful text explaining if doctor is optional

### 4. Backward Compatibility
- Appointments without visit_type default to "consultation"
- Old data displays with default badges
- No breaking changes

---

## Testing Checklist

### ✅ Unit Tests Needed

```javascript
// 1. Filter Function Test
test('filterAppts with service type', () => {
  const appts = [
    { id: 1, visit_type: 'consultation', patient_name: 'A' },
    { id: 2, visit_type: 'lab', patient_name: 'B' },
    { id: 3, visit_type: 'vaccination', patient_name: 'C' }
  ];
  
  const filtered = filterAppts(appts, '', {}, 'lab');
  expect(filtered.length).toBe(1);
  expect(filtered[0].visit_type).toBe('lab');
});

// 2. Doctor Validation Test
test('doctor required for consultation', () => {
  const form = {
    patient_name: 'Test',
    patient_mobile: '9999999999',
    patient_dob: '2000-01-01',
    queue_id: 1,
    doctor_id: '' // Missing doctor
  };
  
  const visitType = 'consultation';
  const rules = VISIT_TYPE_RULES[visitType];
  
  if (rules.requiresDoctor && !form.doctor_id) {
    throw new Error('Doctor required');
  }
});

// 3. Doctor Optional for Lab
test('doctor optional for lab', () => {
  const visitType = 'lab';
  const rules = VISIT_TYPE_RULES[visitType];
  expect(rules.requiresDoctor).toBe(false);
  // Should allow booking without doctor
});
```

---

## Manual Testing Scenarios

### Scenario 1: Consultation Flow
```
Expected: Doctor REQUIRED

Steps:
1. Patient search → finds existing patient
2. System asks "What is patient here for?"
3. Select "Consultation" (👨‍⚕️)
4. BookAppointmentModal shown
5. Leave Doctor field empty
6. Click "Book Appointment"

Expected Result:
❌ Error: "Doctor is required for Consultation"
✅ Doctor field required (marked with *)
✅ Cannot proceed without doctor
✅ Error message clear and specific
```

### Scenario 2: Lab Service Without Doctor
```
Expected: Doctor OPTIONAL

Steps:
1. Patient search → finds patient
2. Select "Lab Test" (🧪)
3. ServiceTypeSelector shown
4. Select "Lab" (no appointment, goes direct to queue)
5. Visit created
6. Patient queued

Expected Result:
✅ Visit created with visit_type: lab
✅ Patient in queue without appointment
✅ No doctor field shown/required
✅ Queue displays: "[🧪 Lab]" badge
✅ Can check in without doctor assigned
```

### Scenario 3: Service Type Filtering
```
Expected: Filter shows only selected type

Steps:
1. Queue screen loaded
2. See service type filter strip with buttons:
   All, Consultation (👨‍⚕️), Lab (🧪), Vaccination (💉), etc.
3. Click "Consultation" button
4. Queue updates to show only consultations
5. Count badge shows "12" on Consultation button
6. Other buttons show their counts too

Expected Result:
✅ Filter buttons visible and interactive
✅ Active button highlighted in purple
✅ Counts accurate per service type
✅ Queue updates immediately
✅ Can switch filters smoothly
✅ "All" shows everything again
```

### Scenario 4: Vaccination (Optional Doctor)
```
Expected: Doctor OPTIONAL

Steps:
1. Patient search → finds patient
2. Select "Vaccination" (💉)
3. Visit created (direct queue)
4. Later: Doctor can optionally assign during check-in
5. If doctor assigned, shows in queue display

Expected Result:
✅ No doctor field required at queue entry
✅ "Optional doctor" text shown
✅ Can proceed without doctor
✅ Doctor assignable later
✅ Queue badge shows doctor if assigned
```

### Scenario 5: Procedure (Doctor Required)
```
Expected: Doctor REQUIRED + Appointment REQUIRED

Steps:
1. Patient search
2. Select "Procedure" (🏥)
3. BookAppointmentModal shown
4. Doctor field REQUIRED (*) and visible
5. Try to book without doctor
6. Error prevents booking

Expected Result:
❌ Cannot book without doctor
❌ Error: "Doctor is required for Procedure"
✅ Doctor field clearly marked required
✅ Queue/Time selection available
✅ Prevents invalid bookings
```

### Scenario 6: Statistics Tooltip
```
Expected: Show breakdown per status

Steps:
1. Queue screen loaded
2. Hover over "Booked" tab header
3. Tooltip shows breakdown:
   "consultation: 5, lab: 2, vaccination: 1"

Expected Result:
✅ Tooltip appears on hover
✅ Shows actual counts per type
✅ Clear formatting
✅ Accurate numbers
```

### Scenario 7: Old Appointments (Backward Compat)
```
Expected: Old appointments show as "Consultation"

Steps:
1. Old appointment in system (no visit_type set)
2. Queue screen loads
3. Appointment displays with "[👨‍⚕️ Consultation]" badge
4. Can check in normally
5. Doctor assignment works as before

Expected Result:
✅ Defaults to consultation
✅ Displays correctly
✅ No errors
✅ Filtering works
✅ Backward compatible
```

### Scenario 8: Multi-Queue Service Types
```
Expected: Filter works across queues

Steps:
1. Queue screen with multiple queues
2. Switch between queues
3. Service type filter persists or resets (verify expected behavior)
4. Counts update per queue

Expected Result:
✅ Filter applicable to selected queue
✅ Counts accurate per queue
✅ Service types display correctly
✅ No crosstalk between queues
```

---

## UI/UX Validation

### Visual Checks
- [ ] Service type buttons visible below queue selector
- [ ] Buttons have colors: blue=consult, purple=lab, green=vacc, amber=report, red=pharmacy, gray=reg, etc.
- [ ] Active button highlighted/outlined in purple
- [ ] Count badges visible on each button (small gray box with number)
- [ ] Emojis display correctly (👨‍⚕️🧪💉📋💊📝🛡️🏥↩️❓)
- [ ] Hover effects smooth and responsive
- [ ] Text readable (good contrast)
- [ ] Layout doesn't break on mobile (horizontal scroll if needed)

### Functional Checks
- [ ] Filter buttons clickable
- [ ] Queue updates immediately on filter change
- [ ] "All" button shows everything
- [ ] Counts are accurate
- [ ] Filter preserves when switching queues
- [ ] Error messages appear in red
- [ ] Doctor requirement validated before booking
- [ ] Tooltips appear and disappear smoothly

### Performance Checks
- [ ] Queue loads in <1 second
- [ ] Filter switches instantly (no lag)
- [ ] Statistics calculate quickly
- [ ] No console errors
- [ ] No memory leaks (dev tools)

---

## Backend Validation

### API Verification
```bash
# 1. Get appointments for a queue
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/appointments?queue_id=1&date=2026-06-24

# Expected: Appointments include "visit_type" field
# {
#   "date": "2026-06-24",
#   "booked": [
#     { "id": 1, "visit_type": "consultation", "patient_name": "Raj", ... },
#     { "id": 2, "visit_type": "lab", "patient_name": "Mohan", ... }
#   ],
#   ...
# }

# 2. Create visit
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/visits \
  -d '{"patient_id": 1, "visit_type": "consultation"}'

# Expected: Returns visit with visit_type
```

### Database Verification
```sql
-- Check appointments have visit_type
SELECT COUNT(*) FROM emr_appointments 
WHERE visit_type IS NOT NULL;

-- Check old appointments get default type
SELECT COUNT(*) FROM emr_appointments 
WHERE visit_type IS NULL;

-- Verify constraint
SELECT COUNT(*) FROM emr_appointments 
WHERE visit_type NOT IN ('consultation', 'lab', 'vaccination', 'report_collection', 
                         'pharmacy', 'registration', 'insurance', 'procedure', 'followup', 'other');
```

---

## Known Issues & Edge Cases

### Expected Behaviors
1. **Service type defaults to 'consultation'** if not specified
2. **Filter is applied client-side** (not a server filter)
3. **Statistics are real-time** from current board state
4. **Doctor validation happens at submit time**, not field level
5. **Backward compatible** - old appointments show as consultations

### Potential Issues to Watch
1. **Performance with large queues** (100+ appointments)
   - Test: Load queue with 500 appointments, filter/switch
   - Expected: Smooth, <500ms response

2. **Mobile responsiveness**
   - Test: Open on mobile, filter buttons should scroll
   - Expected: Horizontal scroll, buttons accessible

3. **Rapid filter switching**
   - Test: Click filters rapidly
   - Expected: No lag, accurate updates

4. **Doctor field visibility**
   - Test: Switch between service types with different doctor requirements
   - Expected: Field shows/hides appropriately

---

## Success Criteria for Phase 2

✅ Service type filtering works  
✅ Statistics display correctly  
✅ Doctor validation enforced  
✅ Backward compatibility maintained  
✅ UI responsive and intuitive  
✅ No console errors  
✅ Performance acceptable  
✅ Ready for clinic UAT  

---

## Testing Evidence Template

```markdown
### Test: Consultation Requires Doctor
- [ ] Booked consultation without doctor → Error shown
- [ ] Error message: "Doctor is required for Consultation"
- [ ] Doctor field marked with *
- [ ] Cannot submit without doctor

### Test: Lab allows optional doctor
- [ ] Lab visit created without doctor
- [ ] No error shown
- [ ] Can proceed to queue
- [ ] Optional text displayed

### Test: Service type filter works
- [ ] Filter buttons visible
- [ ] Clicking button filters queue
- [ ] Counts accurate
- [ ] "All" shows everything

### Test: Statistics display
- [ ] Counts shown on filter buttons
- [ ] Tooltip shows breakdown
- [ ] Numbers accurate
- [ ] Updates when appointments change
```

---

## Deployment Checklist

Before moving to Phase 3 (Testing):

- [ ] Frontend builds without errors
- [ ] All manual tests pass
- [ ] No console warnings/errors
- [ ] Database query returns visit_type
- [ ] Backward compat verified with old data
- [ ] Performance acceptable
- [ ] UI/UX validated
- [ ] Ready for clinic UAT

---

## Next Steps After Phase 2

1. **Run manual tests** above with actual clinic data
2. **Get clinic staff feedback** on UI/UX
3. **Verify doctor assignment** prevents booking correctly
4. **Performance test** with large queue
5. **Mobile testing** on clinic devices
6. **Then proceed to Phase 3:** Comprehensive unit + integration tests

---

## Contact for Issues

If testing reveals issues:
1. Check browser console for errors
2. Check network tab for API errors
3. Verify database has visit_type values
4. Clear cache and reload
5. Check backend logs for validation errors

**Phase 2 Implementation Complete** ✅  
**Ready for Testing Phase**
