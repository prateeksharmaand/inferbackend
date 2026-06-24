# Patient Matching System Redesign — Implementation Guide

**Status:** Ready for deployment  
**Version:** 2.0  
**Date:** 2026-06-24

---

## Quick Start

### Files Created

1. **Design Document** (comprehensive)
   - `/d/Infer/PATIENT_MATCHING_REDESIGN.md`

2. **Implementation Files**
   - `/d/Infer/backend/src/utils/phone-utils.js` — Phone normalization utility
   - `/d/Infer/backend/src/services/patient-match.service.v2.js` — Redesigned matching service
   - `/d/Infer/backend/migrations/060_patient_matching_redesign.sql` — Database schema

3. **Test Files**
   - `/d/Infer/backend/tests/phone-utils.test.js` — Phone normalization tests
   - `/d/Infer/backend/tests/patient-match.service.v2.test.js` — Matching logic tests

---

## Deployment Steps

### Phase 1: Database Migration (1-2 hours)

```bash
# 1. Backup database
pg_dump $DATABASE_URL > backup-$(date +%s).sql

# 2. Run migration
psql $DATABASE_URL -f /d/Infer/backend/migrations/060_patient_matching_redesign.sql

# 3. Verify migration
psql $DATABASE_URL -c "
  SELECT count(*) as total_patients,
         count(CASE WHEN mobile_normalized IS NOT NULL THEN 1 END) as normalized
  FROM emr_patients WHERE deleted_at IS NULL;
"

# 4. Check indexes
psql $DATABASE_URL -c "SELECT * FROM pg_indexes WHERE tablename = 'emr_patients' ORDER BY indexname;"
```

### Phase 2: Code Deployment (30 minutes)

```bash
# 1. Add new files
cp backend/src/utils/phone-utils.js $TARGET/src/utils/
cp backend/src/services/patient-match.service.v2.js $TARGET/src/services/

# 2. Run tests
npm test -- phone-utils.test.js
npm test -- patient-match.service.v2.test.js

# 3. Update dependent files (next section)

# 4. Deploy to staging, verify
npm run build
npm run test:integration

# 5. Deploy to production
npm run deploy:production
```

### Phase 3: Update Dependent Code

Update these files to use the new service:

**1. `/d/Infer/backend/src/emr/abha.identity.js`**

Replace the `resolveOrCreatePatient` function to use v2.0:

```javascript
// OLD
const PatientMatchService = require('../services/patient-match.service');
const matchResult = await PatientMatchService.findPatient(pool, {...});

// NEW
const PatientMatchService = require('../services/patient-match.service.v2');
const result = await PatientMatchService.findOrCreatePatient(pool, {...});
```

**2. `/d/Infer/backend/src/emr/inbound/slot.service.js` (bookSlot function)**

Replace patient lookup/creation:

```javascript
// OLD
const { rows: [existing] } = await pool.query(
  `SELECT id FROM emr_patients WHERE mobile = $1 ...`,
  [patientData.patient_mobile]
);

// NEW
const { normalizePhone } = require('../../utils/phone-utils');
const result = await PatientMatchService.findOrCreatePatient(pool, {
  mobile: patientData.patient_mobile,
  name: patientData.patient_name,
  dob: patientData.patient_dob,
  gender: patientData.patient_gender,
  clinicId: clinicId,
  source: 'appointment'
});
```

**3. `/d/Infer/backend/src/emr/emr.controller.js` (createPatient function)**

Replace manual ABHA resolution:

```javascript
// Use the new service consistently
const result = await PatientMatchService.findOrCreatePatient(pool, {
  abhaNumber: abha_number,
  abhaAddress: abha_address,
  name,
  mobile,
  gender: gender ?? 'M',
  dob: dob ?? null,
  clinicId: req.emrUser?.clinic_id,
  source: 'manual'
});

// Check for manual review requirement
if (result.requiresManualReview) {
  return res.status(202).json({
    status: 'manual_review_required',
    message: result.message,
    candidates: result.candidates
  });
}

// Otherwise return patient
res.status(result.created ? 201 : 200).json(result.patient);
```

---

## Key Implementation Details

### Phone Normalization

**In Node.js:**
```javascript
const { normalizePhone } = require('./utils/phone-utils');

const mobile = normalizePhone(input);
if (!mobile) {
  // Invalid phone number
  return res.status(400).json({ error: 'Invalid phone number' });
}

// Use normalized form in database queries
```

**In PostgreSQL:**
```sql
-- Automatically stored via generated column
SELECT * FROM emr_patients WHERE mobile_normalized = '9650269758';
```

### 4-Tier Matching Flow

```javascript
async function findOrCreatePatient(pool, criteria) {
  // Level 1: ABHA → 100% confidence, UPDATE patient
  if (criteria.abhaNumber) {
    const patient = await _findByAbhaNumber(...);
    if (patient) return { patient, matchedBy: 'abha_number', confidence: 100 };
  }
  
  // Level 2: Mobile+DOB+Name → 99% confidence, clinic-scoped
  if (criteria.mobile && criteria.dob && criteria.name) {
    const matches = await _findByMobileDobName(...);
    if (matches.length === 1) return { patient: matches[0], confidence: 99 };
    if (matches.length > 1) return { requiresManualReview: true, candidates: matches };
  }
  
  // Level 3: Mobile+Name → 95% confidence, clinic-scoped, single match only
  if (criteria.mobile && criteria.name) {
    const matches = await _findByMobileName(...);
    if (matches.length === 1) return { patient: matches[0], confidence: 95 };
    if (matches.length > 1) return { requiresManualReview: true, candidates: matches };
  }
  
  // Level 4: Create new patient
  return { patient: newPatient, created: true };
}
```

### Manual Review Response

When multiple candidates are found:

```javascript
return res.status(202).json({
  status: 'manual_review_required',
  message: 'Found 3 similar patients. Please select one.',
  candidates: [
    {
      id: 123,
      name: 'Rajesh Sharma',
      mobile: '9650269758',
      dob: '1985-03-15',
      gender: 'M'
    },
    // ...
  ],
  allowCreateNew: true
});
```

### Clinic-Scoped Queries

All demographic matching is clinic-scoped:

```javascript
// CORRECT: Clinic-scoped demographic search
SELECT p.* FROM emr_patients p
INNER JOIN patient_clinics pc ON p.id = pc.patient_id
WHERE pc.clinic_id = $1
  AND p.mobile_normalized = $2
  AND LOWER(p.name) = LOWER($3)
  AND p.deleted_at IS NULL;

// WRONG: Global demographic search
SELECT p.* FROM emr_patients p
WHERE p.mobile_normalized = $1;  // This searches across all clinics!
```

### ABHA Exception (Global Search)

ABHA matching is globally unique — can search across all clinics:

```javascript
// CORRECT: ABHA search is GLOBAL
SELECT p.* FROM emr_patients p
JOIN abha_mappings m ON m.patient_id = p.id
WHERE m.abha_number = $1
  AND m.status = 'active'
  AND p.deleted_at IS NULL;
```

---

## Configuration

### Environment Variables

None required beyond existing config. The service uses:
- `DATABASE_URL` — PostgreSQL connection
- `LOG_LEVEL` — Logger configuration (existing)

### Feature Flags

Consider adding to `settings.json`:

```json
{
  "patient_matching": {
    "version": "v2.0",
    "manual_review_enabled": true,
    "phone_normalization": "enabled",
    "abha_priority": "highest",
    "clinic_isolation": "enabled"
  }
}
```

---

## Monitoring & Alerts

### Key Metrics to Track

```sql
-- Daily matching success rate
SELECT
  DATE(created_at),
  COUNT(*) total_matches,
  COUNT(CASE WHEN confidence = 100 THEN 1 END) level1,
  COUNT(CASE WHEN confidence = 99 THEN 1 END) level2,
  COUNT(CASE WHEN confidence = 95 THEN 1 END) level3,
  COUNT(CASE WHEN confidence = 0 AND manual_review THEN 1 END) manual_reviews,
  COUNT(CASE WHEN confidence = 0 AND NOT manual_review THEN 1 END) new_patients
FROM patient_match_log
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;

-- Manual review ratio (should be < 2%)
SELECT
  ROUND(
    100.0 * SUM(CASE WHEN manual_review THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) as manual_review_percentage
FROM patient_match_log
WHERE created_at > NOW() - INTERVAL '7 days';

-- Duplicate detection rate
SELECT COUNT(DISTINCT p.id) as duplicate_count
FROM emr_patients p
INNER JOIN patient_clinics pc1 ON p.id = pc1.patient_id
INNER JOIN patient_clinics pc2 ON p.id = pc2.patient_id
WHERE pc1.clinic_id != pc2.clinic_id
  AND pc1.mobile_normalized = pc2.mobile_normalized
  AND p.deleted_at IS NULL;
```

### Alert Rules

Create alerts for:
1. Manual review rate > 5% (potential data quality issue)
2. Failed phone normalization > 10% (potential input validation issue)
3. Duplicate ABHA mappings for same patient (data integrity)

---

## Testing Checklist

### Unit Tests
- [ ] `npm test -- phone-utils.test.js` — All 25+ tests pass
- [ ] `npm test -- patient-match.service.v2.test.js` — All 20+ tests pass

### Integration Tests
```bash
# Test with real database
npm run test:integration -- patient-matching

# Verify:
# - ABHA lookup works
# - Mobile normalization works
# - Clinic scoping works
# - Manual review flow works
```

### Production Validation (First Week)
- [ ] Monitor manual_review_rate (target: < 2%)
- [ ] Monitor duplicate creation rate (target: 0 after migration)
- [ ] Check phone normalization success rate (target: > 99%)
- [ ] Verify ABHA matching works end-to-end
- [ ] Confirm no false patient matches (patient safety)

### ABDM Compliance Tests
- [ ] ABHA number matching works (Level 1)
- [ ] ABHA address matching works (Level 1b)
- [ ] QR code scanning finds correct patient
- [ ] HIP consent import finds correct patient by ABHA
- [ ] HIU data import matches to correct patient

---

## Rollback Plan

If issues arise:

### Immediate Rollback (< 5 minutes)
```bash
# 1. Revert code to old patient-match.service.js
git revert <commit-hash>

# 2. Restart backend
docker-compose restart backend

# 3. Monitor logs
docker-compose logs -f backend
```

### Database Rollback (if needed)
```bash
# 1. Drop new columns/indexes
DROP INDEX idx_emr_patients_mobile_dob_name;
DROP INDEX idx_emr_patients_mobile_name;
ALTER TABLE emr_patients DROP COLUMN mobile_normalized;

# 2. Restore from backup if critical
psql $DATABASE_URL < backup-<timestamp>.sql

# 3. Verify patient data integrity
SELECT COUNT(*) FROM emr_patients WHERE deleted_at IS NULL;
```

---

## Cutover Plan (Staged Deployment)

### Week 1: Staging Validation
- Deploy to staging environment
- Run full integration test suite
- Validate with 100+ test patients
- Get team sign-off

### Week 2: Gradual Production Rollout
- **Day 1:** Deploy to 1 clinic (small volume)
- **Day 3:** Deploy to 5 clinics (medium volume)
- **Day 5:** Deploy to all clinics
- Monitor metrics at each stage

### Rollback Criteria
- Manual review rate > 10% → Investigate
- Duplicate patient creation > 0.1% → Rollback
- ABHA matching failure > 5% → Rollback
- Patient data corruption → Immediate rollback

---

## Documentation Updates

### Update These Docs
1. **API Documentation**
   - Add manual_review_required response (202 status)
   - Update patient creation endpoint
   - Document phone normalization rules

2. **Database Schema Docs**
   - Document patient_match_log table
   - Explain mobile_normalized generated column
   - List all new indexes

3. **Developer Guide**
   - Phone normalization best practices
   - Clinic-scoped query patterns
   - ABHA matching flow

4. **Operations Guide**
   - Monitoring dashboard setup
   - Alert configuration
   - Troubleshooting manual reviews

---

## Support & Escalation

### Common Issues

**1. Manual review rate is high (> 5%)**
- Check if patients have consistent naming (e.g., "Raj" vs "Rajesh")
- Review mobile normalization — ensure all variants are captured
- Consider adding intermediate name matching at Level 3.5

**2. Phone normalization failures**
- Log invalid phone numbers to identify patterns
- Update normalization rules if legitimate formats are rejected
- Consider lenient mode for international numbers

**3. ABHA matching not working**
- Verify abha_mappings table is populated
- Check ABDM status and credential validity
- Ensure ABHA numbers are correctly formatted

**4. Clinic isolation not working**
- Verify patient_clinics records exist
- Check clinic_id in JWT token
- Review clinic_id in patient queries

---

## Performance Benchmarks

Expected query times on 1M patients:

| Query | Clinic Patients | Index | Time |
|-------|-----------------|-------|------|
| ABHA Number | 1 | idx_abha_map_number | 1ms |
| Mobile+DOB+Name | ~1 (avg) | idx_emr_patients_mobile_dob_name | 2-3ms |
| Mobile+Name | ~10 (avg) | idx_emr_patients_mobile_name | 2-3ms |

**If queries exceed 5ms:**
1. Check index fragmentation: `REINDEX INDEX idx_name;`
2. Analyze table: `ANALYZE emr_patients;`
3. Check query plan: `EXPLAIN ANALYZE SELECT ...;`

---

## Future Enhancements

Consider these improvements post-v2.0:

1. **Fuzzy Name Matching** (Levenshtein distance)
   - Match "Rajesh" ≈ "Raj" at Level 2.5
   - Requires `pg_trgm` extension

2. **ML-Based Matching**
   - Train model on confirmed matches
   - Predict confidence dynamically
   - A/B test against rule-based system

3. **Consent-Based Linking**
   - When patient consents, automatically link ABHA
   - Update phone/demographics from ABDM
   - Flag previous duplicates for merge

4. **Merge Patient Records**
   - UI tool for merging duplicate patients
   - Safely consolidate care contexts
   - Maintain referential integrity

---

## Contact & Questions

For questions about this redesign:
- Review PATIENT_MATCHING_REDESIGN.md (design rationale)
- Check patient-match.service.v2.js (implementation details)
- Run tests: npm test -- patient-matching*

For deployment issues:
- Check logs: `docker-compose logs backend`
- Review recent commits
- Contact: prateek.sharma6@globallogic.com
