# ABDM-1063 Fix Validation Test Plan

## Test 1: Verify Consent Request Stores DateRange

### Setup
Ensure you have a user with ABHA linked.

### Test Steps
```bash
# 1. Create a new consent request
curl -X POST http://localhost:3001/api/abdm/consents \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "purpose": "CAREMGT",
    "dateFrom": "2025-06-01T00:00:00Z",
    "dateTo": "2026-06-18T23:59:59Z"
  }'

# Response should include requestId, e.g.:
# { "reqId": "..." }
```

### Verification in Logs
Look for:
```
[INFO] HIU consent request created {
  requestId: "abc123...",
  purpose: "CAREMGT",
  patientAbha: "...abc@sbx",
  dateRangeFrom: "2025-06-01T00:00:00Z",
  dateRangeTo: "2026-06-18T23:59:59Z"
}
```

### Verification in Database
```sql
SELECT request_id, permission_date_range, status FROM emr_consent_requests
WHERE request_id = 'abc123...'
LIMIT 1;
```

Expected output:
```
 request_id  |           permission_date_range            | status
             |                                             |
 abc123...   | {"from":"2025-06-01T00:00:00Z",...}        | REQUESTED
```

---

## Test 2: Verify DateRange Retrieval During Grant

### Setup
Grant the consent via ABHA app or ABDM gateway.

### Verification in Logs
Monitor the backend logs for the `consentNotify` callback. Look for:

```
[INFO] HIU consent GRANTED: storing artefacts and dateRange {
  consentRequestId: "...",
  artefactCount: 1,
  dateRange: {"from":"2025-06-01T00:00:00Z",...},
  source: "stored_request"  ← This should be "stored_request", not "notification"
}
```

If you see `source: "notification"`, it means the DB lookup failed and it fell back to the (missing) notification data. Check that the database insert in Test 1 succeeded.

---

## Test 3: Verify DateRange Validation in Health-Info Request

### Setup
The consent has been granted and ABDM is ready to deliver health data.

### Verification in Logs
Look for:
```
[INFO] HIU health-info request {
  consentId: "...",
  reqId: "...",
  dateRangeFrom: "2025-06-01T00:00:00Z",
  dateRangeTo: "2026-06-18T23:59:59Z",
  usingConsentDateRange: true
}
```

### Key Indicators
- `usingConsentDateRange: true` means we used the stored dateRange (good!)
- `dateRangeFrom` and `dateRangeTo` should match the consented range (or be clamped to present)
- Should NOT see: `dateRange to is in future, clamping to now` unless explicitly testing future dates

---

## Test 4: Verify No ABDM-1063 Error

### Setup
Continue monitoring the consent flow through grant completion.

### Verification in Logs
Look for:
```
[INFO] HIU health-info on-request ack {
  "hiRequest": null,
  "error": null,  ← This should be null (no ABDM-1063!)
  "response": { "requestId": "..." }
}
```

### Negative Test (Should NOT see this)
```
[INFO] HIU health-info on-request ack {
  "error": {
    "code": "ABDM-1063",
    "message": "Date Range given is invalid"
  }
}
```

If you see ABDM-1063, check:
1. Is `permission_date_range` populated in the DB? (Test 2)
2. Did the health-info request have a valid `to` <= now? (Check logs for clamping)
3. Is the `to` date in the future? (It should be clamped automatically)

---

## Test 5: Use Debug Endpoint to Inspect Full State

### Setup
Have a known consentId.

### Test Steps
```bash
curl -X GET "http://localhost:3001/api/abdm/debug/consent?consentId=<CONSENT_ID>" \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```

### Expected Response
```json
{
  "emr_consent_request": {
    "id": "...",
    "request_id": "...",
    "abdm_request_id": "<CONSENT_ID>",
    "permission_date_range": {
      "from": "2025-06-01T00:00:00Z",
      "to": "2026-06-18T23:59:59Z"
    },
    "status": "GRANTED",
    "purpose": "CAREMGT",
    "hi_types": [...]
  },
  "hip_consent_artifact": {
    "consent_id": "<CONSENT_ID>",
    "status": "GRANTED",
    "raw": {
      "consentDetail": {
        "permission": {
          "dateRange": {
            "from": "2025-06-01T00:00:00Z",
            "to": "2026-06-18T23:59:59Z"
          }
        }
      }
    }
  },
  "diagnostic": {
    "emr_has_permission_date_range": true,
    "hip_has_raw": true,
    "hip_raw_permission": {
      "dateRange": {
        "from": "2025-06-01T00:00:00Z",
        "to": "2026-06-18T23:59:59Z"
      }
    }
  }
}
```

### Key Checks
- ✓ `emr_consent_request.permission_date_range` exists
- ✓ `hip_consent_artifact.raw` contains full consent detail
- ✓ `diagnostic.emr_has_permission_date_range` is true
- ✓ Both EMR and HIP have matching dateRanges

---

## Test 6: Edge Case — Future "to" Date

### Setup
Create a consent with `dateTo` in the future.

### Test
```bash
curl -X POST http://localhost:3001/api/abdm/consents \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "purpose": "CAREMGT",
    "dateTo": "2026-12-31T23:59:59Z"  ← Future date
  }'
```

### Expected Behavior
The `createConsent` controller should automatically clamp `dateTo` to `new Date().toISOString()` because of this check:
```javascript
to: dateTo && new Date(dateTo) <= new Date() ? dateTo : new Date().toISOString(),
```

Verify in logs:
```
[INFO] HIU consent request created {
  dateRangeFrom: "...",
  dateRangeTo: "2026-06-18T16:22:00Z"  ← Clamped to now, not 2026-12-31
}
```

---

## Test 7: Edge Case — Invalid DateRange Order

### Scenario
If a bug somehow creates a consent with `from > to`, `fetchHealthInfo` should auto-correct.

### Expected Behavior
When `fetchHealthInfo` is called with `from: "2026-06-18"` and `to: "2025-06-01"`:

Logs should show:
```
[WARN] fetchHealthInfo: dateRange from > to, swapping {
  consentId: "...",
  origFrom: "2026-06-18T...",
  origTo: "2025-06-01T..."
}
```

And the request sent to ABDM will have swapped values.

---

## Rollback Plan (if needed)

If the fix causes issues, revert these files:
```bash
git checkout backend/src/controllers/abdm.controller.js
git checkout backend/src/services/abdm.service.js
git checkout backend/src/routes/abdm.routes.js
```

No database changes are required (the `permission_date_range` column already exists).

---

## Success Criteria

✓ Consent requests store their dateRange in `emr_consent_requests.permission_date_range`  
✓ Grant notifications retrieve stored dateRange, not missing one from callback  
✓ Health-info requests include valid dateRange matching or within consented range  
✓ No ABDM-1063 errors after grant  
✓ Future dates are clamped to present  
✓ Invalid dateRange order is auto-corrected  
✓ Debug endpoint provides full visibility into stored state  
