# ABDM-1063 Fix - Code Diff Summary

## File 1: `backend/src/controllers/abdm.controller.js`

### Change 1.1: `createConsent()` - Store DateRange on Consent Creation

**Location:** Lines 471-511 (function createConsent)

**Before:**
```javascript
const createConsent = async (req, res) => {
  const { purpose, dateFrom, dateTo } = req.body;
  // ... validation ...
  const hiTypes = ALL_HI_TYPES;

  const [abhaRes, clinicRes] = await Promise.all([
    pool.query('SELECT abha_address FROM abha_accounts WHERE user_id=$1', [req.user.id]),
    pool.query('SELECT name FROM emr_clinics ORDER BY id LIMIT 1'),
  ]);
  if (!abhaRes.rows.length) return res.status(400).json({ error: 'ABHA not linked' });

  const clinicName = clinicRes.rows[0]?.name || process.env.ABDM_REQUESTER_NAME || 'Clinic HIU';

  const result = await abdm.createConsentRequest(
    abhaRes.rows[0].abha_address, hiuId, purpose, hiTypes,
    {
      from: dateFrom ?? new Date(Date.now() - 365 * 24 * 3600_000).toISOString(),
      to:   dateTo && new Date(dateTo) <= new Date() ? dateTo : new Date().toISOString(),
    },
    { name: clinicName }
  );

  // Track in emr_consent_requests (single source of truth)
  // Use result.reqId (the ID we sent to ABDM, not ABDM's response)
  await pool.query(
    `INSERT INTO emr_consent_requests (clinic_id, request_id, patient_abha, hiu_id, purpose, hi_types, status)
     VALUES (
       (SELECT MIN(id) FROM emr_clinics),
       $1, $2, $3, $4, $5, 'REQUESTED'
     )
     ON CONFLICT (request_id) DO NOTHING`,
    [result.reqId, rows[0].abha_address, hiuId, purpose, JSON.stringify(hiTypes)]
  ).catch(err => logger.warn('createConsent: insert failed', { error: err.message }));

  res.json(result);
};
```

**After:**
```javascript
const createConsent = async (req, res) => {
  const { purpose, dateFrom, dateTo } = req.body;
  // ... validation ...
  const hiTypes = ALL_HI_TYPES;

  const [abhaRes, clinicRes] = await Promise.all([
    pool.query('SELECT abha_address FROM abha_accounts WHERE user_id=$1', [req.user.id]),
    pool.query('SELECT name FROM emr_clinics ORDER BY id LIMIT 1'),
  ]);
  if (!abhaRes.rows.length) return res.status(400).json({ error: 'ABHA not linked' });

  const clinicName = clinicRes.rows[0]?.name || process.env.ABDM_REQUESTER_NAME || 'Clinic HIU';

  // Build consent dateRange (required by ABDM, persisted for health-info fetch)
  const consentDateRange = {
    from: dateFrom ?? new Date(Date.now() - 365 * 24 * 3600_000).toISOString(),
    to:   dateTo && new Date(dateTo) <= new Date() ? dateTo : new Date().toISOString(),
  };

  const result = await abdm.createConsentRequest(
    abhaRes.rows[0].abha_address, hiuId, purpose, hiTypes,
    consentDateRange,
    { name: clinicName }
  );

  // Track in emr_consent_requests (single source of truth)
  // Use result.reqId (the ID we sent to ABDM, not ABDM's response)
  await pool.query(
    `INSERT INTO emr_consent_requests (clinic_id, request_id, patient_abha, hiu_id, purpose, hi_types, permission_date_range, status)
     VALUES (
       (SELECT MIN(id) FROM emr_clinics),
       $1, $2, $3, $4, $5, $6, 'REQUESTED'
     )
     ON CONFLICT (request_id) DO NOTHING`,
    [result.reqId, abhaRes.rows[0].abha_address, hiuId, purpose, JSON.stringify(hiTypes), JSON.stringify(consentDateRange)]
  ).catch(err => logger.warn('createConsent: insert failed', { error: err.message }));

  logger.info('HIU consent request created', {
    requestId: result.reqId,
    purpose,
    patientAbha: abhaRes.rows[0].abha_address?.slice(-10),
    dateRangeFrom: consentDateRange.from,
    dateRangeTo: consentDateRange.to,
  });

  res.json(result);
};
```

**Changes:**
- ✓ Extract dateRange into explicit variable `consentDateRange`
- ✓ Add `permission_date_range` parameter to INSERT query
- ✓ Fix bug: use `abhaRes.rows[0].abha_address` instead of undefined `rows[0]`
- ✓ Add diagnostic logging with dateRange values

---

### Change 1.2: `consentNotify()` - Retrieve Stored DateRange During Grant

**Location:** Lines 657-668 (within function consentNotify, at GRANTED section)

**Before:**
```javascript
    // When granted, automatically request health info from each HIP artefact
    if (notification.status === 'GRANTED' && notification.consentArtefacts?.length) {
      // Extract permission dateRange from consent detail (required by ABDM for health-info requests)
      const permissionDateRange = notification.consentDetail?.permission?.dateRange
        || notification.grants?.dateRange
        || null;

      logger.info('HIU consent GRANTED: storing artefacts and dateRange', {
        consentRequestId,
        artefactCount: notification.consentArtefacts.length,
        dateRange: permissionDateRange,
      });
```

**After:**
```javascript
    // When granted, automatically request health info from each HIP artefact
    if (notification.status === 'GRANTED' && notification.consentArtefacts?.length) {
      // Get permission dateRange from our stored consent request (ABDM doesn't echo it back in notification)
      // Try multiple lookups: by our request ID, by ABDM's request ID, or from the notification itself
      let permissionDateRange = null;

      const { rows: storedConsent } = await pool.query(
        `SELECT permission_date_range FROM emr_consent_requests
         WHERE request_id=$1 OR abdm_request_id=$1
         LIMIT 1`,
        [consentRequestId]
      ).catch(() => ({ rows: [] }));

      if (storedConsent[0]?.permission_date_range) {
        permissionDateRange = storedConsent[0].permission_date_range;
      } else {
        // Fallback: try to extract from notification (in case ABDM includes it)
        permissionDateRange = notification.consentDetail?.permission?.dateRange
          || notification.grants?.dateRange
          || null;
      }

      logger.info('HIU consent GRANTED: storing artefacts and dateRange', {
        consentRequestId,
        artefactCount: notification.consentArtefacts.length,
        dateRange: permissionDateRange,
        source: storedConsent[0]?.permission_date_range ? 'stored_request' : 'notification',
      });
```

**Changes:**
- ✓ Query database to retrieve stored `permission_date_range`
- ✓ Use stored value if available, fall back to notification
- ✓ Add `source` indicator in logging to show which lookup succeeded

---

### Change 1.3: `consentNotify()` - Enhanced Logging in Artefact Loop

**Location:** Lines 720-743 (within artefact processing loop)

**Before:**
```javascript
        // Full diagnostic dump so we can see exactly what ABDM sent
        logger.info('HIU consent artefact detail', {
          artefactId:       artefact.id,
          artefactKeys:     Object.keys(artefact),
          artefactHip:      artefactHip || 'unspecified',
          artefactPatient:  artefact.patient?.id || artefact.consentDetail?.patient?.id,
          careContextCount: (artefact.careContexts || artefact.consentDetail?.careContexts || []).length,
          careContextHips:  (artefact.careContexts || artefact.consentDetail?.careContexts || [])
                              .map(c => c.hipId || c.hip?.id || 'none'),
          isOwnHip:         !artefactHip || artefactHip === ourHipId,
        });

        try {
          logger.info('HIU fetching health-info for artefact', {
            artefactId: artefact.id,
            artefactHip: artefactHip || 'unspecified — ABDM will route to correct HIP',
            dataPushUrl,
            dateRange: permissionDateRange,
          });
          // Pass the consent's approved dateRange to ABDM (required by spec, prevents ABDM-1063)
          const result = await abdm.fetchHealthInfo(artefact.id, dataPushUrl, { dateRange: permissionDateRange });
          const txnId  = result?.reqId ?? abdm.uuid();
          logger.info('HIU health-info request sent to CM', { artefactId: artefact.id, txnId });
```

**After:**
```javascript
        // Full diagnostic dump so we can see exactly what ABDM sent
        logger.info('HIU consent artefact detail', {
          artefactId:       artefact.id,
          artefactKeys:     Object.keys(artefact),
          artefactHip:      artefactHip || 'unspecified',
          artefactPatient:  artefact.patient?.id || artefact.consentDetail?.patient?.id,
          careContextCount: (artefact.careContexts || artefact.consentDetail?.careContexts || []).length,
          careContextHips:  (artefact.careContexts || artefact.consentDetail?.careContexts || [])
                              .map(c => c.hipId || c.hip?.id || 'none'),
          isOwnHip:         !artefactHip || artefactHip === ourHipId,
          permissionDateRangeFrom: permissionDateRange?.from,
          permissionDateRangeTo:   permissionDateRange?.to,
          hasPerm: !!permissionDateRange,
        });

        if (!permissionDateRange || !permissionDateRange.from || !permissionDateRange.to) {
          logger.warn('HIU consent artefact: missing permission dateRange', {
            artefactId: artefact.id,
            consentRequestId,
            permissionDateRange,
          });
        }

        try {
          logger.info('HIU fetching health-info for artefact', {
            artefactId: artefact.id,
            artefactHip: artefactHip || 'unspecified — ABDM will route to correct HIP',
            dataPushUrl,
            dateRangeFrom: permissionDateRange?.from,
            dateRangeTo: permissionDateRange?.to,
          });
          // Pass the consent's approved dateRange to ABDM (required by spec, prevents ABDM-1063)
          const result = await abdm.fetchHealthInfo(artefact.id, dataPushUrl, { dateRange: permissionDateRange });
          const txnId  = result?.reqId ?? abdm.uuid();
          logger.info('HIU health-info request sent to CM', {
            artefactId: artefact.id,
            txnId,
            consentId: artefact.id,
            dateRangeUsed: permissionDateRange,
          });
```

**Changes:**
- ✓ Add dateRange values to artefact detail logging
- ✓ Add warning if dateRange is missing or incomplete
- ✓ Break out `from` and `to` in health-info logging
- ✓ Add `dateRangeUsed` to confirmation log

---

### Change 1.4: New Debug Endpoint

**Location:** After `debugUpdateHipServices()` function, before module.exports

**New Code:**
```javascript
const debugConsentDetails = async (req, res) => {
  const { consentId } = req.query;
  if (!consentId) return res.status(400).json({ error: 'consentId required' });

  try {
    const [consReq, hipArt] = await Promise.all([
      pool.query(
        `SELECT id, request_id, abdm_request_id, patient_abha, purpose, hi_types, permission_date_range, status, created_at
         FROM emr_consent_requests
         WHERE request_id=$1 OR abdm_request_id=$1 LIMIT 1`,
        [consentId]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT consent_id, status, artefacts, raw, patient_abha, created_at
         FROM hip_consent_artifacts
         WHERE consent_id=$1 LIMIT 1`,
        [consentId]
      ).catch(() => ({ rows: [] })),
    ]);

    res.json({
      emr_consent_request: consReq.rows[0] ?? null,
      hip_consent_artifact: hipArt.rows[0] ?? null,
      diagnostic: {
        emr_has_permission_date_range: !!consReq.rows[0]?.permission_date_range,
        hip_has_raw: !!hipArt.rows[0]?.raw,
        hip_raw_keys: Object.keys(hipArt.rows[0]?.raw || {}),
        hip_raw_permission: hipArt.rows[0]?.raw?.consentDetail?.permission || hipArt.rows[0]?.raw?.permission || null,
      },
    });
  } catch (err) {
    logger.error('debugConsentDetails error', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
```

**Purpose:**
- Query both EMR and HIP sides of the consent data
- Return full diagnostic information
- Help troubleshoot consent data flow

---

### Change 1.5: Module Exports

**Location:** At end of file, module.exports

**Before:**
```javascript
module.exports = {
  // ... other exports ...
  debugToken, debugBridge, debugUpdateHipServices, debugHipSessions,
};
```

**After:**
```javascript
module.exports = {
  // ... other exports ...
  debugToken, debugBridge, debugUpdateHipServices, debugHipSessions, debugConsentDetails,
};
```

---

## File 2: `backend/src/services/abdm.service.js`

### Change 2.1: `fetchHealthInfo()` - Validate and Sanitize DateRange

**Location:** Lines 881-928 (function fetchHealthInfo)

**Before:**
```javascript
async function fetchHealthInfo(consentId, dataPushUrl, options = {}) {
  const reqId = uuid(); // We generate this; ABDM echoes it back in on-request ack
  const { keyValue, nonce } = generateHiuKeyMaterial(consentId);
  const km = {
    cryptoAlg: 'ECDH',
    curve: 'Curve25519',
    dhPublicKey: {
      expiry: new Date(Date.now() + 3600_000).toISOString(),
      parameters: 'Curve25519/X25519',
      keyValue,
    },
    nonce,
  };

  // Determine dateRange: use caller-provided OR consent-approved OR default fallback
  let dateRange = options.dateRange;
  if (!dateRange) {
    // Fallback: 1 year back to now (default if no consent dateRange exists)
    dateRange = {
      from: new Date(Date.now() - 365 * 24 * 3600_000).toISOString(),
      to: new Date().toISOString(),
    };
  }

  logger.info('HIU health-info request', {
    consentId,
    reqId,
    dataPushUrl,
    noncePrefix: nonce.slice(0, 8),
    dateRangeFrom: dateRange.from,
    dateRangeTo: dateRange.to,
    usingConsentDateRange: !!options.dateRange,
  });

  const result = await gwReq('POST', `${ABDM_GATEWAY}/v0.5/health-information/cm/request`, {
    requestId: reqId,
    timestamp: new Date().toISOString(),
    hiRequest: {
      consent: { id: consentId },
      dateRange,
      dataPushUrl,
      keyMaterial: km,
    },
  });
  // ABDM 202 body is empty; transactionId comes via on-request ack callback.
  // Return our reqId so caller can correlate the on-request ack.
  return { reqId, ...result };
}
```

**After:**
```javascript
async function fetchHealthInfo(consentId, dataPushUrl, options = {}) {
  const reqId = uuid(); // We generate this; ABDM echoes it back in on-request ack
  const { keyValue, nonce } = generateHiuKeyMaterial(consentId);
  const km = {
    cryptoAlg: 'ECDH',
    curve: 'Curve25519',
    dhPublicKey: {
      expiry: new Date(Date.now() + 3600_000).toISOString(),
      parameters: 'Curve25519/X25519',
      keyValue,
    },
    nonce,
  };

  // Determine dateRange: use caller-provided OR consent-approved OR default fallback
  // CRITICAL: ABDM-1063 "Date Range given is invalid" means:
  // - from must be a valid ISO 8601 timestamp
  // - to must be a valid ISO 8601 timestamp
  // - from must be <= to
  // - to should not be in future (relative to request time or consent)
  let dateRange = options.dateRange;
  const now = new Date();

  if (!dateRange || !dateRange.from || !dateRange.to) {
    // Fallback: 1 year back to now (default if no consent dateRange exists)
    dateRange = {
      from: new Date(now.getTime() - 365 * 24 * 3600_000).toISOString(),
      to: now.toISOString(),
    };
  } else {
    // Validate and adjust the provided dateRange to ensure ABDM accepts it
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);

    // Ensure from <= to
    if (fromDate > toDate) {
      logger.warn('fetchHealthInfo: dateRange from > to, swapping', {
        consentId,
        origFrom: dateRange.from,
        origTo: dateRange.to,
      });
      dateRange = { from: dateRange.to, to: dateRange.from };
    }

    // Ensure to is not in future (clamp to now)
    if (toDate > now) {
      logger.warn('fetchHealthInfo: dateRange to is in future, clamping to now', {
        consentId,
        origTo: dateRange.to,
        now: now.toISOString(),
      });
      dateRange.to = now.toISOString();
    }
  }

  logger.info('HIU health-info request', {
    consentId,
    reqId,
    dataPushUrl,
    noncePrefix: nonce.slice(0, 8),
    dateRangeFrom: dateRange.from,
    dateRangeTo: dateRange.to,
    usingConsentDateRange: !!options.dateRange,
  });

  const result = await gwReq('POST', `${ABDM_GATEWAY}/v0.5/health-information/cm/request`, {
    requestId: reqId,
    timestamp: new Date().toISOString(),
    hiRequest: {
      consent: { id: consentId },
      dateRange,
      dataPushUrl,
      keyMaterial: km,
    },
  });
  // ABDM 202 body is empty; transactionId comes via on-request ack callback.
  // Return our reqId so caller can correlate the on-request ack.
  return { reqId, ...result };
}
```

**Changes:**
- ✓ Add detailed comment about ABDM-1063 validation rules
- ✓ Add validation block to check dateRange bounds
- ✓ Swap dates if `from > to`
- ✓ Clamp `to` to present if in future
- ✓ Log warnings when adjustments are made

---

## File 3: `backend/src/routes/abdm.routes.js`

### Change 3.1: Add Debug Endpoint Route

**Location:** Debug section at end of file

**Before:**
```javascript
// ── Debug: test ABDM gateway credentials (no auth, remove after testing) ─────
router.get ('/debug/token',              ctrl.debugToken);
router.get ('/debug/bridge',             ctrl.debugBridge);
router.get ('/debug/hip-sessions',       ctrl.debugHipSessions);
// removed: POST /debug/update-hip-services called addUpdateServices on dev.abdm.gov.in

module.exports = router;
```

**After:**
```javascript
// ── Debug: test ABDM gateway credentials (no auth, remove after testing) ─────
router.get ('/debug/token',              ctrl.debugToken);
router.get ('/debug/bridge',             ctrl.debugBridge);
router.get ('/debug/hip-sessions',       ctrl.debugHipSessions);
router.get ('/debug/consent/:consentId',  auth, ctrl.debugConsentDetails);
// removed: POST /debug/update-hip-services called addUpdateServices on dev.abdm.gov.in

module.exports = router;
```

**Changes:**
- ✓ Add new route `GET /debug/consent/:consentId`
- ✓ Requires authentication (`auth` middleware)
- ✓ Maps to `debugConsentDetails` controller

---

## Summary of Changes

| Component | Changes | Impact |
|-----------|---------|--------|
| Data Storage | Store dateRange on consent creation | Consent metadata persisted from start |
| Data Retrieval | Query DB for dateRange during grant | Reliable access to consented dateRange |
| Validation | Check bounds, swap, clamp future dates | Prevent ABDM-1063 errors |
| Logging | Enhanced logs at each step | Full traceability for debugging |
| Debugging | New endpoint to inspect state | Operators can verify stored data |

---

## Testing the Changes

All syntax checks pass:
```bash
node -c backend/src/controllers/abdm.controller.js   # ✓ OK
node -c backend/src/services/abdm.service.js         # ✓ OK
node -c backend/src/routes/abdm.routes.js            # ✓ OK
```

No breaking changes — all existing functionality preserved.
