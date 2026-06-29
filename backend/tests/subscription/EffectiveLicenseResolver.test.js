/**
 * EffectiveLicenseResolver Tests
 *
 * Comprehensive tests for license resolution:
 * - All 9 phases of license resolution
 * - Subscription state handling
 * - Seat information aggregation
 * - AI credit calculation
 * - Usage tracking
 * - Fallback handling
 */

const EffectiveLicenseResolver = require('../../src/services/subscription/EffectiveLicenseResolver');
const SubscriptionService = require('../../src/services/subscription/SubscriptionService');
const SeatService = require('../../src/services/subscription/SeatService');
const FeatureAccessService = require('../../src/services/subscription/FeatureAccessService');
const CreditService = require('../../src/services/subscription/CreditService');

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

jest.mock('../../src/services/subscription/SubscriptionService');
jest.mock('../../src/services/subscription/SeatService');
jest.mock('../../src/services/subscription/FeatureAccessService');
jest.mock('../../src/services/subscription/CreditService');

beforeEach(() => {
  mockQuery.mockClear();
  jest.clearAllMocks();
});

describe('EffectiveLicenseResolver', () => {
  const mockSubscription = {
    id: 1,
    clinic_id: 100,
    plan_id: 1,
    plan_key: 'pro',
    display_name: 'Pro Plan',
    tagline: 'For growing clinics',
    seat_count: 10,
    billing_cycle: 'monthly',
    status: 'active',
    started_at: '2026-06-01',
    expires_at: '2026-07-29',
    max_users: 50,
    max_patients: 5000,
    max_appointments: 10000,
    max_prescriptions: 10000,
    max_storage_mb: 2048,
    features: JSON.stringify({ queue: true, billing: true, ai_docassist: true }),
  };

  describe('resolveEffectiveLicense() - Phase 1: Get Subscription', () => {
    test('should retrieve active subscription', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 2, available: 3 },
        basic: { purchased: 5, used: 3, available: 2 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 100 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(250);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery.mockResolvedValueOnce({
        rows: [{ seat_type: 'premium' }],
      }); // Staff seat query
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: 0 }],
      }); // Patient count
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: 0 }],
      }); // Appointment count
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: 0 }],
      }); // Encounter count

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.plan).toBe('pro');
      expect(license.status).toBe('active');
      expect(license.subscriptionValid).toBe(true);
    });

    test('should create default subscription if missing', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(null);
      SubscriptionService.createSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 1, used: 0, available: 1 },
        basic: { purchased: 0, used: 0, available: 0 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce(null);
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(0);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(null);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'basic' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.plan).toBe('pro');
    });
  });

  describe('resolveEffectiveLicense() - Phase 2: Staff Seat Information', () => {
    test('should retrieve staff seat type', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 2, available: 3 },
        basic: { purchased: 5, used: 3, available: 2 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 100 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(250);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.seatTypes).toContain('premium');
      expect(license.primarySeatType).toBe('premium');
    });

    test('should default to basic seat type when not assigned', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 0, available: 5 },
        basic: { purchased: 5, used: 0, available: 5 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce(null);
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(0);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(null);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: null }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.primarySeatType).toBe('basic');
    });

    test('should throw when staff not found', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);

      mockQuery.mockResolvedValueOnce({ rows: [] }); // Staff not found

      await expect(EffectiveLicenseResolver.resolveEffectiveLicense(100, 999)).rejects.toThrow(
        'Staff 999 not found'
      );
    });
  });

  describe('resolveEffectiveLicense() - Phase 3: Subscription Status', () => {
    test('should mark invalid subscription as expired', async () => {
      const expiredSubscription = { ...mockSubscription, status: 'active' };
      const validity = {
        isValid: false,
        reason: 'expired',
        effectiveStatus: 'expired',
      };

      SubscriptionService.getSubscription.mockResolvedValueOnce(expiredSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce(validity);
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 2, available: 3 },
        basic: { purchased: 5, used: 3, available: 2 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 0 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(0);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(0);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.status).toBe('expired');
      expect(license.subscriptionValid).toBe(false);
      expect(license.isExpired).toBe(true);
    });

    test('should mark cancelled subscription', async () => {
      const cancelledSubscription = { ...mockSubscription, status: 'cancelled' };

      SubscriptionService.getSubscription.mockResolvedValueOnce(cancelledSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: false,
        reason: 'cancelled',
        effectiveStatus: 'cancelled',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 0, used: 0, available: 0 },
        basic: { purchased: 0, used: 0, available: 0 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce(null);
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(0);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(null);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'basic' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.isCancelled).toBe(true);
    });
  });

  describe('resolveEffectiveLicense() - Phase 4: Seat Information', () => {
    test('should include seat summary', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });

      const seatSummary = {
        premium: { purchased: 5, used: 3, available: 2 },
        basic: { purchased: 10, used: 7, available: 3 },
        scribe: { purchased: 2, used: 1, available: 1 },
      };

      SeatService.getSeatSummary.mockResolvedValueOnce(seatSummary);
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 100 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(250);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.seats).toEqual(seatSummary);
    });
  });

  describe('resolveEffectiveLicense() - Phase 5: AI Credits', () => {
    test('should include wallet balance', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 2, available: 3 },
        basic: { purchased: 5, used: 3, available: 2 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });

      const wallet = { id: 1, current_balance: 150 };
      CreditService.getWallet.mockResolvedValueOnce(wallet);
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(500);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.aiCreditsRemaining).toBe(150);
      expect(license.clinicAiCreditsRemaining).toBe(500);
      expect(license.walletId).toBe(1);
    });

    test('should handle missing wallet', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 0, available: 5 },
        basic: { purchased: 5, used: 0, available: 5 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce(null);
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(0);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'basic' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.aiCreditsRemaining).toBe(0);
      expect(license.walletId).toBeNull();
    });
  });

  describe('resolveEffectiveLicense() - Phase 6: Usage Calculation', () => {
    test('should calculate usage metrics', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 2, available: 3 },
        basic: { purchased: 5, used: 3, available: 2 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 100 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(250);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] })
        .mockResolvedValueOnce({ rows: [{ count: 100 }] }) // Patients
        .mockResolvedValueOnce({ rows: [{ count: 500 }] }) // Appointments
        .mockResolvedValueOnce({ rows: [{ count: 100 }] }); // Encounters (prescriptions)

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.usage.patients.used).toBe(100);
      expect(license.usage.appointments.used).toBe(500);
      expect(license.usage.prescriptions.used).toBe(100);
    });

    test('should handle usage query errors gracefully', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 0, available: 5 },
        basic: { purchased: 5, used: 0, available: 5 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce(null);
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(0);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'basic' }] })
        .mockRejectedValueOnce(new Error('DB error'))
        .mockRejectedValueOnce(new Error('DB error'))
        .mockRejectedValueOnce(new Error('DB error'));

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      // Should have default zeros
      expect(license.usage.patients.used).toBe(0);
    });
  });

  describe('resolveEffectiveLicense() - Phase 7: Subscription Items', () => {
    test('should include subscription items (seats, add-ons)', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 2, available: 3 },
        basic: { purchased: 5, used: 3, available: 2 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 100 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(250);

      const items = [
        { id: 1, item_type: 'seat', item_key: 'premium', quantity: 5 },
        { id: 2, item_type: 'addon', item_key: 'storage', quantity: 100 },
      ];

      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce(items);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.items).toEqual(items);
    });
  });

  describe('resolveEffectiveLicense() - Phase 8 & 9: Features & Final Object', () => {
    test('should include plan features', async () => {
      const subWithFeatures = {
        ...mockSubscription,
        features: JSON.stringify({ queue: true, billing: true, ai_docassist: true }),
      };

      SubscriptionService.getSubscription.mockResolvedValueOnce(subWithFeatures);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 2, available: 3 },
        basic: { purchased: 5, used: 3, available: 2 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 100 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(250);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.planFeatures.queue).toBe(true);
      expect(license.planFeatures.billing).toBe(true);
      expect(license.planFeatures.ai_docassist).toBe(true);
    });

    test('should build complete EffectiveLicense object', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 2, available: 3 },
        basic: { purchased: 5, used: 3, available: 2 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 100 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(250);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] })
        .mockResolvedValueOnce({ rows: [{ count: 100 }] })
        .mockResolvedValueOnce({ rows: [{ count: 500 }] })
        .mockResolvedValueOnce({ rows: [{ count: 50 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      // Required fields
      expect(license.clinicId).toBe(100);
      expect(license.staffId).toBe(10);
      expect(license.resolvedAt).toBeDefined();
      expect(license.plan).toBe('pro');
      expect(license.planName).toBe('Pro Plan');
      expect(license.status).toBe('active');
      expect(license.subscriptionValid).toBe(true);

      // Subscription details
      expect(license.billingCycle).toBe('monthly');
      expect(license.daysUntilExpiry).toBe(30);

      // Seat info
      expect(license.seatTypes).toContain('premium');
      expect(license.seats).toBeDefined();

      // AI credits
      expect(license.aiCreditsRemaining).toBe(100);
      expect(license.clinicAiCreditsRemaining).toBe(250);

      // Usage
      expect(license.usage).toBeDefined();

      // Limits
      expect(license.limits.maxPatients).toBe(5000);

      // Flags
      expect(license.isActive).toBe(true);
      expect(license.isExpired).toBe(false);
      expect(license.isCancelled).toBe(false);
      expect(license.isTrial).toBe(false);
    });
  });

  describe('isEffectiveLicenseStillValid()', () => {
    test('should return true when license unchanged', async () => {
      const license = {
        clinicId: 100,
        staffId: 10,
        status: 'active',
        subscriptionValid: true,
        aiCreditsRemaining: 100,
      };

      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 0, available: 5 },
        basic: { purchased: 5, used: 0, available: 5 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 100 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(250);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const isValid = await EffectiveLicenseResolver.isEffectiveLicenseStillValid(license);

      expect(isValid).toBe(true);
    });

    test('should return false when status changed', async () => {
      const license = {
        clinicId: 100,
        staffId: 10,
        status: 'active',
        subscriptionValid: true,
        aiCreditsRemaining: 100,
      };

      const expiredSubscription = { ...mockSubscription, status: 'active' };

      SubscriptionService.getSubscription.mockResolvedValueOnce(expiredSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: false,
        reason: 'expired',
        effectiveStatus: 'expired',
      });

      const isValid = await EffectiveLicenseResolver.isEffectiveLicenseStillValid(license);

      expect(isValid).toBe(false);
    });
  });

  describe('resolveEffectiveLicenseSafely()', () => {
    test('should return full license on success', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 2, available: 3 },
        basic: { purchased: 5, used: 3, available: 2 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 100 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(250);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(30);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicenseSafely(100, 10);

      expect(license.status).toBe('active');
    });

    test('should return minimal fallback on error', async () => {
      SubscriptionService.getSubscription.mockRejectedValueOnce(new Error('DB error'));

      const license = await EffectiveLicenseResolver.resolveEffectiveLicenseSafely(100, 10);

      expect(license.clinicId).toBe(100);
      expect(license.staffId).toBe(10);
      expect(license.plan).toBe('base');
      expect(license.status).toBe('unknown');
      expect(license.subscriptionValid).toBe(false);
      expect(license.isActive).toBe(false);
      expect(license.error).toBeDefined();
    });

    test('should not throw on error', async () => {
      SubscriptionService.getSubscription.mockRejectedValueOnce(new Error('Fatal error'));

      const license = await EffectiveLicenseResolver.resolveEffectiveLicenseSafely(100, 10);

      expect(license).toBeDefined();
      expect(license.error).toContain('Fatal error');
    });
  });

  describe('edge cases', () => {
    test('should handle subscription without expiry', async () => {
      const perpetualSubscription = {
        ...mockSubscription,
        expires_at: null,
      };

      SubscriptionService.getSubscription.mockResolvedValueOnce(perpetualSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 0, available: 5 },
        basic: { purchased: 5, used: 0, available: 5 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce(null);
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(0);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(null);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'basic' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.daysUntilExpiry).toBeNull();
    });

    test('should handle trial subscriptions', async () => {
      const trialSubscription = {
        ...mockSubscription,
        status: 'trial',
      };

      SubscriptionService.getSubscription.mockResolvedValueOnce(trialSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'trial',
      });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 0, available: 5 },
        basic: { purchased: 5, used: 0, available: 5 },
        scribe: { purchased: 0, used: 0, available: 0 },
      });
      CreditService.getWallet.mockResolvedValueOnce(null);
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(0);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);
      SubscriptionService.getDaysUntilExpiry.mockReturnValueOnce(14);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const license = await EffectiveLicenseResolver.resolveEffectiveLicense(100, 10);

      expect(license.status).toBe('trial');
      expect(license.isTrial).toBe(true);
      expect(license.isActive).toBe(true);
    });
  });
});
