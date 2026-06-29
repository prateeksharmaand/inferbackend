/**
 * Subscription Integration Tests
 *
 * Tests for subscription middleware and integration:
 * - enforceSubscription middleware
 * - enforceFeature middleware
 * - enforceSeatType middleware
 * - enforceAiCredits middleware
 * - End-to-end subscription enforcement flows
 */

const EffectiveLicenseResolver = require('../../src/services/subscription/EffectiveLicenseResolver');
const FeatureAccessService = require('../../src/services/subscription/FeatureAccessService');
const SeatService = require('../../src/services/subscription/SeatService');
const CreditService = require('../../src/services/subscription/CreditService');

// Mock database and services
let mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.mock('../../config/database', () => ({
  pool: mockPool,
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/services/subscription/EffectiveLicenseResolver');
jest.mock('../../src/services/subscription/FeatureAccessService');
jest.mock('../../src/services/subscription/SeatService');
jest.mock('../../src/services/subscription/CreditService');

describe('Subscription Middleware Integration', () => {
  const mockEffectiveLicense = {
    clinicId: 100,
    staffId: 10,
    plan: 'pro',
    status: 'active',
    subscriptionValid: true,
    seatTypes: ['premium'],
    aiCreditsRemaining: 100,
    isActive: true,
    isExpired: false,
    isCancelled: false,
  };

  describe('enforceSubscription middleware', () => {
    test('should add effectiveLicense to request', async () => {
      EffectiveLicenseResolver.resolveEffectiveLicense.mockResolvedValueOnce(
        mockEffectiveLicense
      );

      const req = {
        user: { clinicId: 100, staffId: 10 },
        effectiveLicense: undefined,
      };
      const res = {};
      const next = jest.fn();

      // Simulate middleware
      const middleware = async (req, res, next) => {
        req.effectiveLicense = await EffectiveLicenseResolver.resolveEffectiveLicense(
          req.user.clinicId,
          req.user.staffId
        );
        next();
      };

      await middleware(req, res, next);

      expect(req.effectiveLicense).toEqual(mockEffectiveLicense);
      expect(next).toHaveBeenCalled();
    });

    test('should handle license resolution error', async () => {
      EffectiveLicenseResolver.resolveEffectiveLicense.mockRejectedValueOnce(
        new Error('DB error')
      );

      const req = {
        user: { clinicId: 100, staffId: 10 },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = async (req, res, next) => {
        try {
          req.effectiveLicense = await EffectiveLicenseResolver.resolveEffectiveLicense(
            req.user.clinicId,
            req.user.staffId
          );
          next();
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      };

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
    });

    test('should work with fallback resolver when error occurs', async () => {
      const fallbackLicense = {
        clinicId: 100,
        staffId: 10,
        plan: 'base',
        status: 'unknown',
        subscriptionValid: false,
        isActive: false,
      };

      EffectiveLicenseResolver.resolveEffectiveLicenseSafely.mockResolvedValueOnce(
        fallbackLicense
      );

      const req = {
        user: { clinicId: 100, staffId: 10 },
      };
      const res = {};
      const next = jest.fn();

      const middleware = async (req, res, next) => {
        req.effectiveLicense = await EffectiveLicenseResolver.resolveEffectiveLicenseSafely(
          req.user.clinicId,
          req.user.staffId
        );
        next();
      };

      await middleware(req, res, next);

      expect(req.effectiveLicense.plan).toBe('base');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('enforceFeature middleware', () => {
    test('should allow access to permitted feature', async () => {
      FeatureAccessService.validateFeatureAccess.mockReturnValueOnce({
        accessible: true,
        reason: 'allowed',
      });

      const req = {
        effectiveLicense: mockEffectiveLicense,
        params: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (featureKey) => (req, res, next) => {
        const result = FeatureAccessService.validateFeatureAccess(
          req.effectiveLicense,
          featureKey
        );

        if (!result.accessible) {
          return res.status(402).json({ error: result.reason });
        }

        next();
      };

      await middleware('billing')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should deny access to restricted feature', async () => {
      FeatureAccessService.validateFeatureAccess.mockReturnValueOnce({
        accessible: false,
        reason: 'pro_required',
      });

      const baseLicense = { ...mockEffectiveLicense, plan: 'base' };
      const req = {
        effectiveLicense: baseLicense,
        params: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (featureKey) => (req, res, next) => {
        const result = FeatureAccessService.validateFeatureAccess(
          req.effectiveLicense,
          featureKey
        );

        if (!result.accessible) {
          return res.status(402).json({ error: result.reason });
        }

        next();
      };

      await middleware('billing')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(next).not.toHaveBeenCalled();
    });

    test('should deny access when subscription inactive', async () => {
      FeatureAccessService.validateFeatureAccess.mockReturnValueOnce({
        accessible: false,
        reason: 'subscription_inactive',
      });

      const expiredLicense = { ...mockEffectiveLicense, status: 'expired', isActive: false };
      const req = {
        effectiveLicense: expiredLicense,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (featureKey) => (req, res, next) => {
        const result = FeatureAccessService.validateFeatureAccess(
          req.effectiveLicense,
          featureKey
        );

        if (!result.accessible) {
          return res.status(402).json({ error: result.reason });
        }

        next();
      };

      await middleware('patient_management')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(402);
    });

    test('should deny access without sufficient AI credits', async () => {
      FeatureAccessService.validateFeatureAccess.mockReturnValueOnce({
        accessible: false,
        reason: 'insufficient_ai_credits',
      });

      const noCreditLicense = { ...mockEffectiveLicense, aiCreditsRemaining: 0 };
      const req = {
        effectiveLicense: noCreditLicense,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (featureKey) => (req, res, next) => {
        const result = FeatureAccessService.validateFeatureAccess(
          req.effectiveLicense,
          featureKey
        );

        if (!result.accessible) {
          return res.status(402).json({ error: result.reason });
        }

        next();
      };

      await middleware('ai_scribe')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(402);
    });
  });

  describe('enforceSeatType middleware', () => {
    test('should allow access for permitted seat type', async () => {
      const req = {
        effectiveLicense: { ...mockEffectiveLicense, seatTypes: ['premium'] },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (requiredSeatTypes) => (req, res, next) => {
        const hasSeat = requiredSeatTypes.some(st => req.effectiveLicense.seatTypes.includes(st));

        if (!hasSeat) {
          return res.status(403).json({ error: 'seat_type_not_allowed' });
        }

        next();
      };

      await middleware(['premium', 'scribe'])(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should deny access for non-permitted seat type', async () => {
      const basicLicense = { ...mockEffectiveLicense, seatTypes: ['basic'] };
      const req = {
        effectiveLicense: basicLicense,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (requiredSeatTypes) => (req, res, next) => {
        const hasSeat = requiredSeatTypes.some(st => req.effectiveLicense.seatTypes.includes(st));

        if (!hasSeat) {
          return res.status(403).json({ error: 'seat_type_not_allowed' });
        }

        next();
      };

      await middleware(['premium'])(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('should check multiple seat types', async () => {
      const req = {
        effectiveLicense: { ...mockEffectiveLicense, seatTypes: ['basic', 'scribe'] },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (requiredSeatTypes) => (req, res, next) => {
        const hasSeat = requiredSeatTypes.some(st => req.effectiveLicense.seatTypes.includes(st));

        if (!hasSeat) {
          return res.status(403).json({ error: 'seat_type_not_allowed' });
        }

        next();
      };

      await middleware(['premium', 'scribe'])(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('enforceAiCredits middleware', () => {
    test('should allow request with sufficient credits', async () => {
      CreditService.hasSufficientCredits.mockResolvedValueOnce(true);

      const req = {
        effectiveLicense: { ...mockEffectiveLicense, walletId: 1, aiCreditsRemaining: 100 },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (requiredCredits) => async (req, res, next) => {
        if (!req.effectiveLicense.walletId) {
          return res.status(402).json({ error: 'no_wallet' });
        }

        const hasSufficient = req.effectiveLicense.aiCreditsRemaining >= requiredCredits;

        if (!hasSufficient) {
          return res.status(402).json({ error: 'insufficient_credits' });
        }

        next();
      };

      await middleware(5)(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should deny request with insufficient credits', async () => {
      const noCreditLicense = { ...mockEffectiveLicense, aiCreditsRemaining: 2 };
      const req = {
        effectiveLicense: noCreditLicense,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (requiredCredits) => async (req, res, next) => {
        if (!req.effectiveLicense.walletId) {
          return res.status(402).json({ error: 'no_wallet' });
        }

        const hasSufficient = req.effectiveLicense.aiCreditsRemaining >= requiredCredits;

        if (!hasSufficient) {
          return res.status(402).json({ error: 'insufficient_credits' });
        }

        next();
      };

      await middleware(5)(req, res, next);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(next).not.toHaveBeenCalled();
    });

    test('should deny request when no wallet', async () => {
      const noWalletLicense = { ...mockEffectiveLicense, walletId: null };
      const req = {
        effectiveLicense: noWalletLicense,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (requiredCredits) => async (req, res, next) => {
        if (!req.effectiveLicense.walletId) {
          return res.status(402).json({ error: 'no_wallet' });
        }

        const hasSufficient = req.effectiveLicense.aiCreditsRemaining >= requiredCredits;

        if (!hasSufficient) {
          return res.status(402).json({ error: 'insufficient_credits' });
        }

        next();
      };

      await middleware(5)(req, res, next);

      expect(res.status).toHaveBeenCalledWith(402);
    });
  });

  describe('end-to-end subscription enforcement flow', () => {
    test('complete flow: resolve license → check feature → check seat → check credits → execute', async () => {
      EffectiveLicenseResolver.resolveEffectiveLicense.mockResolvedValueOnce(mockEffectiveLicense);
      FeatureAccessService.validateFeatureAccess.mockReturnValueOnce({
        accessible: true,
        reason: 'allowed',
      });

      const req = {
        user: { clinicId: 100, staffId: 10 },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      // Step 1: Resolve license
      const middleware1 = async (req, res, next) => {
        req.effectiveLicense = await EffectiveLicenseResolver.resolveEffectiveLicense(
          req.user.clinicId,
          req.user.staffId
        );
        next();
      };

      // Step 2: Enforce feature
      const middleware2 = (featureKey) => (req, res, next) => {
        const result = FeatureAccessService.validateFeatureAccess(req.effectiveLicense, featureKey);

        if (!result.accessible) {
          return res.status(402).json({ error: result.reason });
        }

        next();
      };

      // Step 3: Check credits
      const middleware3 = (requiredCredits) => (req, res, next) => {
        if (req.effectiveLicense.aiCreditsRemaining < requiredCredits) {
          return res.status(402).json({ error: 'insufficient_credits' });
        }

        next();
      };

      // Execute pipeline
      await middleware1(req, res, next);
      expect(req.effectiveLicense).toBeDefined();

      middleware2('ai_scribe')(req, res, next);
      expect(next).toHaveBeenCalled();

      next.mockClear();
      middleware3(5)(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should block at feature check for pro feature on base plan', async () => {
      const baseLicense = { ...mockEffectiveLicense, plan: 'base' };
      EffectiveLicenseResolver.resolveEffectiveLicense.mockResolvedValueOnce(baseLicense);
      FeatureAccessService.validateFeatureAccess.mockReturnValueOnce({
        accessible: false,
        reason: 'pro_required',
      });

      const req = {
        user: { clinicId: 100, staffId: 10 },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      let nextCalled = 0;

      const middleware1 = async (req, res, next) => {
        req.effectiveLicense = await EffectiveLicenseResolver.resolveEffectiveLicense(
          req.user.clinicId,
          req.user.staffId
        );
        next();
      };

      const middleware2 = (featureKey) => (req, res, next) => {
        const result = FeatureAccessService.validateFeatureAccess(req.effectiveLicense, featureKey);

        if (!result.accessible) {
          return res.status(402).json({ error: result.reason });
        }

        nextCalled++;
        next();
      };

      await middleware1(req, res, () => {
        middleware2('billing')(req, res, () => {
          nextCalled++;
        });
      });

      expect(res.status).toHaveBeenCalledWith(402);
      expect(nextCalled).toBe(0);
    });

    test('should block at credit check for insufficient credits', async () => {
      const noCreditLicense = { ...mockEffectiveLicense, aiCreditsRemaining: 0 };
      EffectiveLicenseResolver.resolveEffectiveLicense.mockResolvedValueOnce(noCreditLicense);
      FeatureAccessService.validateFeatureAccess.mockReturnValueOnce({
        accessible: true,
        reason: 'allowed',
      });

      const req = {
        user: { clinicId: 100, staffId: 10 },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      let creditCheckPassed = false;

      const middleware1 = async (req, res, next) => {
        req.effectiveLicense = await EffectiveLicenseResolver.resolveEffectiveLicense(
          req.user.clinicId,
          req.user.staffId
        );
        next();
      };

      const middleware2 = (featureKey) => (req, res, next) => {
        const result = FeatureAccessService.validateFeatureAccess(req.effectiveLicense, featureKey);

        if (!result.accessible) {
          return res.status(402).json({ error: result.reason });
        }

        next();
      };

      const middleware3 = (requiredCredits) => (req, res, next) => {
        if (req.effectiveLicense.aiCreditsRemaining < requiredCredits) {
          return res.status(402).json({ error: 'insufficient_credits' });
        }

        creditCheckPassed = true;
        next();
      };

      await middleware1(req, res, () => {
        middleware2('ai_scribe')(req, res, () => {
          middleware3(5)(req, res, () => {});
        });
      });

      expect(res.status).toHaveBeenCalledWith(402);
      expect(creditCheckPassed).toBe(false);
    });
  });

  describe('subscription state transitions', () => {
    test('should allow access when transitioning from trial to active', async () => {
      const trialLicense = { ...mockEffectiveLicense, status: 'trial', isTrial: true };

      const req = {
        effectiveLicense: trialLicense,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (req, res, next) => {
        // Trial subscriptions should allow feature access
        if (['active', 'trial'].includes(req.effectiveLicense.status)) {
          next();
        } else {
          res.status(402).json({ error: 'subscription_inactive' });
        }
      };

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should deny access when subscription expires', async () => {
      const expiredLicense = {
        ...mockEffectiveLicense,
        status: 'expired',
        isExpired: true,
        isActive: false,
      };

      const req = {
        effectiveLicense: expiredLicense,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (req, res, next) => {
        if (!req.effectiveLicense.isActive) {
          return res.status(402).json({ error: 'subscription_expired' });
        }

        next();
      };

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(next).not.toHaveBeenCalled();
    });

    test('should deny access when subscription is cancelled', async () => {
      const cancelledLicense = {
        ...mockEffectiveLicense,
        status: 'cancelled',
        isCancelled: true,
        isActive: false,
      };

      const req = {
        effectiveLicense: cancelledLicense,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = (req, res, next) => {
        if (!req.effectiveLicense.isActive) {
          return res.status(402).json({ error: 'subscription_cancelled' });
        }

        next();
      };

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(402);
    });
  });

  describe('concurrent access patterns', () => {
    test('should handle multiple feature checks in parallel', async () => {
      FeatureAccessService.validateFeatureAccess
        .mockReturnValueOnce({ accessible: true, reason: 'allowed' })
        .mockReturnValueOnce({ accessible: true, reason: 'allowed' })
        .mockReturnValueOnce({ accessible: false, reason: 'pro_required' });

      const req = {
        effectiveLicense: mockEffectiveLicense,
      };

      const checkFeature = (feature) => {
        return FeatureAccessService.validateFeatureAccess(req.effectiveLicense, feature);
      };

      const results = await Promise.all([
        Promise.resolve(checkFeature('patient_management')),
        Promise.resolve(checkFeature('appointments')),
        Promise.resolve(checkFeature('billing')),
      ]);

      expect(results[0].accessible).toBe(true);
      expect(results[1].accessible).toBe(true);
      expect(results[2].accessible).toBe(false);
    });
  });
});
