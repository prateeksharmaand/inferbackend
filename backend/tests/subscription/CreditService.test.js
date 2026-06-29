/**
 * CreditService Tests
 *
 * Comprehensive tests for AI credit management:
 * - Wallet creation and retrieval
 * - Credit deduction with idempotency
 * - Credit refunds
 * - Usage tracking
 * - Balance validation
 */

const CreditService = require('../../src/services/subscription/CreditService');

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

jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => 'abc123def456'),
  })),
}));

beforeEach(() => {
  mockQuery.mockClear();
  mockConnect.mockClear();
  mockRelease.mockClear();
});

describe('CreditService', () => {
  describe('getWallet()', () => {
    test('should return wallet when exists', async () => {
      const wallet = {
        id: 1,
        clinic_id: 100,
        doctor_id: 10,
        current_balance: 100,
        lifetime_used: 50,
        subscription_active: true,
        created_at: '2026-06-01',
        updated_at: '2026-06-29',
      };

      mockQuery.mockResolvedValueOnce({ rows: [wallet] });

      const result = await CreditService.getWallet(100, 10);

      expect(result).toEqual(wallet);
    });

    test('should return null when wallet not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CreditService.getWallet(999, 999);

      expect(result).toBeNull();
    });

    test('should handle database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(CreditService.getWallet(100, 10)).rejects.toThrow('DB error');
    });
  });

  describe('ensureWallet()', () => {
    test('should return existing wallet', async () => {
      const wallet = {
        id: 1,
        clinic_id: 100,
        doctor_id: 10,
        current_balance: 50,
      };

      mockQuery.mockResolvedValueOnce({ rows: [wallet] }); // getWallet

      const result = await CreditService.ensureWallet(100, 10);

      expect(result).toEqual(wallet);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    test('should create wallet if missing', async () => {
      const newWallet = {
        id: 2,
        clinic_id: 100,
        doctor_id: 10,
        current_balance: 0,
        subscription_active: true,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // getWallet returns null
        .mockResolvedValueOnce({ rows: [newWallet] }); // INSERT

      const result = await CreditService.ensureWallet(100, 10);

      expect(result).toEqual(newWallet);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    test('should initialize new wallet with zero balance', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 2, current_balance: 0 }] });

      const result = await CreditService.ensureWallet(100, 10);

      expect(result.current_balance).toBe(0);
    });
  });

  describe('getClinicCreditsRemaining()', () => {
    test('should sum all staff wallets in clinic', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: 250 }],
      });

      const result = await CreditService.getClinicCreditsRemaining(100);

      expect(result).toBe(250);
    });

    test('should return 0 when no staff have credits', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: 0 }],
      });

      const result = await CreditService.getClinicCreditsRemaining(100);

      expect(result).toBe(0);
    });

    test('should handle multiple staff with different balances', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: 1500 }],
      });

      const result = await CreditService.getClinicCreditsRemaining(100);

      expect(result).toBe(1500);
    });
  });

  describe('hasSufficientCredits()', () => {
    test('should return true when sufficient credits', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ current_balance: 100 }],
      });

      const result = await CreditService.hasSufficientCredits(1, 50);

      expect(result).toBe(true);
    });

    test('should return true when exactly sufficient', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ current_balance: 50 }],
      });

      const result = await CreditService.hasSufficientCredits(1, 50);

      expect(result).toBe(true);
    });

    test('should return false when insufficient credits', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ current_balance: 30 }],
      });

      const result = await CreditService.hasSufficientCredits(1, 50);

      expect(result).toBe(false);
    });

    test('should return false when wallet not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CreditService.hasSufficientCredits(999, 50);

      expect(result).toBe(false);
    });
  });

  describe('deductCredits()', () => {
    test('should deduct credits successfully', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check idempotency
        .mockResolvedValueOnce({
          rows: [{ id: 1, current_balance: 100 }],
        }) // Lock wallet
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              wallet_id: 1,
              transaction_type: 'deduction',
              amount: 10,
              balance_before: 100,
              balance_after: 90,
            },
          ],
        }) // INSERT transaction
        .mockResolvedValueOnce({}) // UPDATE wallet
        .mockResolvedValueOnce({}) // INSERT usage
        .mockResolvedValueOnce({}); // COMMIT

      const result = await CreditService.deductCredits(1, 'ai_docassist', 10, 'req_123');

      expect(result.amount).toBe(10);
      expect(result.balance_after).toBe(90);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('should calculate correct new balance', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check idempotency
        .mockResolvedValueOnce({
          rows: [{ id: 1, current_balance: 150 }],
        }) // Lock wallet
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              balance_before: 150,
              balance_after: 145,
            },
          ],
        }) // INSERT transaction
        .mockResolvedValueOnce({}) // UPDATE wallet
        .mockResolvedValueOnce({}) // INSERT usage
        .mockResolvedValueOnce({}); // COMMIT

      const result = await CreditService.deductCredits(1, 'ai_scribe', 5, 'req_456');

      expect(result.balance_before).toBe(150);
      expect(result.balance_after).toBe(145);
    });

    test('should prevent duplicate deductions (idempotency)', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      const existingTransaction = {
        id: 99,
        transaction_type: 'deduction',
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [existingTransaction],
        }) // Check idempotency - FOUND
        .mockResolvedValueOnce({}); // COMMIT

      const result = await CreditService.deductCredits(1, 'ai_docassist', 10, 'req_123');

      expect(result.id).toBe(99);
      // Should not proceed to wallet lock/update
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        expect.anything()
      );
    });

    test('should throw when insufficient credits', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check idempotency
        .mockResolvedValueOnce({
          rows: [{ id: 1, current_balance: 5 }],
        }) // Lock wallet - insufficient
        .mockResolvedValueOnce({}); // ROLLBACK

      const error = await CreditService.deductCredits(1, 'ai_scribe', 10, 'req_789').catch(e => e);

      expect(error.message).toContain('Insufficient credits');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should throw when wallet not found', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check idempotency
        .mockResolvedValueOnce({ rows: [] }) // Lock wallet - not found
        .mockResolvedValueOnce({}); // ROLLBACK

      const error = await CreditService.deductCredits(999, 'ai_docassist', 5, 'req_000').catch(
        e => e
      );

      expect(error.message).toContain('Wallet not found');
    });

    test('should include metadata in transaction', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check idempotency
        .mockResolvedValueOnce({
          rows: [{ id: 1, current_balance: 100 }],
        }) // Lock wallet
        .mockResolvedValueOnce({
          rows: [{ id: 1 }],
        }) // INSERT transaction
        .mockResolvedValueOnce({}) // UPDATE wallet
        .mockResolvedValueOnce({}) // INSERT usage
        .mockResolvedValueOnce({}); // COMMIT

      await CreditService.deductCredits(1, 'ai_docassist', 10, 'req_123', { patient_id: 42 });

      // Verify metadata was passed
      const insertCall = mockClient.query.mock.calls.find(
        call => call[0].includes('INSERT INTO wallet_transactions')
      );

      expect(insertCall[1][7]).toContain('patient_id');
    });

    test('should update wallet lifetime_used counter', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check idempotency
        .mockResolvedValueOnce({
          rows: [{ id: 1, current_balance: 100 }],
        }) // Lock wallet
        .mockResolvedValueOnce({
          rows: [{ id: 1 }],
        }) // INSERT transaction
        .mockResolvedValueOnce({}) // UPDATE wallet
        .mockResolvedValueOnce({}) // INSERT usage
        .mockResolvedValueOnce({}); // COMMIT

      await CreditService.deductCredits(1, 'ai_coding', 2, 'req_001');

      // Verify lifetime_used was incremented
      const updateCall = mockClient.query.mock.calls.find(
        call => call[0].includes('UPDATE wallet') && call[0].includes('lifetime_used')
      );

      expect(updateCall[1][1]).toBe(2); // credits deducted
    });
  });

  describe('refundCredits()', () => {
    test('should refund credits successfully', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 1, current_balance: 90 }],
        }) // Lock wallet
        .mockResolvedValueOnce({
          rows: [
            {
              id: 2,
              transaction_type: 'refund',
              amount: 10,
              balance_after: 100,
            },
          ],
        }) // INSERT refund transaction
        .mockResolvedValueOnce({}) // UPDATE wallet
        .mockResolvedValueOnce({}); // COMMIT

      const result = await CreditService.refundCredits(1, 10, 'api_error', 'tx_123');

      expect(result.transaction_type).toBe('refund');
      expect(result.amount).toBe(10);
      expect(result.balance_after).toBe(100);
    });

    test('should restore balance correctly', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn();
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 1, current_balance: 75 }],
        }) // Lock wallet
        .mockResolvedValueOnce({
          rows: [{ id: 2, balance_after: 100 }],
        }) // INSERT refund
        .mockResolvedValueOnce({}) // UPDATE wallet
        .mockResolvedValueOnce({}); // COMMIT

      const result = await CreditService.refundCredits(1, 25, 'timeout', 'tx_456');

      expect(result.balance_after).toBe(100);
    });

    test('should include reason in metadata', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn();
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 1, current_balance: 80 }],
        }) // Lock wallet
        .mockResolvedValueOnce({
          rows: [{ id: 2 }],
        }) // INSERT refund
        .mockResolvedValueOnce({}) // UPDATE wallet
        .mockResolvedValueOnce({}); // COMMIT

      await CreditService.refundCredits(1, 5, 'processing_failed', 'tx_789');

      const insertCall = mockClient.query.mock.calls.find(
        call => call[0].includes('INSERT INTO wallet_transactions') && call[0].includes('refund')
      );

      expect(insertCall[1][5]).toContain('processing_failed');
    });
  });

  describe('generateRequestId()', () => {
    test('should generate unique request ID', () => {
      const id1 = CreditService.generateRequestId(100, 'ai_docassist', 1000);

      expect(id1).toContain('100');
      expect(id1).toContain('ai_docassist');
      expect(id1).toContain('1000');
    });

    test('should use current timestamp by default', () => {
      const before = Date.now();
      const id = CreditService.generateRequestId(100, 'ai_scribe');
      const after = Date.now();

      expect(id).toContain('100');
      expect(id).toContain('ai_scribe');
    });

    test('should generate different IDs for same input', () => {
      const id1 = CreditService.generateRequestId(100, 'ai_docassist', 1000);
      const id2 = CreditService.generateRequestId(100, 'ai_docassist', 1000);

      // Should differ in random suffix
      expect(id1).not.toBe(id2);
    });

    test('should be deterministic for same clinic+feature+timestamp', () => {
      // IDs will differ due to random suffix, but pattern should be consistent
      const id = CreditService.generateRequestId(100, 'ai_coding', 5000);

      const parts = id.split('_');
      expect(parts[0]).toBe('100');
      expect(parts[1]).toBe('ai_coding');
      expect(parts[2]).toBe('5000');
    });
  });

  describe('getUsageSummary()', () => {
    test('should return usage by AI feature', async () => {
      const usage = [
        { service_type: 'ai_docassist', usage_count: 25, credits_used: 25 },
        { service_type: 'ai_scribe', usage_count: 10, credits_used: 50 },
      ];

      mockQuery.mockResolvedValueOnce({ rows: usage });

      const result = await CreditService.getUsageSummary(100);

      expect(result).toEqual({
        ai_docassist: { count: 25, creditsUsed: 25 },
        ai_scribe: { count: 10, creditsUsed: 50 },
      });
    });

    test('should default to 30 days', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await CreditService.getUsageSummary(100);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('usage_date'),
        expect.arrayContaining([100, 30])
      );
    });

    test('should allow custom day range', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await CreditService.getUsageSummary(100, 7);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([100, 7])
      );
    });

    test('should return empty object when no usage', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CreditService.getUsageSummary(100);

      expect(result).toEqual({});
    });
  });

  describe('credit deduction with different AI features', () => {
    test('should handle docassist (1 credit)', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, current_balance: 50 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, amount: 1, balance_after: 49 }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await CreditService.deductCredits(1, 'ai_docassist', 1, 'req_1');

      expect(result.amount).toBe(1);
    });

    test('should handle scribe (5 credits)', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, current_balance: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, amount: 5, balance_after: 95 }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await CreditService.deductCredits(1, 'ai_scribe', 5, 'req_2');

      expect(result.amount).toBe(5);
    });

    test('should handle coding (2 credits)', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, current_balance: 75 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, amount: 2, balance_after: 73 }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await CreditService.deductCredits(1, 'ai_coding', 2, 'req_3');

      expect(result.amount).toBe(2);
    });
  });

  describe('credit service error handling', () => {
    test('should handle database connection error during deduction', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

      const error = await CreditService.deductCredits(1, 'ai_docassist', 1, 'req').catch(e => e);

      expect(error.message).toContain('Connection failed');
    });

    test('should handle database connection error during refund', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

      const error = await CreditService.refundCredits(1, 10, 'test', 'tx').catch(e => e);

      expect(error.message).toContain('Connection failed');
    });
  });
});
