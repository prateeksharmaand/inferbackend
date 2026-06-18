# ABDM-1063 "Date Range given is invalid" - Investigation & Fix

## Root Cause Analysis

### The Problem
When HIU initiates consent grant with a dateRange and then fetches health information, ABDM returns HTTP 202 for the health-information request but immediately calls back with:
```json
{
  "hiRequest": null,
  "error": {
    "code": "ABDM-1063",
    "message": "Date Range given is invalid"
  }
}
```

### Why It Happened
The issue stems from a data flow gap in the consent lifecycle:

1. **Consent Request Creation** (HIU → ABDM)
   - HIU sends `permission.dateRange` with the consent request
   - Example: `{ from: "2025-06-18T16:09:04Z", to: "2026-06-18T16:09:04Z" }`

2. **Consent Grant Notification** (ABDM → HIU)
   - ABDM returns `on-consent/on-grant` callback
   - This notification includes ONLY: `consentId`, `status`, `consentArtefacts[{id}]`
   - **The notification does NOT echo back the permission.dateRange**

3. **Health Information Fetch** (HIU → ABDM CM)
   - HIU must send the health-information request with a dateRange
   - The code tried to extract dateRange from the notification (where it doesn't exist)
   - Falls back to `null` or a default "1 year back to now"
   - **This null or mismatched dateRange triggers ABDM-1063**

### Why ABDM Rejects It
ABDM validates that the dateRange in the health-information request:
- Must have valid `from` and `to` timestamps
- Must have `from <= to`
- Must match or be within the consented dateRange (OR be null for ABDM to use the consented range)
- Cannot have `to` in the future (relative to the consent or request)

When we send `null`, ABDM cannot determine which dateRange is valid for this consent, hence ABDM-1063.

---

## The Fix

### Changes Made

#### 1. **Store Permission DateRange on Consent Creation**
   File: `backend/src/controllers/abdm.controller.js` (createConsent)
   
   **Before:**
   ```javascript
   const result = await abdm.createConsentRequest(
     abhaRes.rows[0].abha_address, hiuId, purpose, hiTypes,
     {
       from: dateFrom ?? new Date(Date.now() - 365 * 24 * 3600_000).toISOString(),
       to:   dateTo && new Date(dateTo) <= new Date() ? dateTo : new Date().toISOString(),
     },
     { name: clinicName }
   );

   await pool.query(
     `INSERT INTO emr_consent_requests (clinic_id, request_id, patient_abha, hiu_id, purpose, hi_types, status)
      VALUES (...)`,
     [result.reqId, rows[0].abha_address, hiuId, purpose, JSON.stringify(hiTypes)]
   );
   ```

   **After:**
   ```javascript
   const consentDateRange = {
     from: dateFrom ?? new Date(Date.now() - 365 * 24 * 3600_000).toISOString(),
     to:   dateTo && new Date(dateTo) <= new Date() ? dateTo : new Date().toISOString(),
   };

   const result = await abdm.createConsentRequest(
     abhaRes.rows[0].abha_address, hiuId, purpose, hiTypes,
     consentDateRange,
     { name: clinicName }
   );

   await pool.query(
     `INSERT INTO emr_consent_requests 
      (clinic_id, request_id, patient_abha, hiu_id, purpose, hi_types, permission_date_range, status)
      VALUES (...)`,
     [..., JSON.stringify(consentDateRange)]
   );
   ```
   
   **Impact:** Consent dateRange is now persisted in the database from the start.

---

#### 2. **Retrieve Stored DateRange When Processing Grant Notification**
   File: `backend/src/controllers/abdm.controller.js` (consentNotify)
   
   **Before:**
   ```javascript
   const permissionDateRange = notification.consentDetail?.permission?.dateRange
     || notification.grants?.dateRange
     || null;
   ```

   **After:**
   ```javascript
   let permissionDateRange = null;

   const { rows: storedConsent } = await pool.query(
     `SELECT permission_date_range FROM emr_consent_requests
      WHERE request_id=$1 OR abdm_request_id=$1 LIMIT 1`,
     [consentRequestId]
   ).catch(() => ({ rows: [] }));

   if (storedConsent[0]?.permission_date_range) {
     permissionDateRange = storedConsent[0].permission_date_range;
   } else {
     permissionDateRange = notification.consentDetail?.permission?.dateRange
       || notification.grants?.dateRange
       || null;
   }
   ```
   
   **Impact:** We now use the dateRange we originally sent to ABDM, not the one (missing) from the callback.

---

#### 3. **Validate and Sanitize DateRange Before Sending to ABDM**
   File: `backend/src/services/abdm.service.js` (fetchHealthInfo)
   
   **Before:**
   ```javascript
   let dateRange = options.dateRange;
   if (!dateRange) {
     dateRange = {
       from: new Date(Date.now() - 365 * 24 * 3600_000).toISOString(),
       to: new Date().toISOString(),
     };
   }
   ```

   **After:**
   ```javascript
   let dateRange = options.dateRange;
   const now = new Date();

   if (!dateRange || !dateRange.from || !dateRange.to) {
     dateRange = {
       from: new Date(now.getTime() - 365 * 24 * 3600_000).toISOString(),
       to: now.toISOString(),
     };
   } else {
     const fromDate = new Date(dateRange.from);
     const toDate = new Date(dateRange.to);

     if (fromDate > toDate) {
       logger.warn('fetchHealthInfo: dateRange from > to, swapping', {...});
       dateRange = { from: dateRange.to, to: dateRange.from };
     }

     if (toDate > now) {
       logger.warn('fetchHealthInfo: dateRange to is in future, clamping to now', {...});
       dateRange.to = now.toISOString();
     }
   }
   ```
   
   **Impact:** We ensure the dateRange is always valid (from <= to, to <= now) before sending to ABDM.

---

#### 4. **Add Diagnostic Logging**
   - Log consent dateRange at creation time
   - Log permission extraction during grant notification with source indicator
   - Log final sanitized dateRange before health-info request
   - Add debug endpoint `/api/abdm/debug/consent/{consentId}` to inspect stored state
   
   **Impact:** Operators can now trace exactly which dateRange is stored, retrieved, and sent.

---

#### 5. **Add Debug Endpoint**
   New endpoint: `GET /api/abdm/debug/consent/:consentId?consentId=<id>`
   
   Returns:
   ```json
   {
     "emr_consent_request": {
       "id": "...",
       "request_id": "...",
       "permission_date_range": { "from": "...", "to": "..." },
       "status": "GRANTED",
       "...": "..."
     },
     "hip_consent_artifact": {
       "consent_id": "...",
       "raw": { "consentDetail": { "permission": { "dateRange": {...} } } },
       "...": "..."
     },
     "diagnostic": {
       "emr_has_permission_date_range": true,
       "hip_has_raw": true,
       "hip_raw_permission": { "dateRange": {...} }
     }
   }
   ```

---

## Validation & Testing

### Manual Test Steps

1. **Create a new consent request:**
   ```bash
   POST /api/abdm/consents
   Body: { "purpose": "CAREMGT", "dateFrom": "2025-06-01T00:00:00Z", "dateTo": "2026-06-18T23:59:59Z" }
   ```
   
   Expected log:
   ```
   HIU consent request created {
     requestId: "...",
     purpose: "CAREMGT",
     dateRangeFrom: "2025-06-01T00:00:00Z",
     dateRangeTo: "2026-06-18T23:59:59Z"
   }
   ```

2. **Grant consent** (via ABHA app or simulation)

3. **Inspect stored consent:**
   ```bash
   GET /api/abdm/debug/consent?consentId=<consentId>
   ```
   
   Verify:
   - `emr_consent_request.permission_date_range` is populated
   - `hip_consent_artifact.raw.consentDetail.permission.dateRange` exists

4. **Monitor logs for health-info request:**
   ```
   HIU health-info request {
     consentId: "...",
     dateRangeFrom: "2025-06-01T00:00:00Z",
     dateRangeTo: "2026-06-18T23:59:59Z",
     usingConsentDateRange: true
   }
   ```

5. **Monitor for on-request ack:**
   ```
   HIU health-info on-request ack {
     error: null,  // Should NOT have ABDM-1063
     response: { requestId: "..." }
   }
   ```

---

## Related Database Tables

- **emr_consent_requests:** Stores HIU consent requests (includes `permission_date_range` column)
- **hip_consent_artifacts:** Stores HIP-side consent notification payload (includes full `raw` JSON)
- **health_records:** Stores health data pushed by HIP

---

## Files Changed

1. `backend/src/controllers/abdm.controller.js`
   - createConsent: Store dateRange on creation
   - consentNotify: Retrieve dateRange from DB instead of notification
   - Diagnostic logging
   - New debug endpoint

2. `backend/src/services/abdm.service.js`
   - fetchHealthInfo: Validate and sanitize dateRange
   - Add logging for dateRange decisions

3. `backend/src/routes/abdm.routes.js`
   - Add route for debug endpoint

---

## Summary

**Root cause:** ABDM notification doesn't include the consented dateRange, but we need it for the health-information request.

**Solution:** Store the dateRange when we create the consent, retrieve it when processing the grant, and validate it before sending health-information request.

**Expected outcome:** No more ABDM-1063 errors when fetching health information after consent grant.
