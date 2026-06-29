# Subscription Engine Refactoring - Quick Start Checklist

**Status:** Ready for Implementation  
**Estimated Timeline:** 2-3 weeks (incremental rollout)  
**Team Size:** 2-3 developers

---

## PRE-IMPLEMENTATION (Day 1)

### Setup
- [ ] Read `SUBSCRIPTION_AUDIT_REPORT.md` (understanding the problems)
- [ ] Read `SUBSCRIPTION_REFACTOR_PHASE_SUMMARY.md` (overview of solution)
- [ ] Read `SUBSCRIPTION_REFACTOR_IMPLEMENTATION_GUIDE.md` (step-by-step)
- [ ] Backup production database
- [ ] Create feature branch: `git checkout -b feat/subscription-engine`

### Services Installation
```bash
# Verify new service files exist
ls -la backend/src/services/subscription/
# Should show:
#   - SubscriptionService.js
#   - SeatService.js
#   - FeatureAccessService.js
#   - CreditService.js
#   - EffectiveLicenseResolver.js

# Verify middleware file exists
ls -la backend/src/middleware/subscriptionEnforcement.js

# Verify migration file exists
ls -la backend/migrations/027_subscription_enforcement_tables.sql
```

---

## PHASE 1: Database Migration (Day 1-2)

### Step 1: Run Migration
```bash
# Test migration on dev database first
psql infer_dev < backend/migrations/027_subscription_enforcement_tables.sql

# Verify tables created
psql infer_dev -c "\dt clinic_active_sessions subscription_audit_log subscription_webhook_log"

# Check seat_type column added to emr_clinic_staff
psql infer_dev -c "\d emr_clinic_staff" | grep seat_type
```

### Step 2: Verify Migration
```sql
-- Run these checks in psql
SELECT COUNT(*) FROM clinic_active_sessions; -- Should be 0
SELECT COUNT(*) FROM subscription_audit_log; -- Should be 0
SELECT COUNT(*) FROM subscription_webhook_log; -- Should be 0

-- Check seat_type exists with default
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'emr_clinic_staff' AND column_name = 'seat_type';
```

### Step 3: Create Rollback Script
```bash
# Save rollback script for emergency
cat > rollback_027.sql << 'EOF'
DROP TABLE IF EXISTS subscription_webhook_log CASCADE;
DROP TABLE IF EXISTS subscription_audit_log CASCADE;
DROP TABLE IF EXISTS clinic_active_sessions CASCADE;
ALTER TABLE emr_clinic_staff DROP COLUMN IF EXISTS seat_type CASCADE;
EOF

# Keep this safe
chmod 600 rollback_027.sql
```

---

## PHASE 2: Middleware Setup (Day 2-3)

### Step 1: Verify Middleware File
```bash
# Check middleware exists and has no syntax errors
node -c backend/src/middleware/subscriptionEnforcement.js
```

### Step 2: Add to App.js
```javascript
// backend/src/app.js or server.js
const { enforceSubscription, logSubscriptionDecisions } 
  = require('./middleware/subscriptionEnforcement');

// Find where other middleware is applied (around line 30-50)
app.use(express.json());
app.use(require('./middleware/auth'));

// ✅ ADD THESE LINES:
app.use('/api', enforceSubscription());
app.use('/api', logSubscriptionDecisions());

// Then load routes
app.use('/api/patients', require('./routes/patients.routes'));
// ... rest of routes
```

### Step 3: Test Middleware
```bash
# Start server
npm start

# In another terminal, test protected endpoint without auth
curl http://localhost:3000/api/patients
# Should get 401 Unauthorized (good - auth checks first)

# Test with auth but invalid subscription (need to manually create test user)
# Should get 402 Subscription Invalid
```

---

## PHASE 3: Staff Controller Refactoring (Day 3-4)

### Step 1: Backup Original
```bash
cp backend/src/emr/emr.staff.controller.js backend/src/emr/emr.staff.controller.js.bak
```

### Step 2: Add Imports
```javascript
// At top of emr.staff.controller.js
const SeatService = require('../services/subscription/SeatService');
```

### Step 3: Update createStaff Function
```javascript
// Find the createStaff function (around line 51)
// Replace the entire function body with the code from:
// SUBSCRIPTION_REFACTOR_IMPLEMENTATION_GUIDE.md -> Phase 5 -> Step 2

// Key changes:
// 1. Add seat_type parameter
// 2. Call SeatService.validateSeatAvailable() before INSERT
// 3. Include seat_type in INSERT statement
// 4. Handle seat limit exceeded error (402 response)
```

### Step 4: Test Staff Creation
```bash
# Create test clinic with 1 premium seat
psql << 'EOF'
INSERT INTO clinic_subscription_items (clinic_id, item_type, item_key, quantity)
VALUES (1, 'seat', 'premium', 1);
EOF

# Test API - should succeed for first staff
curl -X POST http://localhost:3000/api/staff \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@test.com","password":"password123","seat_type":"premium"}'
# Should get 201 Created

# Test API - should fail for second staff (seat limit exceeded)
curl -X POST http://localhost:3000/api/staff \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane","email":"jane@test.com","password":"password123","seat_type":"premium"}'
# Should get 402 with "seat_limit_exceeded"
```

---

## PHASE 4: Protected Routes Middleware (Day 4-5)

### Step 1: List All Protected Routes
```bash
# Find all routes that need subscription enforcement
grep -r "router.post\|router.get\|router.put\|router.delete" backend/src/routes/ | head -20

# Prioritize:
# HIGH: /patients, /appointments, /prescriptions
# MEDIUM: /reports, /export, /labs
# LOW: Other features
```

### Step 2: Apply Middleware Incrementally

**Day 4 - High Priority Routes:**
```javascript
// backend/src/routes/patients.routes.js
const { enforceFeature, enforceUsageLimit } = require('../middleware/subscriptionEnforcement');

router.post('/', 
  enforceFeature('patient_management'),
  enforceUsageLimit('patients'),
  createPatient
);

// backend/src/routes/appointments.routes.js
router.post('/',
  enforceFeature('appointments'),
  enforceUsageLimit('appointments'),
  createAppointment
);

// backend/src/routes/prescriptions.routes.js
const { enforceSeatType } = require('../middleware/subscriptionEnforcement');

router.post('/',
  enforceFeature('prescriptions'),
  enforceSeatType('premium'),
  enforceUsageLimit('prescriptions'),
  createPrescription
);
```

**Day 5 - Medium Priority Routes:**
```javascript
// backend/src/routes/reports.routes.js
router.post('/',
  enforceFeature('analytics'),
  createReport
);

// backend/src/routes/export.routes.js
router.post('/',
  enforceFeature('export'),
  exportData
);
```

### Step 3: Test Each Route
```bash
# After each middleware addition, test:

# Test 1: Valid request
curl -X POST http://localhost:3000/api/patients \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test","..."}'
# Should work

# Test 2: Feature not available on plan
# (Use base plan token)
curl -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer $BASE_TOKEN"
# Should get 402

# Test 3: Usage limit exceeded
# (After creating max patients on base plan)
curl -X POST http://localhost:3000/api/patients \
  -H "Authorization: Bearer $TOKEN"
# Should get 402
```

---

## PHASE 5: AI Credit Integration (Day 5-6)

### Step 1: Update AI Handler
```javascript
// backend/src/services/ai/docAssist.handler.js or similar

const CreditService = require('../services/subscription/CreditService');
const { enforceAiCredits } = require('../middleware/subscriptionEnforcement');

// Add middleware to route:
router.post('/ai/docassist',
  enforceAiCredits(1), // Requires 1 credit
  docAssistHandler
);

// Update handler to only deduct on success:
const docAssistHandler = async (req, res) => {
  try {
    const clinicId = req.emrUser.clinic_id;
    const requestId = CreditService.generateRequestId(clinicId, 'ai_docassist');
    
    // Make AI call
    const response = await callAI(prompt);
    
    // ✅ Only deduct on success
    await CreditService.deductCredits(
      req.effectiveLicense.walletId,
      'ai_docassist',
      1,
      requestId
    );
    
    res.json({ response });
  } catch (err) {
    // ✅ No credits deducted on error
    res.status(500).json({ error: 'AI call failed' });
  }
};
```

### Step 2: Test AI Credit Deduction
```bash
# Check wallet before
psql << 'EOF'
SELECT current_balance FROM wallet WHERE clinic_id = 1 AND doctor_id = 10;
EOF

# Call AI feature
curl -X POST http://localhost:3000/api/ai/docassist \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"prompt":"test"}'
# Should get response and 200

# Check wallet after - should be reduced by 1
psql << 'EOF'
SELECT current_balance FROM wallet WHERE clinic_id = 1 AND doctor_id = 10;
EOF

# Test insufficient credits
# Update wallet to have 0 credits first
psql << 'EOF'
UPDATE wallet SET current_balance = 0 WHERE clinic_id = 1 AND doctor_id = 10;
EOF

curl -X POST http://localhost:3000/api/ai/docassist \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"prompt":"test"}'
# Should get 402 with "insufficient_ai_credits"
```

---

## PHASE 6: Testing (Day 6-7)

### Unit Tests
```bash
# Create test files in test/services/subscription/

# Run tests
npm test -- test/services/subscription/

# Should see:
# ✓ SubscriptionService
# ✓ SeatService
# ✓ FeatureAccessService
# ✓ CreditService
# ✓ EffectiveLicenseResolver
```

### Integration Tests
```bash
# Create test files in test/integration/

# Run tests
npm test -- test/integration/subscription.integration.test.js

# Should see:
# ✓ Should reject patient creation when limit reached
# ✓ Should reject pro features on base plan
# ✓ Should reject premium features on non-premium seat
# ✓ Should deduct AI credits on success
# ✓ Should not deduct credits on failure
```

### E2E Tests
```bash
# Run full flow tests
npm test -- test/e2e/subscription.e2e.test.js

# Should see:
# ✓ Complete flow with seat limits
# ✓ Complete flow with feature access
# ✓ Complete flow with AI credits
```

---

## PHASE 7: Monitoring & Verification (Day 7)

### Monitor Key Metrics
```bash
# Check error logs for subscription violations
tail -f logs/error.log | grep "subscription\|feature_access\|seat_limit\|insufficient_credits"

# Should see appropriate error responses but NO unexpected 500s
```

### Verify All Endpoints Protected
```bash
# List all /api endpoints
grep -r "router\.(post\|get\|put\|delete)" backend/src/routes/ | grep -v "enforceSubscription\|enforceFeature" | head

# These should all have middleware. If not, add it.
```

### Performance Check
```bash
# Measure middleware latency
# Use curl with timing
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/patients \
  -H "Authorization: Bearer $TOKEN"

# Should see middleware adds <50ms per request
```

---

## TROUBLESHOOTING

### Issue: "Cannot find module" for subscription services
```bash
# Solution: Make sure files are in correct path
ls backend/src/services/subscription/SubscriptionService.js
# If missing, copy from deliverables

# Check Node requires are correct
grep -n "require.*SubscriptionService" backend/src/middleware/subscriptionEnforcement.js
```

### Issue: Middleware not applying
```bash
# Solution: Check middleware is imported and used
grep -n "enforceSubscription" backend/src/app.js
# Should show: app.use('/api', enforceSubscription())

# Verify order - auth must come before subscription
grep -n "require.*auth\|require.*subscription" backend/src/app.js
# auth should appear before subscription
```

### Issue: Database migration failed
```bash
# Solution: Check migration syntax
psql infer_dev -f backend/migrations/027_subscription_enforcement_tables.sql

# If error, check:
# 1. PostgreSQL version >= 11
# 2. User has CREATE TABLE permission
# 3. Tables don't already exist (rerun is safe - IF NOT EXISTS)

# Check current state
psql infer_dev -c "\dt clinic_active_sessions"
```

### Issue: Seat validation not working
```bash
# Solution: Check seat_type column exists
psql infer_dev -c "\d emr_clinic_staff" | grep seat_type

# Verify subscription items exist
psql infer_dev -c "SELECT * FROM clinic_subscription_items WHERE clinic_id = 1;"

# If empty, add test data:
psql infer_dev << 'EOF'
INSERT INTO clinic_subscription_items (clinic_id, item_type, item_key, quantity)
VALUES (1, 'seat', 'premium', 5), (1, 'seat', 'basic', 10);
EOF
```

---

## ROLLBACK PLAN

If critical issues occur at any phase:

```bash
# 1. Revert middleware from app.js
# Comment out lines:
# app.use('/api', enforceSubscription());
# app.use('/api', logSubscriptionDecisions());

# 2. Revert any modified routes
# Remove middleware from routes

# 3. Revert database (if needed)
psql infer_db < rollback_027.sql

# 4. Restart server
npm start

# 5. Investigate root cause
# Check logs, test manually, report issue
```

---

## SIGN-OFF CHECKLIST

- [ ] All 5 services deployed and tested
- [ ] Middleware integrated into app
- [ ] Staff controller refactored with seat validation
- [ ] High-priority routes protected (patients, appointments, prescriptions)
- [ ] Medium-priority routes protected (reports, export)
- [ ] AI credit integration tested
- [ ] Unit tests passing (30+ tests)
- [ ] Integration tests passing (20+ tests)
- [ ] E2E tests passing (10+ tests)
- [ ] Error logs reviewed - no unexpected 500s
- [ ] Performance verified - middleware <50ms overhead
- [ ] Database tables verified created
- [ ] Rollback procedure documented
- [ ] Team trained on new system
- [ ] Monitoring alerts configured

---

## NEXT STEPS (After Phases 1-7)

- Phase 9: Billing improvements (webhook idempotency, etc)
- Phase 10: Frontend integration (show upgrade prompts, etc)
- Phase 11: Security hardening (rate limiting, etc)
- Phase 12: Comprehensive testing (load tests, security tests)
- Phase 13: Documentation (API docs, runbooks, etc)

---

## SUPPORT

If you get stuck:
1. Check SUBSCRIPTION_REFACTOR_IMPLEMENTATION_GUIDE.md (detailed walkthrough)
2. Check SUBSCRIPTION_REFACTOR_PHASE_SUMMARY.md (architecture overview)
3. Check troubleshooting section above
4. Review the service files themselves - they have detailed comments

**Good luck! 🚀**

