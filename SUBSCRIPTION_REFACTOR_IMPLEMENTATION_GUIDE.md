# Subscription Engine Refactoring - Implementation Guide
**Date:** 2026-06-29  
**Phase:** 2-7 Implementation  
**Status:** READY FOR IMPLEMENTATION

---

## OVERVIEW

This guide shows how to refactor existing controllers and routes to use the new centralized subscription engine.

**Key Principle:** Controllers never validate subscriptions directly. They use `req.effectiveLicense` provided by middleware.

---

## PHASE 3 IMPLEMENTATION: Apply Middleware to Routes

### Step 1: Import Middleware

```javascript
// backend/src/routes/emr.routes.js (or wherever routes are defined)

const {
  enforceSubscription,
  enforceFeature,
  enforceUsageLimit,
  enforceSeatType,
  enforceAiCredits,
  logSubscriptionDecisions,
} = require('../middleware/subscriptionEnforcement');

const subscriptionEnforcement = require('../middleware/subscriptionEnforcement');
```

### Step 2: Apply Universal Middleware

```javascript
// Apply to ALL protected endpoints
router.use('/api', enforceSubscription());
router.use('/api', logSubscriptionDecisions());

// Now add feature-specific middleware for specific endpoints
```

### Step 3: Protect Specific Routes

**Example 1: Patient Management**
```javascript
// Before:
router.post('/api/patients', requireAuth, createPatient);

// After:
router.post('/api/patients', 
  requireAuth,
  enforceFeature('patient_management'),  // Check feature available
  enforceUsageLimit('patients'),          // Check not over limit
  createPatient
);
```

**Example 2: Prescriptions (Premium seat only)**
```javascript
// Before:
router.post('/api/prescriptions', requireAuth, createPrescription);

// After:
router.post('/api/prescriptions',
  requireAuth,
  enforceFeature('prescriptions'),
  enforceSeatType('premium'),             // Only premium can prescribe
  enforceUsageLimit('prescriptions'),
  createPrescription
);
```

**Example 3: AI Features**
```javascript
// Before:
router.post('/api/ai/docassist', requireAuth, docAssistHandler);

// After:
router.post('/api/ai/docassist',
  requireAuth,
  enforceFeature('ai_docassist'),
  enforceAiCredits(1),                    // Requires 1 AI credit
  docAssistHandler
);
```

**Example 4: Pro-Only Features**
```javascript
router.post('/api/reports', 
  requireAuth,
  enforceFeature('analytics'),
  createReport
);
```

---

## PHASE 4 IMPLEMENTATION: Refactor Controllers

### Before: Controller Has Subscription Logic

```javascript
// ❌ OLD PATTERN - DON'T DO THIS ANYMORE
const createPatient = async (req, res) => {
  try {
    const clinicId = req.emrUser.clinic_id;
    
    // ❌ Controller checking subscription
    const sub = await pool.query(
      `SELECT * FROM clinic_subscriptions WHERE clinic_id = $1`
    );
    if (!sub.rows.length) throw new Error('No subscription');
    
    // ❌ Controller checking limits
    const { rows: [usage] } = await pool.query(
      `SELECT COUNT(*) FROM emr_appointments WHERE clinic_id = $1`
    );
    if (usage.count >= sub.rows[0].max_patients) {
      return res.status(402).json({ error: 'Limit reached' });
    }
    
    // Finally: business logic
    const patient = await createPatientRecord(req.body, clinicId);
    res.status(201).json(patient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
```

### After: Controller Uses Effective License

```javascript
// ✅ NEW PATTERN - USE THIS
const createPatient = async (req, res) => {
  try {
    const clinicId = req.emrUser.clinic_id;
    
    // ✅ Middleware already validated subscription and limits
    // ✅ Just use req.effectiveLicense for reference if needed
    
    // Get limit from effective license
    const patientLimit = req.effectiveLicense.limits.maxPatients;
    const patientsUsed = req.effectiveLicense.usage.patients.used;
    
    // Log the usage context
    logger.info(`[createPatient] Clinic ${clinicId}, using ${patientsUsed}/${patientLimit} patients`);
    
    // Create patient
    const patient = await createPatientRecord(req.body, clinicId);
    
    res.status(201).json(patient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
```

---

## PHASE 5 IMPLEMENTATION: Refactor Staff Controller

### Step 1: Import Services

```javascript
// backend/src/emr/emr.staff.controller.js

const SeatService = require('../services/subscription/SeatService');
const FeatureAccessService = require('../services/subscription/FeatureAccessService');
```

### Step 2: Refactor createStaff

```javascript
// ✅ NEW IMPLEMENTATION
const createStaff = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  
  const {
    name, email, password, role = 'staff',
    seat_type = 'basic', // NEW: Allow specifying seat type
    ...otherFields
  } = req.body;

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'name, email, password required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password minimum 8 characters' });
  }

  const clinicId = req.emrUser.clinic_id;

  try {
    // ✅ NEW: Validate seat availability BEFORE creating staff
    try {
      await SeatService.validateSeatAvailable(clinicId, seat_type);
    } catch (err) {
      if (err.code === 'SEAT_LIMIT_EXCEEDED') {
        return res.status(402).json({
          error: 'seat_limit_exceeded',
          seatType: err.seatType,
          limit: err.limit,
          used: err.used,
          message: `No available ${err.seatType} seats. Limit: ${err.limit}, Used: ${err.used}`,
        });
      }
      throw err;
    }

    // Create staff
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { rows } = await pool.query(
      `INSERT INTO emr_clinic_staff
         (clinic_id, name, email, password_hash, role, seat_type, ...)
       VALUES ($1,$2,$3,$4,$5,$6,...)
       RETURNING id, name, email, role, seat_type, created_at`,
      [clinicId, name.trim(), email.trim().toLowerCase(), hash, role, seat_type, ...]
    );

    // Log activity
    logActivity({
      req,
      action: 'STAFF_CREATED',
      resource: 'staff',
      resourceId: rows[0].id,
      details: { 
        name: rows[0].name, 
        role: rows[0].role,
        seatType: rows[0].seat_type  // ✅ NEW: Log seat type
      },
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    throw err;
  }
};
```

### Step 3: Refactor Login with Seat Validation

```javascript
// ✅ NEW: Login with seat checking
const loginWithSeatCheck = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Authenticate
    const staff = await authenticateStaff(email, password);
    const { clinic_id, id: staff_id, is_active, seat_type } = staff;

    if (!is_active) {
      return res.status(403).json({ error: 'account_disabled' });
    }

    // ✅ NEW: Check seat availability before allowing login
    try {
      await SeatService.validateConcurrentSessionLimit(
        staff_id,
        clinic_id,
        seat_type || 'basic'
      );
    } catch (err) {
      if (err.code === 'CONCURRENT_SESSION_LIMIT') {
        return res.status(403).json({
          error: 'concurrent_session_limit',
          message: `Your seat type allows ${err.limit} concurrent sessions, but you have ${err.active} active.`,
        });
      }
      throw err;
    }

    // ✅ NEW: Create login session
    const session = await SeatService.createLoginSession(
      clinic_id,
      staff_id,
      seat_type || 'basic',
      req.ip,
      req.get('user-agent')
    );

    // Generate JWT
    const token = jwt.sign({ staff_id, clinic_id, session_id: session.id }, process.env.JWT_SECRET);

    res.json({
      token,
      clinic_id,
      staff_id,
      message: 'Login successful',
    });
  } catch (err) {
    logger.error('[login] failed:', err.message);
    res.status(401).json({ error: 'Login failed', detail: err.message });
  }
};
```

### Step 4: Logout with Session Cleanup

```javascript
// ✅ NEW: Logout and end session
const logout = async (req, res) => {
  const { session_id } = req.emrUser;

  try {
    if (session_id) {
      await SeatService.endLoginSession(session_id);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error('[logout] failed:', err.message);
    res.status(500).json({ error: 'Logout failed' });
  }
};
```

---

## PHASE 6 IMPLEMENTATION: AI Credit Deduction

### Step 1: Import Credit Service

```javascript
// backend/src/services/ai/docAssist.handler.js

const CreditService = require('../subscription/CreditService');
const EffectiveLicenseResolver = require('../subscription/EffectiveLicenseResolver');
```

### Step 2: Refactor AI Handler

```javascript
// ✅ BEFORE: Deduct credits unconditionally
// ❌ DON'T DO THIS
const handleDocAssist = async (clinicId, staffId, prompt) => {
  const response = await callAI(prompt); // Make AI call
  await deductCredits(clinicId, staffId, 1); // Deduct regardless of result
  return response;
};

// ✅ AFTER: Deduct credits only on success
const docAssistHandler = async (req, res) => {
  try {
    const clinicId = req.emrUser.clinic_id;
    const staffId = req.emrUser.id;
    const { prompt } = req.body;

    // Generate unique request ID for idempotency
    const requestId = CreditService.generateRequestId(clinicId, 'ai_docassist');

    // Middleware already checked credits via enforceAiCredits()
    // Now execute AI call
    let aiResponse;
    try {
      aiResponse = await callAI(prompt);
    } catch (aiError) {
      // ✅ AI CALL FAILED - DO NOT DEDUCT CREDITS
      logger.error('[docAssist] AI call failed:', aiError.message);
      return res.status(500).json({
        error: 'ai_call_failed',
        message: 'AI service error. No credits deducted.',
      });
    }

    // ✅ AI CALL SUCCEEDED - NOW DEDUCT CREDITS
    try {
      await CreditService.deductCredits(
        req.effectiveLicense.walletId,
        'ai_docassist',
        1,
        requestId,
        { prompt: prompt.substring(0, 100) } // Log partial prompt for audit
      );
    } catch (creditError) {
      // Credit deduction failed
      // Option 1: Return error to user (conservative)
      // Option 2: Log and return success anyway (risking revenue loss)
      logger.error('[docAssist] Credit deduction failed:', creditError.message);
      return res.status(500).json({
        error: 'credit_deduction_failed',
        message: 'Credits could not be deducted. Please contact support.',
        response: aiResponse, // But return the AI response anyway
      });
    }

    // ✅ SUCCESS: Return response
    res.json({
      response: aiResponse,
      creditsUsed: 1,
      creditsRemaining: req.effectiveLicense.aiCreditsRemaining - 1,
    });
  } catch (err) {
    logger.error('[docAssistHandler] failed:', err.message);
    res.status(500).json({ error: 'Handler error' });
  }
};
```

---

## PHASE 7 IMPLEMENTATION: Universal Middleware Application

### Step 1: Middleware Registration

```javascript
// backend/src/server.js or app.js

const express = require('express');
const { enforceSubscription, logSubscriptionDecisions } = require('./middleware/subscriptionEnforcement');

const app = express();

// Setup routes
app.use(express.json());
app.use(require('./middleware/auth')); // Authentication must run first

// ✅ Apply subscription enforcement to ALL /api routes
app.use('/api', enforceSubscription());
app.use('/api', logSubscriptionDecisions());

// Load routes
app.use('/api/patients', require('./routes/patients.routes'));
app.use('/api/appointments', require('./routes/appointments.routes'));
app.use('/api/prescriptions', require('./routes/prescriptions.routes'));
app.use('/api/reports', require('./routes/reports.routes'));
app.use('/api/ai', require('./routes/ai.routes'));
// ... all other routes
```

### Step 2: Route-Level Middleware

```javascript
// backend/src/routes/prescriptions.routes.js

const {
  enforceSubscription,
  enforceFeature,
  enforceSeatType,
  enforceUsageLimit,
} = require('../middleware/subscriptionEnforcement');

const router = require('express').Router();

// Create prescription - requires premium seat, feature, and usage limit
router.post('/',
  enforceFeature('prescriptions'),
  enforceSeatType('premium'),
  enforceUsageLimit('prescriptions'),
  prescriptionController.createPrescription
);

// Export prescription - pro feature only
router.get('/:id/export',
  enforceFeature('export'),
  prescriptionController.exportPrescription
);

module.exports = router;
```

---

## PHASE 8 IMPLEMENTATION: Database Migration

### Step 1: Run Migration

```bash
# From project root
psql -U postgres -d infer_db -f backend/migrations/027_subscription_enforcement_tables.sql

# Or use migration runner if you have one
npm run migrate:up 027_subscription_enforcement_tables.sql
```

### Step 2: Verify Tables Created

```sql
-- Verify from psql
\dt clinic_active_sessions
\dt subscription_audit_log
\dt subscription_webhook_log

-- Check seat_type column was added
\d emr_clinic_staff
```

---

## MIGRATION STRATEGY

### Phase A: Create New Code (No Breaking Changes)

1. ✅ Create subscription services (done)
2. ✅ Create middleware (done)
3. ✅ Create database tables (done)
4. ✅ Services coexist with old code

### Phase B: Apply Incrementally

1. Pick one endpoint (e.g., `/api/patients`)
2. Add middleware to that endpoint
3. Test thoroughly
4. Move to next endpoint
5. Repeat until all protected endpoints covered

### Phase C: Decommission Old Code

1. Remove old subscription checks from controllers
2. Delete old validation code
3. Update tests to use effective license

### Phase D: Cleanup

1. Remove legacy subscription columns (if any)
2. Archive old subscription code to `backend/deprecated/`
3. Update documentation

---

## TESTING STRATEGY

### Unit Tests

```javascript
// test/services/SeatService.test.js
describe('SeatService', () => {
  it('should reject staff creation when seat limit reached', async () => {
    const clinicId = 1;
    const seatType = 'premium';
    
    // Clinic has 1 premium seat, already used
    // Try to create 2nd premium staff
    expect(() => SeatService.validateSeatAvailable(clinicId, seatType))
      .toThrow('SEAT_LIMIT_EXCEEDED');
  });

  it('should create session for available seats', async () => {
    const clinicId = 1;
    const staffId = 10;
    const seatType = 'premium';
    
    // 2 seats available, staff creates session
    const session = await SeatService.createLoginSession(
      clinicId, staffId, seatType, '192.168.1.1', 'Mozilla'
    );
    
    expect(session.id).toBeDefined();
    expect(session.seat_type).toBe('premium');
  });
});
```

### Integration Tests

```javascript
// test/integration/subscription.integration.test.js
describe('Subscription Enforcement', () => {
  it('should reject patient creation when limit reached', async () => {
    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'John Doe', ... });
    
    // Already at 100 patient limit
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('usage_limit_exceeded');
  });

  it('should reject pro features on base plan', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${baseToken}`)
      .send({ ... });
    
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('feature_access_denied');
  });
});
```

### E2E Tests

```javascript
// test/e2e/subscription.e2e.test.js
describe('End-to-End Subscription', () => {
  it('should reject login when seat limit reached', async () => {
    // 1. Clinic with 1 premium seat
    // 2. Staff 1 logs in → succeeds
    // 3. Staff 2 tries to log in → rejected
    // 4. Staff 1 logs out
    // 5. Staff 2 logs in → succeeds
    
    // Login 1
    let res = await request(app).post('/auth/login').send(staff1Creds);
    expect(res.status).toBe(200);
    const token1 = res.body.token;
    
    // Login 2 (should fail - seat limit)
    res = await request(app).post('/auth/login').send(staff2Creds);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('concurrent_session_limit');
    
    // Logout 1
    res = await request(app).post('/auth/logout')
      .set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(200);
    
    // Login 2 (should succeed now)
    res = await request(app).post('/auth/login').send(staff2Creds);
    expect(res.status).toBe(200);
  });
});
```

---

## DEPLOYMENT CHECKLIST

- [ ] All 4 services created and tested
- [ ] Middleware created and tested
- [ ] Database migration executed
- [ ] Existing staff controller refactored
- [ ] Login refactored with seat checking
- [ ] AI handler refactored with credit logic
- [ ] All protected routes have middleware
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] E2E tests written and passing
- [ ] Performance tested (high-volume seats)
- [ ] Fallback behavior tested (DB down, etc)
- [ ] Backward compatibility verified
- [ ] Documentation updated
- [ ] Team trained on new system

---

## ROLLBACK PLAN

If critical issues discovered post-deployment:

1. Disable new middleware: comment out `enforceSubscription()` in app.js
2. Revert database: `psql ... < rollback_027.sql`
3. Revert controller changes: `git checkout backend/src/emr/emr.staff.controller.js`
4. Investigate issue
5. Fix and re-test
6. Re-deploy

---

## MONITORING & ALERTS

Monitor these metrics post-deployment:

1. **Subscription validation failures** - should be <0.1%
2. **Seat limit rejections** - normal spike on plan changes
3. **Credit deduction failures** - must be investigated
4. **Middleware latency** - should be <50ms per request
5. **Webhook processing failures** - must be <1%
6. **Concurrent session limits hit** - indicates seat shortage

