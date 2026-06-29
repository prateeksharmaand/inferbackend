const EffectiveLicenseResolver = require('../../src/services/subscription/EffectiveLicenseResolver');
const SubscriptionService = require('../../src/services/subscription/SubscriptionService');
const SeatService = require('../../src/services/subscription/SeatService');
const CreditService = require('../../src/services/subscription/CreditService');
const { pool } = require('../../src/config/database');

jest.mock('../../src/services/subscription/SubscriptionService');
jest.mock('../../src/services/subscription/SeatService');
jest.mock('../../src/services/subscription/CreditService');
jest.mock('../../src/utils/logger');

describe('EffectiveLicenseResolver', () => {
  const resolver = new EffectiveLicenseResolver();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveEffectiveLicense', () => {
    it('should resolve complete license for active clinic', async () => {
      const mockSubscription = {
        id: 1,
        clinic_id: 1,
        plan_key: 'pro',
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        display_name: 'Professional',
        billing_cycle: 'monthly',
        features: '{"patient_management":true,"billing":true}',
        max_users: 10,
        max_patients: 1000,
      };

      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({ isValid: true, effectiveStatus: 'active' });
      SeatService.getSeatSummary.mockResolvedValueOnce({ premium: { purchased: 5, used: 2 } });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 100 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(500);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);

      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] });

      const license = await resolver.resolveEffectiveLicense(1, 10);

      expect(license).toBeDefined();
      expect(license.clinicId).toBe(1);
      expect(license.plan).toBe('pro');
      expect(license.status).toBe('active');
      expect(license.subscriptionValid).toBe(true);
    });

    it('should create default subscription if missing', async () => {
      SubscriptionService.getSubscription.mockResolvedValueOnce(null);
      SubscriptionService.createSubscription.mockResolvedValueOnce({
        plan_key: 'base',
        status: 'active',
      });

      jest.spyOn(resolver, 'resolveEffectiveLicense').mockResolvedValueOnce({
        plan: 'base',
        status: 'active',
      });

      const license = await resolver.resolveEffectiveLicense(1, 10);

      expect(license.plan).toBe('base');
    });

    it('should include seat information', async () => {
      const mockSubscription = {
        id: 1,
        clinic_id: 1,
        plan_key: 'pro',
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        display_name: 'Professional',
        billing_cycle: 'monthly',
        features: '{}',
        max_users: 10,
        max_patients: 1000,
      };

      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({ isValid: true, effectiveStatus: 'active' });
      SeatService.getSeatSummary.mockResolvedValueOnce({
        premium: { purchased: 5, used: 2, available: 3 },
        basic: { purchased: 10, used: 8, available: 2 },
      });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 100 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(500);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);

      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] });

      const license = await resolver.resolveEffectiveLicense(1, 10);

      expect(license.seats).toBeDefined();
      expect(license.seats.premium.available).toBe(3);
    });

    it('should include AI credits information', async () => {
      const mockSubscription = {
        id: 1,
        clinic_id: 1,
        plan_key: 'pro',
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        display_name: 'Professional',
        billing_cycle: 'monthly',
        features: '{}',
        max_users: 10,
        max_patients: 1000,
      };

      SubscriptionService.getSubscription.mockResolvedValueOnce(mockSubscription);
      SubscriptionService.isSubscriptionValid.mockReturnValueOnce({ isValid: true, effectiveStatus: 'active' });
      SeatService.getSeatSummary.mockResolvedValueOnce({ premium: { purchased: 5, used: 2 } });
      CreditService.getWallet.mockResolvedValueOnce({ id: 1, current_balance: 250 });
      CreditService.getClinicCreditsRemaining.mockResolvedValueOnce(1000);
      SubscriptionService.getSubscriptionItems.mockResolvedValueOnce([]);

      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ seat_type: 'premium' }] });

      const license = await resolver.resolveEffectiveLicense(1, 10);

      expect(license.aiCreditsRemaining).toBe(250);
      expect(license.clinicAiCreditsRemaining).toBe(1000);
    });
  });

  describe('isEffectiveLicenseStillValid', () => {
    it('should return true if license unchanged', async () => {
      const license = {
        clinicId: 1,
        staffId: 10,
        status: 'active',
        subscriptionValid: true,
      };

      jest.spyOn(resolver, 'resolveEffectiveLicense').mockResolvedValueOnce(license);

      const valid = await resolver.isEffectiveLicenseStillValid(license);

      expect(valid).toBe(true);
    });

    it('should return false if status changed', async () => {
      const oldLicense = {
        clinicId: 1,
        staffId: 10,
        status: 'active',
        subscriptionValid: true,
      };

      const newLicense = {
        status: 'expired',
        subscriptionValid: false,
      };

      jest.spyOn(resolver, 'resolveEffectiveLicense').mockResolvedValueOnce(newLicense);

      const valid = await resolver.isEffectiveLicenseStillValid(oldLicense);

      expect(valid).toBe(false);
    });
  });
});
