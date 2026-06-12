# ABDM QR Registration - Testing Guide

## Pre-Test Checklist

### Backend
- [ ] Backend server running on port 3001
- [ ] Database migrations applied (005_emr.sql + 029_emr_patients_abha_fields.sql)
- [ ] EMR JWT token available for testing
- [ ] Logger properly imported in emr.controller.js

### Frontend
- [ ] Frontend dev server running on port 5174
- [ ] jsqr package installed (`npm ls jsqr`)
- [ ] AbhaQrScan.jsx component created
- [ ] Patients page updated with ABHA QR button
- [ ] Routes configured in App.jsx

## Test Scenarios

### Scenario 1: Camera-Based QR Scanning

**Setup:**
1. Have a valid ABHA QR code printed or displayed on another device
2. Login to EMR application
3. Navigate to Patients page

**Test Steps:**
1. Click "ABHA QR" button in header
2. Select "Scan with Camera"
3. Allow camera permissions
4. Position QR code in scan box
5. Wait for automatic detection (<3 seconds)
6. Verify patient details populate correctly
7. Review and confirm details
8. Click "Confirm & Register"

**Expected Results:**
- [ ] Camera feed displays correctly
- [ ] Scan box overlay visible
- [ ] QR code detected automatically
- [ ] Patient data populates all fields
- [ ] Success screen shows with patient ID
- [ ] Patient created in database

**Test Data:**
```json
{
  "abhaNumber": "12-1234-5678-9012",
  "abhaAddress": "ramesh@sbx",
  "name": "Ramesh Kumar",
  "gender": "M",
  "dob": "1985-03-20",
  "mobile": "9876543210"
}
```

### Scenario 2: Image Upload QR Scanning

**Setup:**
1. Have a ABHA QR code image saved (PNG/JPG)
2. Login to EMR application
3. Navigate to Patients page

**Test Steps:**
1. Click "ABHA QR" button
2. Select "Upload QR Image"
3. Choose QR code image file
4. Verify automatic decoding
5. Confirm patient details
6. Complete registration

**Expected Results:**
- [ ] File picker opens
- [ ] Image uploaded successfully
- [ ] QR code decoded from image
- [ ] Patient data populates
- [ ] Registration completes
- [ ] Success message displays

### Scenario 3: Patient Detail Verification

**Setup:**
1. Have QR code with intentionally incomplete/incorrect data
2. Camera or image ready for scanning

**Test Steps:**
1. Scan QR code
2. On verification screen, edit fields:
   - [ ] Edit name
   - [ ] Edit gender
   - [ ] Edit date of birth
   - [ ] Edit mobile number
3. Confirm changes
4. Register patient

**Expected Results:**
- [ ] All fields editable
- [ ] Changes persist through registration
- [ ] Updated data saved to database
- [ ] No validation errors on valid dates

### Scenario 4: Duplicate Patient Detection

**Setup:**
1. Register first patient with ABHA: "12-1234-5678-9012"
2. Prepare second QR code with same ABHA number

**Test Steps:**
1. Scan first QR code
2. Register patient successfully
3. Scan second QR code with same ABHA
4. Verify details match first patient
5. Change one field (e.g., name update)
6. Complete registration

**Expected Results:**
- [ ] System finds existing patient
- [ ] Details pre-populate from existing record
- [ ] Registration updates existing record (not duplicate)
- [ ] Patient ID remains same
- [ ] Updated timestamp reflects new registration

### Scenario 5: Invalid QR Codes

**Setup:**
1. Have invalid QR code (non-ABHA format)
2. QR code with missing required fields
3. Corrupted image file

**Test Steps:**
1. Attempt to scan invalid QR
2. Wait for error message
3. Click "Try Again"
4. Scan valid QR code

**Expected Results:**
- [ ] Invalid QR detection works
- [ ] Error message is user-friendly
- [ ] Can retry without page reload
- [ ] Valid QR after retry processes correctly

### Scenario 6: Multiple Registrations in Sequence

**Setup:**
1. Prepare 3 different ABHA QR codes
2. All with different patient data

**Test Steps:**
1. Register first patient
2. On success screen, click "Register Another Patient"
3. Repeat for second and third patients
4. Return to Patients list

**Expected Results:**
- [ ] First patient registers successfully
- [ ] Flow resets for next registration
- [ ] No data carries over between registrations
- [ ] All patients visible in Patients list
- [ ] Each has unique patient ID

### Scenario 7: Care Context Creation

**Setup:**
1. QR code without care context data
2. Have department/doctor information ready

**Test Steps:**
1. Scan QR code
2. Verify patient details
3. Check if care context created (optional in spec)
4. Register patient
5. Verify in database

**Expected Results:**
- [ ] Care context created with reference number
- [ ] Display name includes department/visit type
- [ ] Reference number format: OPD-YYYYMMDD-XXXX
- [ ] Care context linked to patient

### Scenario 8: Address Field Handling

**Setup:**
1. QR code with address data
2. QR code without address data

**Test Steps:**
1. Scan QR with address
2. Verify address populates as JSON
3. Register patient
4. Check database record
5. Scan QR without address
6. Register second patient

**Expected Results:**
- [ ] Address stored as JSONB
- [ ] Complex address objects handled
- [ ] Missing address handled gracefully
- [ ] Database queries work with JSONB

### Scenario 9: Database Verification

**Setup:**
1. Complete 3+ registrations
2. Access database directly

**Test Steps:**
1. Query emr_patients table
2. Verify fields populated:
   - id, name, mobile
   - abha_number, abha_address
   - dob, gender
   - is_abdm_linked (true)
   - abdm_linked_at (timestamp)
   - address (JSONB)
   - created_at (timestamp)
3. Query emr_care_contexts for linked records
4. Check audit logs for registration events

**Expected Results:**
- [ ] All fields populated correctly
- [ ] is_abdm_linked = true
- [ ] abdm_linked_at has valid timestamp
- [ ] Care contexts linked to correct patient
- [ ] Audit logs show registration events
- [ ] No missing required fields

### Scenario 10: Error Recovery

**Setup:**
1. Network disconnection capability
2. Server down scenario
3. Invalid token scenario

**Test Steps:**
1. Start registration
2. Simulate network error during registration
3. Observe error message
4. Retry registration

**Expected Results:**
- [ ] Network errors handled gracefully
- [ ] Error message is informative
- [ ] Retry functionality works
- [ ] No partial data saved on failure

## Performance Testing

### Test 1: QR Scanning Speed
- **Requirement**: Detect QR in < 3 seconds
- **Test**: Time from camera start to QR detection
- **Expected**: Consistent detection within requirement

### Test 2: Registration Speed
- **Requirement**: Complete registration < 5 seconds
- **Test**: Time from "Register" click to success screen
- **Expected**: Completes without timeout

### Test 3: Browser Memory
- **Requirement**: No memory leaks
- **Test**: Open/close AbhaQrScan 10 times
- **Expected**: Browser DevTools shows stable memory

## Browser Compatibility Testing

Test on:
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

**Specific Tests:**
- [ ] Camera access works on all browsers
- [ ] QR scanning responsive to touch
- [ ] File upload works properly
- [ ] Forms display correctly on mobile

## Security Testing

### Test 1: ABHA Data Handling
- [ ] ABHA numbers encrypted in transit (HTTPS)
- [ ] No ABHA data in browser console
- [ ] Local storage cleared after logout

### Test 2: Authentication
- [ ] Invalid token rejected
- [ ] Expired token redirects to login
- [ ] No access without authentication

### Test 3: Authorization
- [ ] Can only see own clinic's patients
- [ ] Cannot register for other clinics
- [ ] Audit logs track user who registered

## Integration Testing

### Test 1: Patients List Integration
- [ ] New patients appear in Patients list
- [ ] Search finds newly registered patients
- [ ] Can view patient details after registration

### Test 2: Care Context Integration
- [ ] Care contexts visible in patient detail
- [ ] Care context reference number formats correctly
- [ ] Multiple care contexts per patient works

### Test 3: Appointments Integration
- [ ] Can create appointment for newly registered patient
- [ ] Appointment uses ABHA information
- [ ] Patient history includes registration details

## Regression Testing

After implementing this feature, verify:
- [ ] Existing patient creation still works
- [ ] Patient list view unchanged
- [ ] Search functionality works
- [ ] Patient deletion works
- [ ] Care context management unchanged
- [ ] Existing ABHA flows not broken

## Test Data Generation

### Python Script for Test QR Codes
```python
import json
import qrcode

test_patients = [
    {
        "abhaNumber": "12-1234-5678-9012",
        "abhaAddress": "ramesh@sbx",
        "name": "Ramesh Kumar",
        "gender": "M",
        "dob": "1985-03-20",
        "mobile": "9876543210"
    },
    {
        "abhaNumber": "12-2345-6789-0123",
        "abhaAddress": "priya@sbx",
        "name": "Priya Sharma",
        "gender": "F",
        "dob": "1992-07-15",
        "mobile": "8765432109"
    }
]

for i, patient in enumerate(test_patients):
    qr_data = json.dumps(patient)
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr.make_image(fill_color="black", back_color="white").save(f"test_qr_{i+1}.png")
```

## Known Issues & Workarounds

### Issue: Camera Permission Denied
**Workaround**: Check browser settings, clear camera permissions, reload page

### Issue: QR Not Detected
**Workaround**: Increase lighting, improve QR code contrast, use image upload

### Issue: Data Not Populating
**Workaround**: Verify QR format matches expected JSON/pipe format

## Test Report Template

```markdown
# ABDM QR Registration - Test Report
Date: [Date]
Tester: [Name]
Build: [Version]

## Summary
- Total Tests: 10
- Passed: X
- Failed: Y
- Blocked: Z

## Critical Issues
[List critical blockers]

## Minor Issues
[List non-blocking issues]

## Recommendations
[List next steps]

## Sign-off
[Tester Signature & Date]
```

## Continuous Testing

### Automated Tests (Optional Future)
```javascript
describe('AbhaQrScan', () => {
  test('should render choice screen initially');
  test('should start camera on button click');
  test('should decode valid QR code');
  test('should handle invalid QR code');
  test('should submit registration');
});
```

## Support Contact

For issues during testing:
- Check backend logs: `journalctl -u infer-backend`
- Check frontend console: Browser DevTools
- Check database: `SELECT * FROM emr_patients WHERE is_abdm_linked = true`
