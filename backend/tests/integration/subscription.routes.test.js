const request = require('supertest');
const express = require('express');
const subscriptionRoutes = require('../../src/routes/subscription.routes');
const EffectiveLicenseResolver = require('../../src/services/subscription/EffectiveLicenseResolver');

jest.mock('../../src/services/subscription/EffectiveLicenseResolver');
jest.mock('../../src/utils/logger');

describe('Subscription API Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req, res, next) => {
      req.emrUser = { clinicId: 1, staffId: 10 };
      next();
    });

    app.use('/subscription', subscriptionRoutes);
  });

  describe('GET /subscription/license', () => {
    it('should return EffectiveLicense for authenticated user', async () => {
      const mockLicense = {
        clinicId: 1,
        staffId: 10,
        plan: 'pro',
        status: 'active',
        subscriptionValid: true,
        planFeatures: { billing: true },
      };

      EffectiveLicenseResolver.resolveEffectiveLicense = jest.fn()
        .mockResolvedValueOnce(mockLicense);

      const res = await request(app).get('/subscription/license');

      expect(res.status).toBe(200);
      expect(res.body.plan).toBe('pro');
      expect(res.body.clinicId).toBe(1);
    });

    it('should return 500 on resolution error', async () => {
      EffectiveLicenseResolver.resolveEffectiveLicense = jest.fn()
        .mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app).get('/subscription/license');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('subscription_error');
    });

    it('should return 401 if clinic/staff missing', async () => {
      app = express();
      app.use(express.json());
      
      // No authentication middleware
      app.use('/subscription', subscriptionRoutes);

      const res = await request(app).get('/subscription/license');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /subscription/payment-history', () => {
    it('should return payment history', async () => {
      const BillingService = require('../../src/services/subscription/BillingService');
      jest.spyOn(BillingService, 'getPaymentHistory')
        .mockResolvedValueOnce([
          { id: 1, plan_key: 'pro', amount: 2999, status: 'captured' },
        ]);

      const res = await request(app).get('/subscription/payment-history');

      expect(res.status).toBe(200);
      expect(res.body.payments).toBeDefined();
    });
  });

  describe('GET /subscription/proration', () => {
    it('should calculate proration', async () => {
      const BillingService = require('../../src/services/subscription/BillingService');
      jest.spyOn(BillingService, 'calculateProration')
        .mockResolvedValueOnce({
          fromPlan: 'base',
          toPlan: 'pro',
          proratedAmount: 1000,
        });

      const res = await request(app)
        .get('/subscription/proration')
        .query({ fromPlan: 'base', toPlan: 'pro', billingCycle: 'monthly' });

      expect(res.status).toBe(200);
      expect(res.body.proratedAmount).toBe(1000);
    });

    it('should return 400 if plans missing', async () => {
      const res = await request(app).get('/subscription/proration');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });
  });

  describe('POST /subscription/create-order', () => {
    it('should create payment order', async () => {
      const BillingService = require('../../src/services/subscription/BillingService');
      jest.spyOn(BillingService, 'createPaymentOrder')
        .mockResolvedValueOnce({
          id: 1,
          clinic_id: 1,
          plan_key: 'pro',
          amount_paise: 299900,
        });

      const res = await request(app)
        .post('/subscription/create-order')
        .send({ planKey: 'pro', billingCycle: 'monthly' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.order).toBeDefined();
    });

    it('should return 400 if planKey missing', async () => {
      const res = await request(app)
        .post('/subscription/create-order')
        .send({ billingCycle: 'monthly' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });
  });
});
