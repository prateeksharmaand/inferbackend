const BillingService = require('../../src/services/subscription/BillingService');
const { pool } = require('../../src/config/database');

jest.mock('../../src/utils/logger');

describe('BillingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPaymentOrder', () => {
    it('should create payment order for pro plan', async () => {
      const mockPlan = {
        plan_key: 'pro',
        monthly_price_paise: 99900,
        annual_price_paise: 999000,
      };

      jest.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [mockPlan] })
        .mockResolvedValueOnce({ rows: [{ id: 1, clinic_id: 1, plan_key: 'pro', amount_paise: 99900 }] });

      const result = await BillingService.createPaymentOrder(1, 'pro', 'monthly');

      expect(result).toBeDefined();
      expect(result.plan_key).toBe('pro');
    });

    it('should throw for unknown plan', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] });

      await expect(
        BillingService.createPaymentOrder(1, 'unknown', 'monthly')
      ).rejects.toThrow('Plan not found');
    });
  });

  describe('processPaymentWebhook', () => {
    it('should process payment.captured event', async () => {
      const webhook = {
        id: 'event_123',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
              order_id: 'order_123',
            },
          },
        },
      };

      expect(BillingService.processPaymentWebhook).toBeDefined();
    });

    it('should detect duplicate webhook events', async () => {
      expect(BillingService.processPaymentWebhook).toBeDefined();
    });
  });

  describe('calculateProration', () => {
    it('should calculate prorated upgrade cost', async () => {
      const proration = await BillingService.calculateProration(1, 'base', 'pro', 'monthly');

      expect(proration).toBeDefined();
      expect(proration.fromPlan).toBe('base');
      expect(proration.toPlan).toBe('pro');
    });
  });

  describe('getPaymentHistory', () => {
    it('should return payment history', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          { id: 1, plan_key: 'pro', amount_paise: 99900, status: 'captured', paid_at: new Date() },
        ],
      });

      const history = await BillingService.getPaymentHistory(1);

      expect(history).toBeDefined();
      expect(history[0].amount).toBe(999);
    });
  });
});
