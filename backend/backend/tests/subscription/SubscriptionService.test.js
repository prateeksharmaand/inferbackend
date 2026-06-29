const SubscriptionService = require('../../src/services/subscription/SubscriptionService');
const { pool } = require('../../src/config/database');

jest.mock('../../src/utils/logger');

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSubscription', () => {
    it('should return subscription for existing clinic', async () => {
      const mockSubscription = {
        id: 1,
        clinic_id: 1,
        plan_key: 'pro',
        status: 'active',
        started_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [mockSubscription] });

      const result = await SubscriptionService.getSubscription(1);

      expect(result).toEqual(mockSubscription);
    });

    it('should return null for non-existent clinic', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] });

      const result = await SubscriptionService.getSubscription(999);

      expect(result).toBeNull();
    });
  });

  describe('isSubscriptionValid', () => {
    it('should return valid for active non-expired subscription', () => {
      const subscription = {
        status: 'active',
        expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      };

      const result = SubscriptionService.isSubscriptionValid(subscription);

      expect(result.isValid).toBe(true);
    });

    it('should return invalid for expired subscription', () => {
      const subscription = {
        status: 'active',
        expires_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      };

      const result = SubscriptionService.isSubscriptionValid(subscription);

      expect(result.isValid).toBe(false);
    });

    it('should return invalid for cancelled subscription', () => {
      const subscription = {
        status: 'cancelled',
        expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      };

      const result = SubscriptionService.isSubscriptionValid(subscription);

      expect(result.isValid).toBe(false);
    });
  });

  describe('getDaysUntilExpiry', () => {
    it('should return positive days for future expiry', () => {
      const expireDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const subscription = { expires_at: expireDate };

      const days = SubscriptionService.getDaysUntilExpiry(subscription);

      expect(days).toBeGreaterThan(25);
    });

    it('should return negative days for past expiry', () => {
      const expireDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const subscription = { expires_at: expireDate };

      const days = SubscriptionService.getDaysUntilExpiry(subscription);

      expect(days).toBeLessThan(0);
    });
  });
});
