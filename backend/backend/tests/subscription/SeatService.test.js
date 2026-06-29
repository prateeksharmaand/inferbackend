const SeatService = require('../../src/services/subscription/SeatService');
const { pool } = require('../../src/config/database');

jest.mock('../../src/utils/logger');

describe('SeatService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSubscriptionSeats', () => {
    it('should return seat summary', async () => {
      const mockSeats = {
        premium: { purchased: 5, used: 3, available: 2 },
        basic: { purchased: 10, used: 8, available: 2 },
      };

      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ seat_type: 'premium', count: 5 }] })
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', count: 3 }] })
        .mockResolvedValueOnce({ rows: [{ seat_type: 'basic', count: 10 }] })
        .mockResolvedValueOnce({ rows: [{ seat_type: 'basic', count: 8 }] });

      const result = await SeatService.getSubscriptionSeats(1);

      expect(result).toBeDefined();
    });
  });

  describe('validateSeatAvailable', () => {
    it('should allow when seats available', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ count: 2 }] }) // used
        .mockResolvedValueOnce({ rows: [{ quantity: 5 }] }); // purchased

      const result = await SeatService.validateSeatAvailable(1, 'premium');

      expect(result).toBe(true);
    });

    it('should reject when no seats available', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ count: 5 }] }) // used
        .mockResolvedValueOnce({ rows: [{ quantity: 5 }] }); // purchased

      await expect(
        SeatService.validateSeatAvailable(1, 'premium')
      ).rejects.toThrow('seat_limit_exceeded');
    });
  });

  describe('createLoginSession', () => {
    it('should create session within limit', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ count: 0 }] }) // active sessions
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // created session

      const result = await SeatService.createLoginSession(1, 1, 'premium', '192.168.1.1', 'Mozilla...');

      expect(result).toBeDefined();
    });

    it('should reject when concurrent limit exceeded', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ count: 2 }] }); // at limit for premium

      await expect(
        SeatService.createLoginSession(1, 1, 'premium', '192.168.1.1', 'Mozilla...')
      ).rejects.toThrow('concurrent_session_limit_exceeded');
    });
  });

  describe('endLoginSession', () => {
    it('should mark session as logged out', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await SeatService.endLoginSession(1, 1);

      expect(result).toBeDefined();
    });
  });
});
