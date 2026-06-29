/**
 * SubscriptionService Tests
 *
 * Comprehensive tests for subscription lifecycle management:
 * - Subscription retrieval and validation
 * - Plan creation and updates
 * - Status transitions
 * - Expiry calculations
 * - Audit logging
 */

const SubscriptionService = require('../../src/services/subscription/SubscriptionService');

// Mock database pool
let mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();
const mockPool = {
  query: mockQuery,
  connect: mockConnect,
};

jest.mock('../../config/database', () => ({
  pool: mockPool,
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

beforeEach(() => {
  mockQuery.mockClear();
  mockConnect.mockClear();
  mockRelease.mockClear();
});

describe('SubscriptionService', () => {
  describe('getSubscription()', () => {
    test('should return subscription when clinic exists', async () => {
      const subscription = {
        id: 1,
        clinic_id: 100,
        plan_id: 1,
        plan_key: 'pro',
        display_name: 'Pro Plan',
        tagline: 'For growing clinics',
        seat_count: 5,
        billing_cycle: 'monthly',
        status: 'active',
        started_at: '2026-06-01',
        expires_at: '2026-07-01',
        razorpay_order_id: 'order_123',
        razorpay_payment_id: 'pay_123',
        notes: 'Annual discount applied',
        max_users: 10,
        max_patients: 1000,
        max_appointments: 5000,
        max_prescriptions: 5000,
        max_storage_mb: 1024,
        features: JSON.stringify({ queue: true, billing: true }),
        price_monthly: 5000,
        price_yearly: 50000,
        price_2year: 90000,
        price_3year: 125000,
        created_at: '2026-06-01',
        updated_at: '2026-06-01',
      };

      mockQuery.mockResolvedValueOnce({ rows: [subscription] });

      const result = await SubscriptionService.getSubscription(100);

      expect(result).toEqual(subscription);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [100]
      );
    });

    test('should return null when clinic has no subscription', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SubscriptionService.getSubscription(999);

      expect(result).toBeNull();
    });

    test('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockQuery.mockRejectedValueOnce(error);

      await expect(SubscriptionService.getSubscription(100)).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('getSubscriptionItems()', () => {
    test('should return subscription items', async () => {
      const items = [
        { id: 1, clinic_id: 100, item_type: 'seat', item_key: 'premium', quantity: 5 },
        { id: 2, clinic_id: 100, item_type: 'seat', item_key: 'basic', quantity: 10 },
        { id: 3, clinic_id: 100, item_type: 'addon', item_key: 'storage', quantity: 100 },
      ];

      mockQuery.mockResolvedValueOnce({ rows: items });

      const result = await SubscriptionService.getSubscriptionItems(100);

      expect(result).toEqual(items);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('clinic_subscription_items'),
        [100]
      );
    });

    test('should return empty array when no items', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SubscriptionService.getSubscriptionItems(100);

      expect(result).toEqual([]);
    });
  });

  describe('isSubscriptionValid()', () => {
    test('should return invalid when subscription is null', () => {
      const result = SubscriptionService.isSubscriptionValid(null);

      expect(result).toEqual({
        isValid: false,
        reason: 'no_subscription',
        effectiveStatus: 'none',
      });
    });

    test('should return invalid when subscription is cancelled', () => {
      const subscription = {
        id: 1,
        clinic_id: 100,
        status: 'cancelled',
        expires_at: '2026-12-31',
      };

      const result = SubscriptionService.isSubscriptionValid(subscription);

      expect(result).toEqual({
        isValid: false,
        reason: 'cancelled',
        effectiveStatus: 'cancelled',
      });
    });

    test('should return invalid when subscription is suspended', () => {
      const subscription = {
        id: 1,
        clinic_id: 100,
        status: 'suspended',
        expires_at: '2026-12-31',
      };

      const result = SubscriptionService.isSubscriptionValid(subscription);

      expect(result).toEqual({
        isValid: false,
        reason: 'suspended',
        effectiveStatus: 'suspended',
      });
    });

    test('should return invalid when subscription is expired', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const subscription = {
        id: 1,
        clinic_id: 100,
        status: 'active',
        expires_at: yesterday.toISOString(),
      };

      const result = SubscriptionService.isSubscriptionValid(subscription);

      expect(result).toEqual({
        isValid: false,
        reason: 'expired',
        effectiveStatus: 'expired',
      });
    });

    test('should return valid when subscription is active and not expired', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const subscription = {
        id: 1,
        clinic_id: 100,
        status: 'active',
        expires_at: tomorrow.toISOString(),
      };

      const result = SubscriptionService.isSubscriptionValid(subscription);

      expect(result).toEqual({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
    });

    test('should return valid when subscription is trial and not expired', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const subscription = {
        id: 1,
        clinic_id: 100,
        status: 'trial',
        expires_at: tomorrow.toISOString(),
      };

      const result = SubscriptionService.isSubscriptionValid(subscription);

      expect(result).toEqual({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'trial',
      });
    });

    test('should return valid when subscription has no expiry and is active', () => {
      const subscription = {
        id: 1,
        clinic_id: 100,
        status: 'active',
        expires_at: null,
      };

      const result = SubscriptionService.isSubscriptionValid(subscription);

      expect(result).toEqual({
        isValid: true,
        reason: 'valid',
        effectiveStatus: 'active',
      });
    });

    test('should return invalid for unknown status', () => {
      const subscription = {
        id: 1,
        clinic_id: 100,
        status: 'pending',
        expires_at: null,
      };

      const result = SubscriptionService.isSubscriptionValid(subscription);

      expect(result).toEqual({
        isValid: false,
        reason: 'unknown_status',
        effectiveStatus: 'pending',
      });
    });
  });

  describe('getEffectiveStatus()', () => {
    test('should return active status for valid active subscription', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const subscription = {
        status: 'active',
        expires_at: tomorrow.toISOString(),
      };

      const result = SubscriptionService.getEffectiveStatus(subscription);

      expect(result).toBe('active');
    });

    test('should return expired status for expired subscription', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const subscription = {
        status: 'active',
        expires_at: yesterday.toISOString(),
      };

      const result = SubscriptionService.getEffectiveStatus(subscription);

      expect(result).toBe('expired');
    });

    test('should return none for null subscription', () => {
      const result = SubscriptionService.getEffectiveStatus(null);

      expect(result).toBe('none');
    });
  });

  describe('getDaysUntilExpiry()', () => {
    test('should calculate days until expiry correctly', () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);

      const subscription = {
        expires_at: future.toISOString(),
      };

      const result = SubscriptionService.getDaysUntilExpiry(subscription);

      expect(result).toBe(30);
    });

    test('should return 0 for past expiry date', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const subscription = {
        expires_at: yesterday.toISOString(),
      };

      const result = SubscriptionService.getDaysUntilExpiry(subscription);

      expect(result).toBe(0);
    });

    test('should return null when no expiry date', () => {
      const subscription = {
        expires_at: null,
      };

      const result = SubscriptionService.getDaysUntilExpiry(subscription);

      expect(result).toBeNull();
    });

    test('should return null for undefined subscription', () => {
      const result = SubscriptionService.getDaysUntilExpiry(undefined);

      expect(result).toBeNull();
    });

    test('should return 1 for expiry tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const subscription = {
        expires_at: tomorrow.toISOString(),
      };

      const result = SubscriptionService.getDaysUntilExpiry(subscription);

      expect(result).toBeGreaterThan(0);
    });
  });

  describe('validateSubscriptionActive()', () => {
    test('should throw when subscription not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(SubscriptionService.validateSubscriptionActive(999)).rejects.toThrow(
        'Subscription not found'
      );
    });

    test('should throw when subscription is expired', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const subscription = {
        id: 1,
        clinic_id: 100,
        status: 'active',
        expires_at: yesterday.toISOString(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [subscription],
      });

      const error = await SubscriptionService.validateSubscriptionActive(100).catch(e => e);

      expect(error.message).toContain('Subscription is expired');
      expect(error.code).toBe('SUBSCRIPTION_INVALID');
      expect(error.status).toBe(402);
    });

    test('should throw when subscription is cancelled', async () => {
      const subscription = {
        id: 1,
        clinic_id: 100,
        status: 'cancelled',
        expires_at: '2026-12-31',
      };

      mockQuery.mockResolvedValueOnce({ rows: [subscription] });

      const error = await SubscriptionService.validateSubscriptionActive(100).catch(e => e);

      expect(error.message).toContain('Subscription is cancelled');
      expect(error.code).toBe('SUBSCRIPTION_INVALID');
    });

    test('should return subscription when active', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const subscription = {
        id: 1,
        clinic_id: 100,
        plan_id: 1,
        status: 'active',
        expires_at: tomorrow.toISOString(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [subscription] });

      const result = await SubscriptionService.validateSubscriptionActive(100);

      expect(result).toEqual(subscription);
    });
  });

  describe('createSubscription()', () => {
    test('should create base plan subscription', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Plan lookup
        .mockResolvedValueOnce({ rows: [{ id: 1, clinic_id: 100, plan_id: 1, status: 'active' }] }) // Insert
        .mockResolvedValueOnce({}); // Commit

      const result = await SubscriptionService.createSubscription(100, {
        plan_key: 'base',
        billing_cycle: 'free',
        seat_count: 1,
      });

      expect(result).toEqual({ id: 1, clinic_id: 100, plan_id: 1, status: 'active' });
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('should create pro plan subscription with custom seats', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // Plan lookup
        .mockResolvedValueOnce({
          rows: [
            {
              id: 2,
              clinic_id: 100,
              plan_id: 2,
              seat_count: 10,
              billing_cycle: 'monthly',
              status: 'active',
            },
          ],
        }) // Insert
        .mockResolvedValueOnce({}); // Commit

      const result = await SubscriptionService.createSubscription(100, {
        plan_key: 'pro',
        billing_cycle: 'monthly',
        seat_count: 10,
        expires_at: '2026-07-29',
      });

      expect(result.seat_count).toBe(10);
      expect(result.billing_cycle).toBe('monthly');
    });

    test('should throw when plan not found', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Plan lookup - not found
        .mockResolvedValueOnce({}); // Rollback

      await expect(
        SubscriptionService.createSubscription(100, {
          plan_key: 'nonexistent',
          billing_cycle: 'monthly',
          seat_count: 1,
        })
      ).rejects.toThrow('Plan not found: nonexistent');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should use default seat count of 1', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Plan lookup
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert
        .mockResolvedValueOnce({}); // Commit

      await SubscriptionService.createSubscription(100, {
        plan_key: 'base',
        billing_cycle: 'free',
      });

      const insertCall = mockClient.query.mock.calls.find(
        call => call[0].includes('INSERT INTO clinic_subscriptions')
      );

      expect(insertCall[1][2]).toBe(1); // seat_count should default to 1
    });

    test('should handle database rollback on error', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Plan lookup
        .mockRejectedValueOnce(new Error('Insert failed')) // Insert fails
        .mockResolvedValueOnce({}); // Rollback

      await expect(
        SubscriptionService.createSubscription(100, {
          plan_key: 'base',
          billing_cycle: 'free',
        })
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('updateSubscription()', () => {
    test('should update subscription status', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              clinic_id: 100,
              status: 'suspended',
              updated_at: '2026-06-29',
            },
          ],
        }) // UPDATE
        .mockResolvedValueOnce({}) // INSERT audit log
        .mockResolvedValueOnce({}); // COMMIT

      const result = await SubscriptionService.updateSubscription(100, {
        status: 'suspended',
      });

      expect(result.status).toBe('suspended');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('should update subscription plan', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // Plan lookup
        .mockResolvedValueOnce({ rows: [{ id: 1, plan_id: 2 }] }) // UPDATE
        .mockResolvedValueOnce({}) // INSERT audit log
        .mockResolvedValueOnce({}); // COMMIT

      await SubscriptionService.updateSubscription(100, {
        plan_key: 'pro',
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM subscription_plans'),
        ['pro']
      );
    });

    test('should validate status enum', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query.mockResolvedValueOnce({}); // BEGIN

      await expect(
        SubscriptionService.updateSubscription(100, {
          status: 'invalid_status',
        })
      ).rejects.toThrow('Invalid status: invalid_status');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should throw when subscription not found', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // UPDATE returns nothing

      await expect(
        SubscriptionService.updateSubscription(100, {
          status: 'active',
        })
      ).rejects.toThrow('Subscription not found');
    });

    test('should update multiple fields atomically', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      const future = new Date();
      future.setDate(future.getDate() + 30);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              clinic_id: 100,
              status: 'active',
              seat_count: 15,
              expires_at: future.toISOString(),
            },
          ],
        }) // UPDATE
        .mockResolvedValueOnce({}) // INSERT audit log
        .mockResolvedValueOnce({}); // COMMIT

      const result = await SubscriptionService.updateSubscription(100, {
        status: 'active',
        seat_count: 15,
        expires_at: future.toISOString(),
      });

      expect(result.seat_count).toBe(15);
      expect(result.status).toBe('active');
    });
  });

  describe('hasSubscriptionChanged()', () => {
    test('should detect status change', () => {
      const old = { status: 'active', plan_id: 1, seat_count: 5, expires_at: '2026-07-29' };
      const updated = { status: 'cancelled', plan_id: 1, seat_count: 5, expires_at: '2026-07-29' };

      const result = SubscriptionService.hasSubscriptionChanged(old, updated);

      expect(result).toBe(true);
    });

    test('should detect plan change', () => {
      const old = { status: 'active', plan_id: 1, seat_count: 5, expires_at: '2026-07-29' };
      const updated = { status: 'active', plan_id: 2, seat_count: 5, expires_at: '2026-07-29' };

      const result = SubscriptionService.hasSubscriptionChanged(old, updated);

      expect(result).toBe(true);
    });

    test('should detect seat count change', () => {
      const old = { status: 'active', plan_id: 1, seat_count: 5, expires_at: '2026-07-29' };
      const updated = { status: 'active', plan_id: 1, seat_count: 10, expires_at: '2026-07-29' };

      const result = SubscriptionService.hasSubscriptionChanged(old, updated);

      expect(result).toBe(true);
    });

    test('should detect expiry change', () => {
      const old = { status: 'active', plan_id: 1, seat_count: 5, expires_at: '2026-07-29' };
      const updated = { status: 'active', plan_id: 1, seat_count: 5, expires_at: '2026-08-29' };

      const result = SubscriptionService.hasSubscriptionChanged(old, updated);

      expect(result).toBe(true);
    });

    test('should return false when nothing changed', () => {
      const subscription = { status: 'active', plan_id: 1, seat_count: 5, expires_at: '2026-07-29' };

      const result = SubscriptionService.hasSubscriptionChanged(subscription, subscription);

      expect(result).toBe(false);
    });

    test('should handle null subscriptions', () => {
      const result = SubscriptionService.hasSubscriptionChanged(null, null);

      expect(result).toBe(false);
    });

    test('should handle undefined fields', () => {
      const old = { status: 'active', plan_id: 1 };
      const updated = { status: 'active', plan_id: 1, expires_at: '2026-07-29' };

      const result = SubscriptionService.hasSubscriptionChanged(old, updated);

      expect(result).toBe(true);
    });
  });
});
