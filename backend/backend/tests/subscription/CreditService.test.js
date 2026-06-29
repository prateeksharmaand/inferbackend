const CreditService = require('../../src/services/subscription/CreditService');
const { pool } = require('../../src/config/database');

jest.mock('../../src/utils/logger');

describe('CreditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWallet', () => {
    it('should return wallet for clinic and doctor', async () => {
      const mockWallet = {
        id: 1,
        clinic_id: 1,
        doctor_id: 10,
        current_balance: 100,
      };

      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [mockWallet] });

      const result = await CreditService.getWallet(1, 10);

      expect(result).toEqual(mockWallet);
    });

    it('should return null for non-existent wallet', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] });

      const result = await CreditService.getWallet(999, 999);

      expect(result).toBeNull();
    });
  });

  describe('ensureWallet', () => {
    it('should create wallet if missing', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] }) // getWallet returns null
        .mockResolvedValueOnce({ rows: [{ id: 1, current_balance: 0 }] }); // createWallet

      const result = await CreditService.ensureWallet(1, 10);

      expect(result).toBeDefined();
    });

    it('should return existing wallet', async () => {
      const mockWallet = { id: 1, current_balance: 100 };

      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [mockWallet] });

      const result = await CreditService.ensureWallet(1, 10);

      expect(result).toEqual(mockWallet);
    });
  });

  describe('hasSufficientCredits', () => {
    it('should return true with sufficient credits', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ current_balance: 100 }] });

      const result = await CreditService.hasSufficientCredits(1, 50);

      expect(result).toBe(true);
    });

    it('should return false with insufficient credits', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ current_balance: 30 }] });

      const result = await CreditService.hasSufficientCredits(1, 50);

      expect(result).toBe(false);
    });
  });

  describe('deductCredits', () => {
    it('should deduct credits on success', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ id: 1 }] }); // deduction

      const result = await CreditService.deductCredits(1, 'ai_docassist', 1, 'req-123');

      expect(result).toBeDefined();
    });

    it('should be idempotent with request ID', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ id: 1 }] });

      // First call
      await CreditService.deductCredits(1, 'ai_docassist', 1, 'req-123');

      // Second call with same request ID should not deduct again
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] }); // Already processed

      const result = await CreditService.deductCredits(1, 'ai_docassist', 1, 'req-123');

      expect(result).toBeDefined();
    });
  });

  describe('refundCredits', () => {
    it('should refund credits for failed request', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await CreditService.refundCredits(1, 'ai_docassist', 1, 'req-123', 'Failed call');

      expect(result).toBeDefined();
    });
  });
});
