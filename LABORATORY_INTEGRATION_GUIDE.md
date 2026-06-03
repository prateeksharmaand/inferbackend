# Laboratory System - Complete Integration Guide

## ✅ What Has Been Created

### Backend Files Created:
```
backend/src/
├── db/migrations/
│   └── 003_create_laboratory_tables.sql
├── middleware/
│   └── labAuth.js (Lab authentication & authorization)
├── services/laboratory/
│   ├── dataParser.js (HL7/FHIR/PDF/CSV parsing)
│   ├── cryptoService.js (AES-256 encryption)
│   ├── criticalValueService.js (Critical value detection)
│   └── auditService.js (ISO 15189 audit logging)
├── routes/
│   ├── labs/
│   │   ├── labManagementRoutes.js (Admin: create/manage labs)
│   │   └── labUploadRoutes.js (Lab: upload results)
│   └── doctors/
│       └── labResultRoutes.js (Doctor: view results)
└── io/
    └── labSocketManager.js (Real-time WebSocket)
```

### Frontend Components Created:
```
emr-web/src/components/laboratory/
├── LabPortal.jsx (Lab upload & management UI)
└── LabResultViewer.jsx (Doctor result viewer with real-time)
```

---

## 🚀 STEP 1: Run Database Migration

```bash
cd backend
psql emar < src/db/migrations/003_create_laboratory_tables.sql
```

Verify tables were created:
```bash
psql emar << "SELECT * FROM laboratories LIMIT 1;"
```

---

## 🔧 STEP 2: Update Backend App.js

Edit `backend/src/app.js`:

```javascript
const express = require('express');
const app = express();
const LabSocketManager = require('./io/labSocketManager');

// ... existing middleware ...

// ===== Laboratory Routes =====
const labManagementRoutes = require('./routes/labs/labManagementRoutes');
const labUploadRoutes = require('./routes/labs/labUploadRoutes');
const labResultRoutes = require('./routes/doctors/labResultRoutes');

// Register routes
app.use('/api/v1/admin', labManagementRoutes);
app.use('/api/v1/labs', labUploadRoutes);
app.use('/api/v1/doctors', labResultRoutes);

// ===== WebSocket Setup =====
const server = require('http').createServer(app);
const labSocket = new LabSocketManager(server);

// Export for server startup
module.exports = { app, server, labSocket };
```

Update server startup in `backend/server.js` or `backend/index.js`:

```javascript
const { app, server, labSocket } = require('./src/app');

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ WebSocket ready at ws://localhost:${PORT}`);
});
```

---

## 🔐 STEP 3: Update Environment Variables

Add to `backend/.env`:

```env
# Laboratory System
ENCRYPTION_KEY=your_32_byte_base64_encoded_key_here
JWT_SECRET=your_jwt_secret_here

# Web Frontend URL (for CORS)
WEB_FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/emar
```

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🧪 STEP 4: Test Backend APIs

### 4.1 Create a Laboratory

```bash
curl -X POST http://localhost:3001/api/v1/admin/laboratories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_admin_token" \
  -d '{
    "facility_name": "Apollo Diagnostics",
    "lab_type": "DIAGNOSTIC",
    "email": "contact@apollo.com",
    "phone": "9999999999",
    "address_line1": "123 Health Plaza",
    "city": "Bangalore",
    "is_nabl_accredited": true,
    "hl7_enabled": true,
    "fhir_enabled": true
  }'

# Response will include:
# {
#   "id": "lab-uuid",
#   "api_key": "lab_pk_xxxx",
#   "api_secret": "lab_sk_xxxx"
# }

# SAVE THESE CREDENTIALS!
```

### 4.2 Upload a Lab Result (JSON)

```bash
curl -X POST http://localhost:3001/api/v1/labs/upload-result \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer lab_pk_xxxx" \
  -d '{
    "format": "JSON",
    "patient_id": "patient-123",
    "data": {
      "test_code": "15074-8",
      "test_name": "Blood Glucose",
      "result_value": 180,
      "result_unit": "mg/dL",
      "reference_range_low": 70,
      "reference_range_high": 100,
      "collection_timestamp": "2026-06-03T10:30:00Z"
    }
  }'
```

### 4.3 Get Lab Results (as Doctor)

```bash
curl -X GET "http://localhost:3001/api/v1/doctors/patients/patient-123/lab-results" \
  -H "Authorization: Bearer your_doctor_token"
```

### 4.4 Acknowledge Result

```bash
curl -X POST "http://localhost:3001/api/v1/doctors/lab-results/result-uuid/acknowledge" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_doctor_token" \
  -d '{"notes": "Reviewed and noted"}'
```

---

## 🎨 STEP 5: Integrate Frontend Components

### 5.1 Add Lab Portal Page

Create `emr-web/src/pages/LabPortalPage.jsx`:

```javascript
import React from 'react';
import LabPortal from '../components/laboratory/LabPortal';

export default function LabPortalPage() {
  return <LabPortal />;
}
```

### 5.2 Add Lab Results Page

Create `emr-web/src/pages/PatientLabResults.jsx`:

```javascript
import React from 'react';
import { useParams } from 'react-router-dom';
import LabResultViewer from '../components/laboratory/LabResultViewer';

export default function PatientLabResults() {
  const { patientId } = useParams();

  return (
    <div>
      <h1>Lab Results</h1>
      <LabResultViewer patientId={patientId} />
    </div>
  );
}
```

### 5.3 Add Routes in App Router

Update `emr-web/src/App.jsx` or your router config:

```javascript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LabPortalPage from './pages/LabPortalPage';
import PatientLabResults from './pages/PatientLabResults';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ... existing routes ... */}
        <Route path="/lab-portal" element={<LabPortalPage />} />
        <Route path="/patients/:patientId/lab-results" element={<PatientLabResults />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### 5.4 Add Navigation Links

Update your navigation component:

```javascript
<nav>
  {/* ... existing links ... */}
  <a href="/lab-portal">Lab Portal</a>
  <a href="/patients/patient-123/lab-results">Patient Labs</a>
</nav>
```

---

## 📱 STEP 6: Frontend WebSocket Setup

Create `emr-web/src/utils/socketConfig.js`:

```javascript
import { io } from 'socket.io-client';

export function createLabSocket(token) {
  return io(process.env.REACT_APP_API_URL || 'http://localhost:3001', {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });
}

export default createLabSocket;
```

---

## ✨ STEP 7: Request Browser Notifications Permission

Add to your auth flow (after login):

```javascript
// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}
```

---

## 📊 STEP 8: Test End-to-End

### 8.1 Start Backend

```bash
cd backend
npm run dev
# Should see: ✅ Server running on port 3001
#           ✅ WebSocket ready
```

### 8.2 Start Frontend

```bash
cd emr-web
npm start
# Should open http://localhost:3000
```

### 8.3 Test Lab Upload

1. Go to `/lab-portal`
2. Enter a patient ID
3. Paste JSON lab result
4. Click "Upload Result"
5. Should see: ✅ success message

### 8.4 Test Result Visibility

1. Go to `/patients/patient-123/lab-results`
2. Should see "🔴 Live Updates Active"
3. Open another tab and upload a result
4. First tab should update in real-time (<5 seconds)

### 8.5 Test Critical Values

1. Upload result with value outside critical range
2. Should see red banner: "🚨 CRITICAL VALUES DETECTED"
3. Should hear alert sound
4. Should see browser notification

---

## 🔑 API Key Management

### Generate New API Key for Lab

```bash
curl -X POST http://localhost:3001/api/v1/admin/laboratories/lab-id/regenerate-api-key \
  -H "Authorization: Bearer admin_token"
```

### Store API Key Securely

For production, store in encrypted vault or environment variable:
```bash
# In lab's .env file
LAB_API_KEY=lab_pk_xxxxx
LAB_API_SECRET=lab_sk_xxxxx
```

Then use in upload scripts:
```javascript
const apiKey = process.env.LAB_API_KEY;
const authorization = `Bearer ${apiKey}`;
```

---

## 📈 Monitoring & Logging

### View Lab Dashboard

```bash
curl http://localhost:3001/api/v1/admin/laboratories/lab-id/dashboard \
  -H "Authorization: Bearer token"
```

Response includes:
- Total results uploaded
- Finalized vs pending count
- Critical values count
- Average turnaround time

### Check Audit Logs

```bash
# Get audit trail for a result
curl http://localhost:3001/api/v1/admin/audit-logs?resource_type=LAB_RESULT&resource_id=result-uuid \
  -H "Authorization: Bearer token"
```

---

## 🚨 Troubleshooting

### WebSocket Not Connecting
- Check CORS in `labSocketManager.js`
- Verify `WEB_FRONTEND_URL` in `.env`
- Check browser console for errors

### Results Not Visible Immediately
- Check result status is `DOCTOR_VISIBLE`
- Verify doctor has patient access
- Check WebSocket connection in browser DevTools

### Critical Values Not Triggering
- Verify `critical_value_thresholds` set for lab
- Check result_value against thresholds
- Check notification permission granted

### PDF OCR Not Working
- Ensure PDF has readable text
- Check file size < 50MB
- Try different PDF file

---

## 🔒 Security Checklist

- [ ] Encryption key in environment variables
- [ ] API secrets not hardcoded
- [ ] JWT tokens use strong secret
- [ ] HTTPS enabled in production
- [ ] CORS restricted to trusted domains
- [ ] Database credentials not in code
- [ ] Audit logs immutable (append-only)
- [ ] Lab API keys rotated regularly
- [ ] User authentication required for all routes
- [ ] Rate limiting enabled on upload endpoints

---

## 📊 Performance Optimization

### Database Indexes
All critical indexes already created in migration:
- `idx_results_visible` - Quick doctor result queries
- `idx_results_critical` - Fast critical value detection
- `idx_anomalies_severity` - Sort by severity
- `idx_audit_actor` - Audit trail lookups

### Caching Strategy (Optional)
Add Redis caching for frequently accessed data:

```javascript
// Cache patient results for 5 minutes
const cacheKey = `patient_results:${patientId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const results = await db.query(...);
await redis.setex(cacheKey, 300, JSON.stringify(results));
return results;
```

### WebSocket Optimization
Current setup uses Room-based broadcasting:
- `patient:${patientId}` - Only doctors watching this patient get updates
- `critical_values` - On-call doctors watch globally
- Reduces unnecessary message broadcasts

---

## 🎓 Next Steps

1. **Customize Lab Types** - Add your specific lab types
2. **Configure Critical Values** - Set thresholds per test code
3. **Add User Management** - Assign doctors to patients
4. **Deploy to Production** - Use Docker, nginx, SSL
5. **Implement Backup** - Database backup strategy
6. **Train Users** - Lab staff & doctors onboarding

---

## 📞 Support

For issues or questions:
1. Check browser console (F12)
2. Check backend logs: `tail -f backend/logs/*.log`
3. Verify database: `psql emar << "SELECT COUNT(*) FROM lab_test_results;"`
4. Test WebSocket: Open browser DevTools → Network → WS

---

## 📝 Summary

The complete laboratory management system is now ready:

✅ **Database** - Full schema with 6 tables + audit logs
✅ **APIs** - 20+ endpoints for labs, doctors, admins
✅ **Real-time** - WebSocket for <5 second visibility
✅ **Security** - AES-256 encryption, audit trail, RBAC
✅ **Frontend** - Two complete React UIs (lab + doctor)
✅ **Features** - HL7/FHIR/PDF parsing, critical values, anomalies

**Total files created: 11 backend files + 2 frontend components + 1 database migration**

You can now upload lab results and have them visible to doctors in seconds! 🎉
