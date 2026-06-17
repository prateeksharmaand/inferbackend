# ABDM Care Context Audit Report
**Date:** 2026-06-17  
**Auditor:** Claude Code (automated)  
**Codebase:** `d:\Infer\backend\src\`

---

## 1. Executive Summary

The ABDM Care Context implementation was partially compliant before this audit.  
Appointment creation correctly did **not** create a Care Context.  
Encounter completion **did** create a Care Context via an ON CONFLICT upsert.  
However, three compliance gaps were identified and remediated:

1. **QR Walk-in registration (`registerAbhaPatient`) was incorrectly creating a Care Context** at patient registration time if `department/doctor/visitType` fields were supplied — not at encounter completion.
2. **No ABDM HIP-initiated link call** was made after Care Context creation — the CC was inserted into the local DB but never pushed to the ABDM gateway (`hip/v3/link/carecontext`).
3. **No `link_status` / `linked_at` tracking** on `emr_care_contexts` — impossible to know which CCs were successfully acknowledged by ABDM vs. locally stored only.

All three gaps have been fixed.

---

## 2. Files Audited

| File | Purpose |
|---|---|
| `src/emr/emr.appointment.controller.js` | Appointment + encounter creation |
| `src/emr/emr.controller.js` | Patient management, manual CC endpoint, QR walk-in |
| `src/emr/hip.controller.js` | ABDM gateway callbacks (discovery, link, health-info) |
| `src/emr/hip.service.js` | ABDM API calls, FHIR bundle builders |
| `src/services/abdm.service.js` | ABDM gateway auth + `linkCareContexts` |
| `src/emr/emr.routes.js` | Route definitions |
| `migrations/038_abdm_production_wiring.sql` | Previous CC migration |
| `migrations/005_emr.sql` | Base schema |

---

## 3. Current State (Pre-Audit)

### 3.1 Where Care Contexts Were Created

| Trigger | File | Function | Behaviour |
|---|---|---|---|
| Encounter save (`POST /appointments/:id/encounter`) | `emr.appointment.controller.js` | `saveEncounter` | ✅ Creates CC with ON CONFLICT upsert |
| Manual CC creation (`POST /patients/:id/care-contexts`) | `emr.controller.js` | `addCareContext` | ✅ Creates CC with sample FHIR bundle |
| QR walk-in registration | `emr.controller.js` | `registerAbhaPatient` | ❌ Created CC at **registration time** if dept/doctor/visitType present |
| Appointment booking (`POST /appointments`) | `emr.appointment.controller.js` | `createAppointment` | ✅ Correctly NO CC created |

### 3.2 ABDM Link API Status (Pre-Audit)

- `abdm.service.js` exports `generateLinkToken` and `linkCareContexts` (HIP-initiated link API)
- Neither `saveEncounter` nor `addCareContext` called these functions
- CCs were stored in `emr_care_contexts` locally but **never pushed to ABDM gateway**
- `emr_care_contexts` table had no `link_status`, `linked_at`, or `link_error` columns

### 3.3 Duplicate Prevention (Pre-Audit)

- Reference number format `OPD-YYYYMMDD-<apptId>` is stable and deterministic
- `ON CONFLICT (reference_number) DO UPDATE` prevents duplicates
- `migrations/038_abdm_production_wiring.sql` adds `UNIQUE (reference_number)` constraint
- **Verdict: Duplicate prevention is CORRECT** — same encounter re-saves update, not duplicate

### 3.4 Clinical Records Re-using CC (Pre-Audit)

- All clinical data (Rx, notes, labs, vitals, vaccinations, procedures) is stored in `emr_encounters` against the same `appointment_id`
- The CC reference is `OPD-YYYYMMDD-<apptId>` — tied to the appointment, not to individual clinical items
- Re-saving encounter (adding Rx, updating notes) triggers ON CONFLICT DO UPDATE on the **same** CC ref
- **Verdict: Clinical data correctly reuses existing CC** — no new CC created per clinical item

### 3.5 Follow-up Visit (Pre-Audit)

- A follow-up on a different date → new appointment (`createAppointment`) → new appointment ID → new reference number (`OPD-<newDate>-<newApptId>`)
- `saveEncounter` on the new appointment inserts a new CC
- **Verdict: Follow-up correctly creates NEW Care Context**

---

## 4. Compliance Check (Pre-Audit vs. Post-Audit)

| ABDM Rule | Pre-Audit | Post-Audit | Notes |
|---|---|---|---|
| Appointment booking → NO Care Context | ✅ PASS | ✅ PASS | `createAppointment` never touches CC table |
| Encounter completion → ONE Care Context | ✅ PASS | ✅ PASS | `saveEncounter` upserts CC with encounter ref |
| Re-save same encounter → reuse CC, no duplicate | ✅ PASS | ✅ PASS | ON CONFLICT (reference_number) DO UPDATE |
| Follow-up (new date) → NEW Care Context | ✅ PASS | ✅ PASS | New appt → new ref num → new CC row |
| Clinical data (Rx/notes) → reuse CC, no new one | ✅ PASS | ✅ PASS | All clinical data in `emr_encounters`, same appt ref |
| Patient registration → NO Care Context | ❌ FAIL | ✅ FIXED | `registerAbhaPatient` no longer creates CC |
| Care Context linked to ABDM after creation | ❌ FAIL | ✅ FIXED | `generateLinkToken` + `linkCareContexts` called after upsert |
| Link status tracked in DB | ❌ FAIL | ✅ FIXED | New columns `link_status`, `linked_at`, `link_error` added |

---

## 5. Code Changes Made

### 5.1 New Migration: `migrations/039_care_context_link_tracking.sql`

Added to `emr_care_contexts`:
- `link_status TEXT DEFAULT 'pending' CHECK (IN ('pending','linked','failed'))`
- `linked_at TIMESTAMPTZ`
- `link_error TEXT` (stores truncated error message on failure)
- `idx_care_ctx_link_status` index on `(link_status) WHERE IN ('pending','failed')`
- Back-fill: CCs with confirmed hip_link_sessions → `link_status = 'linked'`

### 5.2 `src/emr/emr.appointment.controller.js` — `saveEncounter`

**Added:**
- `abdmSvc` and `logger` imports
- `link_status = 'pending'` column in CC INSERT
- `RETURNING *, (xmax = 0) AS inserted` to distinguish first-create vs re-save
- Logging: `"ABDM Care Context created"` on first insert
- Logging: `"ABDM Care Context already exists (updated)"` on re-save (ON CONFLICT path)
- After CC upsert, fetches patient's `abha_number`:
  - If present: calls `abdmSvc.generateLinkToken()` then `abdmSvc.linkCareContexts()`
    - On success: updates `link_status='linked'`, logs `"ABDM Care Context linked"`
    - On failure: updates `link_status='failed'`, `link_error=<message>`, logs `"ABDM Link failed"`
  - If absent: logs `"ABDM Care Context created (no ABHA — link skipped)"`

**Preserved:**
- ON CONFLICT upsert behavior (no duplicate CCs)
- FHIR bundle building via `hip.buildFhirBundleFromEncounter`
- Fire-and-forget pattern (ABDM link is async, does not block HTTP response)

### 5.3 `src/emr/emr.controller.js` — `registerAbhaPatient`

**Removed:** CC creation block that incorrectly triggered when `department/doctor/visitType` were provided at patient QR walk-in registration.  
**Added:** Info log explaining CC is deferred until encounter completion.

### 5.4 `src/emr/emr.controller.js` — `addCareContext` (manual)

**Added:**
- `link_status = 'pending'` in INSERT
- Logging: `"ABDM Care Context created"` with `source: 'manual'`
- Post-insert ABDM link attempt (same `generateLinkToken` + `linkCareContexts` pattern)
- `abdmLinked` flag in response body
- On success: `link_status='linked'`, logs `"ABDM Care Context linked"`
- On failure: `link_status='failed'`, logs `"ABDM Link failed"`
- On no ABHA: logs `"ABDM Care Context created (no ABHA — link skipped)"`

### 5.5 `src/emr/emr.controller.js` — `retryCareContextLink` (new handler)

New function and route to manually retry failed ABDM links:  
`POST /api/emr/patients/:id/care-contexts/:ctxId/link`

- Fetches CC + patient ABHA from DB
- Calls `generateLinkToken` + `linkCareContexts`
- Updates `link_status`, `linked_at`, `link_error`
- Returns `{ linked: true/false }`

### 5.6 `src/emr/emr.routes.js`

Added:
```
router.post('/patients/:id/care-contexts/:ctxId/link', emr.retryCareContextLink);
```

---

## 6. Architecture: Care Context Lifecycle

```
Patient Created
     │
     ▼
Appointment Booked      ← NO Care Context created here
     │
     ▼
Patient Checked In      ← NO Care Context created here
     │
     ▼
Doctor Completes Encounter (POST /appointments/:id/encounter)
     │
     ├─ emr_encounters row created/updated (ON CONFLICT)
     │
     ├─ emr_care_contexts row upserted
     │   reference_number = OPD-YYYYMMDD-<apptId>  (deterministic, dedup-safe)
     │   link_status = 'pending'
     │
     ├─ [if ABHA exists] ABDM Gateway: generateLinkToken + linkCareContexts
     │   ├─ Success → link_status = 'linked', linked_at = NOW()
     │   └─ Failure → link_status = 'failed', link_error = <message>
     │
     └─ HTTP 200 returned to doctor (ABDM link is fire-and-forget)

Follow-up Visit (new appointment_date)
     │
     ▼
New Appointment → New CC ref (OPD-<newDate>-<newApptId>) → New CC row
```

---

## 7. What Was NOT Changed (Correctly Compliant)

- **HIP discovery callback** (`hip.controller.js:handleDiscovery`) — reads CCs from DB, correct
- **HIP link init/confirm** — OTP flow, CC validation against DB, correct
- **Health info request** — serves FHIR bundles from `emr_care_contexts.fhir_content`, correct
- **Consent management** — consent request / grant / data pull flow, correct
- **FHIR bundle building** — `hip.service.js:buildFhirBundleFromEncounter`, correct
- **Duplicate prevention** — `ON CONFLICT (reference_number)`, correct

---

## 8. ABDM Compliance Verdict

| Category | Verdict |
|---|---|
| M1 (ABHA creation, patient registration) | ✅ Compliant |
| M2 (Care Context creation rules) | ✅ Compliant (after fixes) |
| M2 (HIP-initiated linking) | ✅ Compliant (after fixes) |
| M2 (Duplicate CC prevention) | ✅ Compliant |
| M3 (Consent + health data exchange) | ✅ Compliant (unchanged, previously audited) |
| Link tracking / observability | ✅ Added |

**Overall: ABDM COMPLIANT** — all Care Context compliance rules are now correctly implemented.

---

## 9. Recommended Follow-Up Actions

1. **Run migration 039** on all environments: `node migrations/run.js` or `psql < migrations/039_care_context_link_tracking.sql`
2. **Add a background retry job** (e.g., `cron.service.js`) to periodically retry CCs with `link_status='failed'` or `link_status='pending'` older than 5 minutes — handles transient ABDM gateway errors
3. **Add `link_status` to the patient detail API response** so the frontend can show a "Not yet linked to ABDM" badge
4. **Monitor `ABDM Link failed` log entries** — these indicate ABHA numbers that exist in the EMR but are rejected by the ABDM gateway (e.g., invalid format, account not found)
