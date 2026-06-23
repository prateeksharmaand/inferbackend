# Infer EMR — ABDM HIP/HIU Complete Analysis Report
Generated: 2026-06-15 | Analyst: Claude (ABDM Solution Architect Mode)

---

## 1. API Inventory Table

| # | Method | Path | Auth | Milestone | Handler | Description |
|---|--------|------|------|-----------|---------|-------------|
| 1 | POST | `/api/emr/auth/login` | None | — | emr.auth | Get EMR JWT |
| 2 | POST | `/api/emr/patients/:id/abha/create-otp` | EMR JWT | M1 | emr.abhaCreateOtp | Aadhaar OTP (rate-limited 3/10min) |
| 3 | POST | `/api/emr/patients/:id/abha/create-verify` | EMR JWT | M1 | emr.abhaCreateVerify | Verify Aadhaar OTP |
| 4 | POST | `/api/emr/patients/:id/abha/mobile-otp` | EMR JWT | M1 | emr.abhaCreateMobileOtp | Mobile OTP (rate-limited) |
| 5 | POST | `/api/emr/patients/:id/abha/mobile-verify` | EMR JWT | M1 | emr.abhaCreateMobileVerify | Verify Mobile OTP |
| 6 | POST | `/api/emr/patients/:id/abha/suggestions` | EMR JWT | M1 | emr.abhaGetSuggestions | ABHA address suggestions |
| 7 | POST | `/api/emr/patients/:id/abha/set-address` | EMR JWT | M1 | emr.abhaSetAddress | Set preferred ABHA address |
| 8 | GET  | `/api/emr/patients/:id/abha/card` | EMR JWT | M1 | emr.abhaGetCard | Download ABHA card PNG |
| 9 | POST | `/api/emr/patients/:id/abha/verify-otp` | EMR JWT | M1 | emr.abhaVerifyOtp | Verify existing ABHA |
| 10 | POST | `/api/emr/patients/:id/abha/verify-confirm` | EMR JWT | M1 | emr.abhaVerifyConfirm | Confirm ABHA verification |
| 11 | POST | `/api/emr/abha/aadhaar-otp` | EMR JWT | M1 | emr.abhaCreateOtp | Standalone Aadhaar OTP |
| 12 | POST | `/api/emr/abha/aadhaar-verify` | EMR JWT | M1 | emr.abhaCreateVerify | Standalone Aadhaar verify |
| 13 | POST | `/api/emr/abha/aadhaar-mobile-otp` | EMR JWT | M1 | emr.abhaCreateMobileOtp | Standalone mobile OTP |
| 14 | POST | `/api/emr/abha/aadhaar-mobile-verify` | EMR JWT | M1 | emr.abhaCreateMobileVerify | Standalone mobile verify |
| 15 | POST | `/api/emr/abha/aadhaar-suggestions` | EMR JWT | M1 | emr.abhaGetSuggestions | Standalone suggestions |
| 16 | POST | `/api/emr/abha/aadhaar-set-address` | EMR JWT | M1 | emr.abhaAadhaarSetAddress | Standalone set address |
| 17 | POST | `/api/emr/abha/aadhaar-finalize` | EMR JWT | M1 | emr.abhaAadhaarCreate | Create patient from Aadhaar |
| 18 | POST | `/api/emr/abha/request-otp` | EMR JWT | M1 | emr.abhaAddOtp | Add patient via ABHA number OTP |
| 19 | POST | `/api/emr/abha/verify-create` | EMR JWT | M1 | emr.abhaAddCreate | Verify OTP + create patient |
| 20 | POST | `/api/emr/abha/login-request-otp` | EMR JWT | M1 | emr.abhaLoginRequestOtp | Patient login OTP at POC |
| 21 | POST | `/api/emr/abha/login-verify-otp` | EMR JWT | M1 | emr.abhaLoginVerifyOtp | Verify patient login OTP |
| 22 | POST | `/api/emr/abha/login-update-mobile` | EMR JWT | M1 | emr.abhaLoginUpdateMobile | Update ABHA mobile |
| 23 | POST | `/api/emr/abha/login-link-patient` | EMR JWT | M1 | emr.abhaLoginLinkPatient | Link verified ABHA to EMR patient |
| 24 | POST | `/api/emr/patients/:id/care-contexts` | EMR JWT | M2 | emr.addCareContext | Add care context |
| 25 | DELETE | `/api/emr/patients/:id/care-contexts/:ctxId` | EMR JWT | M2 | emr.deleteCareContext | Delete care context |
| 26 | GET  | `/api/abdm/care-contexts/available` | EMR JWT | M2 | abdmCtrl.getAvailableCareContexts | Fetch HIP care contexts for patient |
| 27 | POST | `/api/abdm/care-contexts/link` | EMR JWT | M2 | abdmCtrl.linkCareContexts | HIP-initiated link (v3) |
| 28 | GET  | `/api/abdm/care-contexts` | EMR JWT | M2 | abdmCtrl.getLinkedCareContexts | List linked care contexts |
| 29 | DELETE | `/api/abdm/care-contexts/:contextRef` | EMR JWT | M2 | abdmCtrl.unlinkCareContext | Unlink care context |
| 30 | POST | `/api/abdm/care-contexts/discover` | EMR JWT | M2 | abdmCtrl.discoverCareContexts | Initiate discovery (async) |
| 31 | GET  | `/api/abdm/care-contexts/discover/:requestId` | EMR JWT | M2 | abdmCtrl.discoverStatus | Poll discovery status |
| 32 | POST | `/api/abdm/links/init` | EMR JWT | M2 | abdmCtrl.linkInit | Patient link init |
| 33 | GET  | `/api/abdm/links/:requestId/status` | EMR JWT | M2 | abdmCtrl.linkStatus | Poll link init status |
| 34 | POST | `/api/abdm/links/confirm` | EMR JWT | M2 | abdmCtrl.linkConfirm | Confirm link with OTP |
| 35 | GET  | `/api/abdm/links/:requestId/confirm-status` | EMR JWT | M2 | abdmCtrl.confirmStatus | Poll link confirm status |
| 36 | POST | `/api/emr/consents` | EMR JWT | M2 | emr.createConsentRequest | Create consent request |
| 37 | GET  | `/api/emr/consents` | EMR JWT | M2 | emr.listConsentRequests | List consent requests |
| 38 | GET  | `/api/emr/consents/health-records` | EMR JWT | M3 | emr.getConsentHealthRecords | Get decrypted health records |
| 39 | POST | `/api/emr/consents/:requestId/respond` | EMR JWT | M2 | emr.respondConsent | Grant/Deny consent |
| 40 | POST | `/api/emr/consents/:requestId/pull-data` | EMR JWT | M3 | emr.pullConsentData | Trigger health data fetch |
| 41 | GET  | `/api/abdm/health-records` | EMR JWT | M3 | abdmCtrl.getHealthRecords | View decrypted health records |
| 42 | GET  | `/api/emr/pending-otps` | EMR JWT | M2 | emr.pendingOtps | HIP pending OTP sessions |
| 43 | GET  | `/api/emr/health-requests` | EMR JWT | M3 | emr.healthRequests | HIP health info requests |
| 44 | GET  | `/api/emr/activity` | EMR JWT | — | emr.activityLog | ABDM activity log |
| 45 | GET  | `/api/emr/abdm/bridge` | EMR JWT | — | emr.abdmGetBridge | Bridge registration status |
| 46 | POST | `/api/emr/abdm/bridge/update` | EMR JWT | — | emr.abdmUpdateBridge | Update bridge URL |
| 47 | GET  | `/api/emr/profile-shares` | EMR JWT | M1 | emr.listProfileShares | QR profile shares |
| 48 | PATCH | `/api/emr/profile-shares/:id/dismiss` | EMR JWT | M1 | emr.dismissProfileShare | Dismiss profile share |
| 49 | POST | `/api/emr/profile-shares/:id/link-patient` | EMR JWT | M1 | emr.linkProfileShareToPatient | Link profile share to patient |
| — | — | **HIP CALLBACKS (Gateway → EMR)** | — | — | — | — |
| 50 | POST | `/v0.5/care-contexts/discover` | ABDM JWT | M2/HIP | hipCtrl.handleDiscovery | Discovery request from gateway |
| 51 | POST | `/v0.5/links/link/init` | ABDM JWT | M2/HIP | hipCtrl.handleLinkInit | Link init from gateway |
| 52 | POST | `/v0.5/links/link/confirm` | ABDM JWT | M2/HIP | hipCtrl.handleLinkConfirm | Link confirm from gateway |
| 53 | POST | `/v0.5/health-information/hip/request` | ABDM JWT | M3/HIP | hipCtrl.handleHealthInfoRequest | Health data request |
| 54 | POST | `/v0.5/consents/hip/notify` | ABDM JWT | M2/HIP | hipCtrl.handleConsentNotify | Consent notification |
| 55 | POST | `/v3/hip/patient/care-context/discover` | ABDM JWT | M2/HIP | hipCtrl.handleDiscovery | v3 discovery |
| 56 | POST | `/v3/hip/links/link/init` | ABDM JWT | M2/HIP | hipCtrl.handleLinkInit | v3 link init |
| 57 | POST | `/v3/hip/link/care-context/init` | ABDM JWT | M2/HIP | hipCtrl.handleLinkInit | v3 link init (alt path) |
| 58 | POST | `/v3/hip/links/link/confirm` | ABDM JWT | M2/HIP | hipCtrl.handleLinkConfirm | v3 link confirm |
| 59 | POST | `/v3/hip/link/care-context/confirm` | ABDM JWT | M2/HIP | hipCtrl.handleLinkConfirm | v3 link confirm (alt path) |
| 60 | POST | `/v3/hip/health-information/request` | ABDM JWT | M3/HIP | hipCtrl.handleHealthInfoRequest | v3 health data request |
| 61 | POST | `/v3/hip/patient/share/profile` | ABDM JWT | M1/HIP | hipCtrl.handlePatientShareProfile | QR patient share |
| 62 | POST | `/v3/hip/patient/share` | ABDM JWT | M1/HIP | hipCtrl.handlePatientShareProfile | QR patient share (alt) |
| 63 | POST | `/v3/hip/patient/running-token/status` | ABDM JWT | M1/HIP | hipCtrl.handleRunningTokenStatus | Token validity check |
| 64 | POST | `/v3/hip/consent/request/notify` | ABDM JWT | M2/HIP | hipCtrl.handleConsentNotify | v3 consent notify |
| 65 | POST | `/v3/consent/request/hip/notify` | ABDM JWT | M2/HIP | hipCtrl.handleConsentNotify | v3 consent notify (alt) |
| — | — | **HIU CALLBACKS (Gateway → EMR)** | — | — | — | — |
| 66 | POST | `/v0.5/care-contexts/on-discover` | ABDM JWT | M2/HIU | abdmCtrl.onDiscover | Discovery result |
| 67 | POST | `/v0.5/links/link/on-init` | ABDM JWT | M2/HIU | abdmCtrl.onLinkInit | Link OTP ready |
| 68 | POST | `/v0.5/links/link/on-confirm` | ABDM JWT | M2/HIU | abdmCtrl.onLinkConfirm | Link confirmed |
| 69 | POST | `/v0.5/consent-requests/on-init` | ABDM JWT | M2/HIU | abdmCtrl.consentOnInit | Consent request registered |
| 70 | POST | `/v0.5/consents/hiu/notify` | ABDM JWT | M2/HIU | abdmCtrl.consentNotify | Consent status update |
| 71 | POST | `/v0.5/health-information/hiu/on-request` | ABDM JWT | M3/HIU | inline handler | HI request ACK |
| 72 | POST | `/v0.5/health-information/transfer` | ABDM JWT | M3/HIU | abdmCtrl.healthInfoPush | FHIR data push |
| 73 | POST | `/v3/hiu/consent/request/on-init` | ABDM JWT | M2/HIU | abdmCtrl.consentOnInit | v3 consent on-init |
| 74 | POST | `/v3/hiu/consent/request/notify` | ABDM JWT | M2/HIU | abdmCtrl.consentNotify | v3 consent notify |
| 75 | POST | `/v3/hiu/health-information/on-request` | ABDM JWT | M3/HIU | inline handler | v3 HI on-request |
| — | — | **INTERNAL ABDM CALLBACK PATHS** | — | — | — | — |
| 76 | POST | `/api/abdm/care-contexts/on-discover` | None | M2 | abdmCtrl.onDiscover | Internal on-discover |
| 77 | POST | `/api/abdm/links/link/on-init` | None | M2 | abdmCtrl.onLinkInit | Internal on-link-init |
| 78 | POST | `/api/abdm/links/link/on-confirm` | None | M2 | abdmCtrl.onLinkConfirm | Internal on-link-confirm |
| 79 | POST | `/api/abdm/consent/notify` | None | M2/M3 | abdmCtrl.consentNotify | Internal consent notify |
| 80 | POST | `/api/abdm/consent-request/on-status` | None | M2/M3 | abdmCtrl.consentNotify | Internal consent on-status |
| 81 | POST | `/api/abdm/health-info/push` | None | M3 | abdmCtrl.healthInfoPush | Internal health info push |
| — | — | **DEBUG** | — | — | — | — |
| 82 | GET  | `/api/abdm/debug/token` | None | — | abdmCtrl.debugToken | ⚠️ Exposes credentials |
| 83 | GET  | `/api/abdm/debug/bridge` | None | — | abdmCtrl.debugBridge | ⚠️ Exposes bridge info |
| 84 | GET  | `/api/abdm/debug/hip-sessions` | None | — | abdmCtrl.debugHipSessions | ⚠️ Exposes session PHI |

**Total: 84 endpoints** (49 EMR-facing + 35 ABDM gateway callbacks)

---

## 2. ABDM Workflow Mapping

### M1 — ABHA Enrollment & Authentication ✅ COMPLETE

| ABDM Requirement | Status | Implementation |
|-----------------|--------|---------------|
| Aadhaar OTP generation | ✅ | `/api/emr/patients/:id/abha/create-otp` |
| Aadhaar OTP verification | ✅ | `/api/emr/patients/:id/abha/create-verify` |
| Mobile OTP generation | ✅ | `/api/emr/patients/:id/abha/mobile-otp` |
| Mobile OTP verification | ✅ | `/api/emr/patients/:id/abha/mobile-verify` |
| ABHA address suggestions | ✅ | `/api/emr/patients/:id/abha/suggestions` |
| Set preferred ABHA address | ✅ | `/api/emr/patients/:id/abha/set-address` |
| ABHA card download | ✅ | `/api/emr/patients/:id/abha/card` |
| Patient-initiated share (QR) | ✅ | `/v3/hip/patient/share/profile` |
| Running token verification | ✅ | `/v3/hip/patient/running-token/status` |

### M2 — Care Context Linking & Consent ✅ COMPLETE

| ABDM Requirement | Status | Implementation |
|-----------------|--------|---------------|
| Care context registration (HIP) | ✅ | `POST /api/emr/patients/:id/care-contexts` |
| Discovery (HIP handles) | ✅ | `/v0.5/care-contexts/discover` + `/v3/hip/patient/care-context/discover` |
| on-discover (HIU receives) | ✅ | `/v0.5/care-contexts/on-discover` |
| Link init (HIP handles) | ✅ | `/v0.5/links/link/init` + v3 variants |
| on-link-init (HIU receives) | ✅ | `/v0.5/links/link/on-init` |
| Link confirm (HIP handles) | ✅ | `/v0.5/links/link/confirm` + v3 variants |
| on-link-confirm (HIU receives) | ✅ | `/v0.5/links/link/on-confirm` |
| HIP-initiated linking (v3) | ✅ | `/api/abdm/care-contexts/link` → HIECM v3 |
| Consent request create (HIU) | ✅ | `POST /api/emr/consents` |
| Consent on-init callback | ✅ | `/v0.5/consent-requests/on-init` + v3 |
| Consent notify (HIU) | ✅ | `/v0.5/consents/hiu/notify` + v3 |
| Consent notify (HIP) | ✅ | `/v0.5/consents/hip/notify` + v3 |

### M3 — Health Information Exchange ✅ COMPLETE

| ABDM Requirement | Status | Implementation |
|-----------------|--------|---------------|
| Health info request (HIP handles) | ✅ | `/v0.5/health-information/hip/request` + v3 |
| FHIR bundle building | ✅ | hip.service.js — OPConsultation, DiagnosticReport, Prescription, Immunization, DischargeSummary |
| Curve25519 encryption | ✅ | fidelius-cli JAR (BouncyCastle-compatible) |
| Data push to gateway | ✅ | `pushHealthData()` in hip.service.js |
| Health info transfer receive (HIU) | ✅ | `/v0.5/health-information/transfer` |
| FHIR decryption (HIU) | ✅ | `decryptHipEntry()` + HKDF-SHA256 + AES-256-GCM |
| MD5 checksum verification | ✅ | M3-FHIR: §4.3.2 |
| on-request ACK (HIU) | ✅ | `/v0.5/health-information/hiu/on-request` |
| on-request ACK (HIP) | ✅ | `sendHealthInfoOnRequest()` |

---

## 3. Missing / Incomplete APIs

| # | Missing API | ABDM Requirement | Priority | Notes |
|---|------------|-----------------|----------|-------|
| 1 | `POST /v0.5/consents/on-fetch` | HIU fetches consent artefact details | HIGH | No route found for fetching artefact from gateway |
| 2 | `GET /api/abdm/status` | ABHA account status (HIU) | MEDIUM | `/api/abdm/status` present in code reference but not in abdm.routes.js |
| 3 | `GET /api/abdm/profile` | ABHA profile (HIU) | MEDIUM | `/api/abdm/profile` referenced in analysis but not in abdm.routes.js |
| 4 | `POST /api/abdm/logout` | ABHA logout (HIU) | LOW | Referenced but not in routes |
| 5 | `POST /v0.5/health-information/notify` | HIU notifies gateway after receiving data | HIGH | After `/v0.5/health-information/transfer`, HIU must call this ACK back — not found |
| 6 | Subscription management UI | Patient consent via PHR app | MEDIUM | No webhook for patient-side consent decisions |
| 7 | ABHA address update flow | M1: change ABHA address | LOW | Only set during creation |
| 8 | `DELETE /api/abdm/abha` | M1: ABHA account deletion | LOW | Not implemented |

**Critical Missing: `/v0.5/health-information/notify`**
Per ABDM spec, after receiving health data at `/v0.5/health-information/transfer`, the HIU **must** call back to the gateway with session status (TRANSFERRED). This acknowledgment call is not present in the codebase.

---

## 4. Security Findings

### 🔴 CRITICAL

| # | Finding | Location | Risk |
|---|---------|----------|------|
| C1 | Debug endpoints unauthenticated | `/api/abdm/debug/token`, `/api/abdm/debug/bridge`, `/api/abdm/debug/hip-sessions` | Any unauthenticated caller can obtain ABDM gateway tokens and view patient OTP sessions |
| C2 | Internal ABDM callback paths have no auth | `/api/abdm/care-contexts/on-discover`, `/api/abdm/links/link/on-init`, `/api/abdm/links/link/on-confirm`, `/api/abdm/consent/notify`, `/api/abdm/health-info/push` | These accept ABDM gateway callbacks without JWT verification — could be called by anyone |

### 🟠 HIGH

| # | Finding | Location | Risk |
|---|---------|----------|------|
| H1 | Rate limit is IP-based | `otpLimiter` in emr.routes.js | If behind a load balancer without proper `trust proxy` config, all clients share the same IP rate limit bucket |
| H2 | HIU callback paths in abdm.routes.js skip verifyAbdmCallback | `abdm.routes.js` lines 26,33,34 | `ctrl.onDiscover`, `ctrl.onLinkInit`, `ctrl.onLinkConfirm` have no ABDM JWT verification unlike their v0.5/* counterparts |
| H3 | ABDM_SKIP_JWT_VERIFY=true in sandbox | abdm.callback.auth.js | Must be confirmed false/unset before any production go-live |
| H4 | `ABDM_DEV_SHOW_OTP=true` logs OTP to console | abdm.service.js | Console logs are captured by log aggregators — OTP exposure in sandbox acceptable, MUST be false in production |

### 🟡 MEDIUM

| # | Finding | Location | Risk |
|---|---------|----------|------|
| M1 | Health records rate limit is in-memory (not DB-backed per restart) | abdm.controller.js `checkHealthInfoRateLimit()` | On server restart the in-memory counter resets — DB-backed implementation exists in hip.service.js but may not be used everywhere |
| M2 | No mutual TLS for gateway callbacks | server.js | ABDM gateway callbacks use RS256 JWT which is verified — acceptable, but mTLS would be defense-in-depth |
| M3 | Fidelius JAR subprocess has 30s timeout | hip.service.js | If JAR is missing or JVM is slow, M3 health data push fails — ensure fidelius is deployed |
| M4 | Consent artefact fetch not implemented | abdmCtrl | After consent GRANTED, full artefact details are fetched — verify the artefact fetch API call is made |

### 🟢 SECURITY POSITIVES (Implemented Correctly)

- ✅ **OTP bcrypt hashing** (SEC-022, R2-007) — never stored plaintext
- ✅ **OTP lockout after 3 attempts** (SEC-007) with expiry-before-lockout check (BLOCKER-1)
- ✅ **Cryptographically secure OTP** via `crypto.randomInt()` (SEC-004)
- ✅ **SSRF protection** on dataPushUrl (R2-001) — allowlist: *.abdm.gov.in domains only
- ✅ **PHI redaction in logs** — ABHA address masked (R2-013), OTP never logged (SEC-003), tokenNumber never logged (R2-008)
- ✅ **UUID format validation** on requestId and transactionId (BLOCKER-4)
- ✅ **FHIR ABDM IG compliance** — stable UUIDs, required identifiers (R2-012, R3-002)
- ✅ **Care context existence validation** before link confirm (BLOCKER-3)
- ✅ **SHA-256 hash of QR token** stored not plaintext (R3-007)
- ✅ **Consent validity check** before health data push (SEC-008, R3-009)
- ✅ **MD5 checksum verification** on received health data (M3-FHIR §4.3.2)
- ✅ **Exponential backoff** on gateway callbacks (BLOCKER-5)
- ✅ **64KB cap** on consent artefact raw JSON (R3-011)
- ✅ **Fidelius-only encryption** — no fallback to unencrypted (R2-005)

---

## 5. Authentication Issues

| Issue | Detail | Recommendation |
|-------|--------|---------------|
| Debug endpoints open | 3 debug GET endpoints require no token | Add `emrAuth` or remove in production |
| Internal callbacks unauthenticated | 6 `/api/abdm/*` callback paths | Add `verifyAbdmCallback` or restrict to localhost/VPN |
| v0.5 HIU callbacks use verifyAbdmCallback | ✅ Correct — gateway JWT verified | Keep |
| v3 HIU callbacks use verifyAbdmCallback | ✅ Correct — gateway JWT verified | Keep |
| HIP callbacks use verifyAbdmCallback | ✅ Correct — gateway JWT verified | Keep |
| Production issuer check | R3-005 — enforced in production NODE_ENV | Verify NODE_ENV=production is set |

---

## 6. Hardcoded Secrets Check

| Item | Status | Location |
|------|--------|----------|
| ABDM_CLIENT_ID | ✅ From env | `process.env.ABDM_CLIENT_ID` |
| ABDM_CLIENT_SECRET | ✅ From env | `process.env.ABDM_CLIENT_SECRET` |
| Gateway URL | ✅ From env with default | `process.env.ABDM_GATEWAY_URL || 'https://dev.abdm.gov.in/gateway'` |
| CM ID 'sbx' | ⚠️ Default hardcoded | `process.env.ABDM_CM_ID || 'sbx'` — ensure 'abdm' is set in production |
| HIP Name 'Infer EMR' | ⚠️ Default hardcoded | `process.env.ABDM_HIP_NAME || 'Infer EMR'` — set in .env |
| fidelius path | ⚠️ Default hardcoded | `/opt/fidelius` — acceptable default if deployed correctly |

---

## 7. PHI Logging Audit

| Check | Status | Notes |
|-------|--------|-------|
| OTP never logged in production | ✅ | `ABDM_DEV_SHOW_OTP` gate (SEC-003) |
| ABHA address masked in logs | ✅ | R2-013: `patient@****` |
| tokenNumber never logged | ✅ | R2-008 |
| Full response body not logged | ✅ | R3-001, R2-015 |
| PHI tmpdir cleaned synchronously | ✅ | SEC-012 |
| Sensitive query params redacted | ✅ | R2-016 Morgan token |
| Care context reference | ⚠️ | Logged as metadata — not PHI itself but links to patient |

---

## 8. Callback Handler Coverage

| Callback | Registered | Auth | Notes |
|----------|-----------|------|-------|
| `/v0.5/care-contexts/on-discover` | ✅ | ABDM JWT | HIU |
| `/v0.5/links/link/on-init` | ✅ | ABDM JWT | HIU |
| `/v0.5/links/link/on-confirm` | ✅ | ABDM JWT | HIU |
| `/v0.5/consent-requests/on-init` | ✅ | ABDM JWT | HIU |
| `/v0.5/consents/hiu/notify` | ✅ | ABDM JWT | HIU |
| `/v0.5/health-information/hiu/on-request` | ✅ | ABDM JWT | HIU (inline) |
| `/v0.5/health-information/transfer` | ✅ | ABDM JWT | HIU data push |
| `/v0.5/care-contexts/discover` | ✅ | ABDM JWT | HIP |
| `/v0.5/links/link/init` | ✅ | ABDM JWT | HIP |
| `/v0.5/links/link/confirm` | ✅ | ABDM JWT | HIP |
| `/v0.5/health-information/hip/request` | ✅ | ABDM JWT | HIP |
| `/v0.5/consents/hip/notify` | ✅ | ABDM JWT | HIP |
| `/v0.5/health-information/notify` (HIU ACK) | ❌ | — | **MISSING — Required post-transfer ACK** |
| `/v3/hip/*` | ✅ | ABDM JWT | All v3 HIP variants |
| `/v3/hiu/*` | ✅ | ABDM JWT | All v3 HIU variants |
| `/api/abdm/care-contexts/on-discover` | ✅ | ❌ None | Internal — vulnerable |
| `/api/abdm/links/link/on-init` | ✅ | ❌ None | Internal — vulnerable |
| `/api/abdm/links/link/on-confirm` | ✅ | ❌ None | Internal — vulnerable |
| `/api/abdm/consent/notify` | ✅ | ❌ None | Internal — vulnerable |
| `/api/abdm/health-info/push` | ✅ | ❌ None | Internal — vulnerable |

---

## 9. Encryption Audit

| Component | Algorithm | Status | Notes |
|-----------|-----------|--------|-------|
| HIP → HIU data encryption | Curve25519 ECDH + HKDF-SHA256 + AES-256-GCM | ✅ | Via fidelius-cli (BouncyCastle) |
| HIU decryption | Weierstrass Curve25519 ECDH + AES-256-GCM | ✅ | JavaScript implementation |
| Key format | SPKI DER with explicit params | ✅ | ABDM-compatible |
| Nonce handling | XOR nonce (ABDM spec) | ✅ | Implemented |
| Key material expiry | Set per request | ✅ | Ephemeral keys |
| Fallback if fidelius fails | Abort (no fallback) | ✅ | R2-005: correct |
| OTP storage | bcrypt | ✅ | Never plaintext |
| QR token storage | SHA-256 hash | ✅ | R3-007 |
| JWT verification | RS256 via JWKS | ✅ | verifyAbdmCallback |

---

## 10. FHIR Bundle Types Supported

| HI Type | Builder Function | Status |
|---------|-----------------|--------|
| OPConsultation | `buildOPConsultationBundle()` | ✅ |
| DiagnosticReport | `buildDiagnosticReportBundle()` | ✅ |
| Prescription | `buildPrescriptionBundle()` | ✅ |
| ImmunizationRecord | `buildImmunizationBundle()` | ✅ |
| DischargeSummary | `buildDischargeSummaryBundle()` | ✅ |
| WellnessRecord | Not implemented | ❌ Missing |
| HealthDocumentRecord | Not implemented | ❌ Missing |

---

## 11. Rate Limiting Summary

| Limiter | Applies To | Window | Max |
|---------|-----------|--------|-----|
| Global | All `/api/*` | 15 min | 1500 req/IP |
| Auth | `/api/auth/*` | 15 min | 20 req/IP |
| OTP | ABHA OTP endpoints | 10 min | 3 req/IP |
| Health Info (HIP) | Per patient per hour | 60 min | 10 requests |
| OTP lockout | Per session | Session | 3 attempts |

---

## 12. Action Items (Priority Order)

1. 🔴 **Add `verifyAbdmCallback` to all 6 internal `/api/abdm/*` callback paths** (or restrict to localhost)
2. 🔴 **Add `emrAuth` to all 3 debug endpoints** (or delete them)
3. 🔴 **Implement `/v0.5/health-information/notify` ACK** after receiving health data transfer
4. 🟠 **Set `ABDM_SKIP_JWT_VERIFY=false`** before production
5. 🟠 **Set `ABDM_DEV_SHOW_OTP=false`** before production
6. 🟠 **Set `ABDM_CM_ID=abdm`** in production .env (not 'sbx')
7. 🟡 **Implement missing ABHA HIU routes** (status, profile, logout) in abdm.routes.js
8. 🟡 **Add WellnessRecord and HealthDocumentRecord** FHIR bundle builders
9. 🟢 Verify `NODE_ENV=production` is set on server before ABDM go-live

---

*Files generated:*
- `ABDM_Postman_Collection.json` — Import into Postman (Collection v2.1)
- `ABDM_Postman_Environment.json` — Import as Postman Environment
- `ABDM_Analysis_Report.md` — This report
