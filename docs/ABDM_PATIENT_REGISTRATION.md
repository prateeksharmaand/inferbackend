# ABDM Patient Registration via ABHA QR Code

## Overview

This feature allows hospital staff to quickly register patients by scanning their ABHA (Ayushman Bharat Health Account) QR codes. The system automatically retrieves and populates patient demographic information, reducing manual data entry and creating ABDM-linked patient profiles.

## Architecture

### Backend
- **Endpoint**: `POST /api/emr/patients/register-abha`
- **Controller**: `d:/Infer/backend/src/emr/emr.controller.js` → `registerAbhaPatient()`
- **Database**: `emr_patients` and `emr_care_contexts` tables

### Frontend
- **Component**: `d:/Infer/emr-web/src/pages/AbhaQrScan.jsx`
- **Route**: `/opd/abha-qr-scan`
- **QR Library**: `jsqr` (npm package for QR decoding)

## Components

### 1. Backend Implementation

#### registerAbhaPatient() Function
Located in `emr.controller.js` (lines 349-426)

**Functionality:**
- Accepts ABHA patient data from frontend
- Checks for existing patient by ABHA number or address
- Updates existing patient or creates new patient record
- Optionally creates care context if encounter details provided
- Marks patient as ABDM linked with timestamp
- Logs the registration event for audit trail

**Request Body:**
```json
{
  "abhaNumber": "12-5678-9012-3456",
  "abhaAddress": "john@abdm",
  "name": "John Doe",
  "gender": "M",
  "dob": "1990-05-15",
  "phoneNumber": "9876543210",
  "address": {
    "street": "123 Main St",
    "city": "New Delhi",
    "state": "Delhi",
    "pincode": "110001"
  },
  "department": "General",
  "doctor": "Dr. Smith",
  "visitType": "OPD"
}
```

**Response:**
```json
{
  "success": true,
  "patientId": 123,
  "patient": {
    "id": 123,
    "name": "John Doe",
    "mobile": "9876543210",
    "abha_number": "12-5678-9012-3456",
    "abha_address": "john@abdm",
    "dob": "1990-05-15",
    "gender": "M",
    "is_abdm_linked": true,
    "abdm_linked_at": "2026-06-12T12:00:00.000Z",
    "address": { ... },
    "created_at": "2026-06-12T12:00:00.000Z"
  },
  "careContextId": 456,
  "careContext": {
    "id": 456,
    "patient_id": 123,
    "reference_number": "OPD-20260612-0123",
    "display": "OPD Visit – General – 6/12/2026",
    "hi_type": "OPConsultation",
    "created_at": "2026-06-12T12:00:00.000Z"
  },
  "isNew": true
}
```

### 2. Frontend Implementation

#### AbhaQrScan Component
Located in `d:/Infer/emr-web/src/pages/AbhaQrScan.jsx`

**Features:**
- Multi-mode registration flow (choice → camera/upload → verify → success/error)
- Camera-based QR scanning with real-time video preview
- Image file upload for QR scanning
- QR data decoder supporting both JSON and pipe-delimited formats
- Patient detail verification and editing before registration
- Success/error feedback with registration details

**Modes:**
1. **choice**: User selects scanning method (camera or image upload)
2. **camera**: Live camera feed with QR scanning overlay
3. **upload**: File upload for QR image scanning
4. **verify**: Edit/confirm patient details before registration
5. **success**: Registration confirmation with patient ID and care context
6. **error**: Error message display with retry option

**QR Format Support:**
The component decodes QR codes in multiple formats:

```json
{
  "abhaNumber": "12-5678-9012-3456",
  "abhaAddress": "john@abdm",
  "name": "John Doe",
  "gender": "M",
  "dob": "1990-05-15",
  "mobile": "9876543210"
}
```

Or pipe-delimited:
```
12-5678-9012-3456|john@abdm|John Doe|M|1990-05-15|9876543210
```

#### Patients Page Integration
Updated `d:/Infer/emr-web/src/pages/Patients.jsx`

- Added "ABHA QR" button in header
- Button opens the AbhaQrScan page in a full-screen modal
- Integrated with existing patient list view
- Allows seamless return to patient list after registration

## User Flow

### Step 1: Access Registration
1. Open Patients page in EMR
2. Click "ABHA QR" button in header

### Step 2: Choose Scanning Method
- **Scan with Camera**: Uses device camera for real-time QR scanning
- **Upload QR Image**: Upload a pre-captured QR image file

### Step 3: Capture QR Code
**Camera Mode:**
- Position QR code in the scan box
- System automatically detects and decodes QR
- Screen shows live video preview with scanning overlay

**Upload Mode:**
- Select image file containing QR code
- System decodes QR from image
- Proceeds to verification

### Step 4: Verify Patient Details
- Review extracted patient information:
  - Name
  - ABHA Number
  - ABHA Address
  - Gender
  - Date of Birth
  - Mobile Number
- Edit any incorrect details if needed

### Step 5: Register Patient
1. Click "Confirm & Register"
2. System checks for duplicate ABHA registrations
3. Creates or updates patient record
4. Optionally creates care context for encounter
5. Displays success confirmation with:
   - Patient ID
   - Patient Name
   - ABHA Address
   - Care Context status

### Step 6: Return to Patient List
- Click "Register Another Patient" to scan another QR
- Or navigate back to Patients page

## Database Schema

### emr_patients Table
```sql
ALTER TABLE emr_patients
  ADD COLUMN IF NOT EXISTS address       JSONB,
  ADD COLUMN IF NOT EXISTS is_abdm_linked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS abdm_linked_at TIMESTAMPTZ;
```

**Key Fields:**
- `abha_number`: ABHA unique identifier (e.g., "12-5678-9012-3456")
- `abha_address`: ABHA address (e.g., "john@abdm")
- `is_abdm_linked`: Boolean flag indicating ABDM linkage
- `abdm_linked_at`: Timestamp of when patient was linked to ABDM
- `address`: JSONB column for structured address data

### emr_care_contexts Table
- `reference_number`: Unique care context reference
- `display`: Human-readable care context description
- `hi_type`: Type of health information (e.g., "OPConsultation")
- `patient_id`: Foreign key to emr_patients

## API Route

**Route Definition** (in `emr.routes.js`, line 84):
```javascript
router.post('/patients/register-abha', emr.registerAbhaPatient);
```

**Authentication**: Requires EMR JWT token (protected by `emrAuth` middleware)

**HTTP Method**: POST

**Content-Type**: application/json

## Dependencies

### Frontend
- `jsqr`: ^0.0.0 (QR code reading library)
- `react`: ^18.3.1 (UI framework)
- `react-router-dom`: ^6.23.1 (routing)
- `react-hot-toast`: ^2.6.0 (notifications)
- `lucide-react`: ^0.400.0 (icons)

### Backend
- PostgreSQL (database)
- Node.js Express (framework)
- winston (logging)

## Validation Rules

1. **Name**: Required field
2. **ABHA Number**: Optional, used for duplicate detection
3. **ABHA Address**: Optional, used for duplicate detection
4. **Gender**: Single character (M/F/O)
5. **DOB**: Valid date format (YYYY-MM-DD)
6. **Mobile**: Optional, 15 characters max
7. **Address**: Stored as JSONB object

## Error Handling

### Frontend Errors
- **Camera Access Denied**: "Camera access denied: [reason]"
- **No QR Found**: "No valid ABHA QR code found in image"
- **Invalid QR Format**: System attempts multiple decode formats
- **Registration Failed**: Shows API error message

### Backend Errors
- **Duplicate ABHA**: Returns existing patient (updates fields)
- **Invalid Input**: Returns 400 status with error message
- **Database Error**: Returns 500 status with error message

## Security Considerations

1. **Authentication**: Requires valid EMR JWT token
2. **Authorization**: Clinic staff can only register patients for their clinic
3. **Data Encryption**: ABHA identifiers should be encrypted at rest (via database encryption)
4. **Audit Logging**: All registrations logged with timestamp and user context
5. **ABDM Compliance**: Follows ABDM v3 specifications for data handling

## Testing

### Manual Testing Checklist
- [ ] Camera permissions granted and working
- [ ] QR scanning detects code in less than 3 seconds
- [ ] Image upload successfully decodes QR
- [ ] Patient details properly populated from QR
- [ ] Can edit details before confirmation
- [ ] Existing patient updates without duplicating
- [ ] Care context created correctly
- [ ] Success message displays with correct info
- [ ] Error messages display appropriately
- [ ] Can register multiple patients in sequence
- [ ] Database records created/updated correctly

### QR Code Test Data
Generate test ABHA QR codes with:
```json
{
  "abhaNumber": "12-5678-9012-3456",
  "abhaAddress": "patient@abdm",
  "name": "Test Patient",
  "gender": "M",
  "dob": "1990-01-15",
  "mobile": "9876543210"
}
```

## Deployment Notes

1. Install `jsqr` package: `npm install jsqr`
2. Run database migrations to add ABDM columns
3. Deploy updated frontend and backend
4. Test QR scanning with real ABHA QR codes
5. Monitor logs for registration events

## Future Enhancements

1. **Batch Registration**: Upload multiple QR codes
2. **Duplicate Detection**: Show warnings for similar names
3. **Auto-Linking**: Automatically create care contexts
4. **Export**: Download registration reports
5. **Template Support**: Pre-fill department/doctor info
6. **Offline Support**: Queue registrations when offline
7. **ABDM Integration**: Direct sync with ABDM gateway

## Support & Troubleshooting

### QR Code Won't Scan
- Ensure adequate lighting
- Keep QR code within frame
- Use clear QR code image (high contrast)
- Try uploading image instead of camera

### Duplicate Patient Warning
- Check existing patients list
- Patient may already be registered with different spelling
- Verify ABHA number and address

### Registration Timeout
- Check network connectivity
- Verify backend API is running
- Check browser console for errors

## References

- ABDM Official Documentation: https://abdm.gov.in
- ABHA QR Code Format: ABDM Specifications v3
- jsQR Library: https://github.com/cozmo/jsQR
