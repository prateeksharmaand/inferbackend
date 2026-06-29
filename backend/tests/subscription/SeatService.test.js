/**
 * SeatService Tests
 *
 * Comprehensive tests for seat licensing and validation:
 * - Seat type assignment
 * - Seat availability validation
 * - Concurrent session tracking
 * - Seat summary aggregation
 */

const SeatService = require('../../src/services/subscription/SeatService');

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

describe('SeatService', () => {
  describe('getSubscriptionSeats()', () => {
    test('should return seat configuration', async () => {
      const items = [
        { seat_type: 'premium', quantity: 5 },
        { seat_type: 'basic', quantity: 10 },
        { seat_type: 'scribe', quantity: 2 },
      ];

      mockQuery.mockResolvedValueOnce({ rows: items });

      const result = await SeatService.getSubscriptionSeats(100);

      expect(result).toEqual({
        premium: 5,
        basic: 10,
        scribe: 2,
      });
    });

    test('should return empty object when no seats', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SeatService.getSubscriptionSeats(100);

      expect(result).toEqual({});
    });

    test('should handle database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(SeatService.getSubscriptionSeats(100)).rejects.toThrow('DB error');
    });
  });

  describe('getActiveSeatUsage()', () => {
    test('should return current seat usage', async () => {
      const usage = [
        { seat_type: 'premium', count: 3 },
        { seat_type: 'basic', count: 8 },
      ];

      mockQuery.mockResolvedValueOnce({ rows: usage });

      const result = await SeatService.getActiveSeatUsage(100);

      expect(result).toEqual({
        premium: 3,
        basic: 8,
      });
    });

    test('should return empty object when no active users', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SeatService.getActiveSeatUsage(100);

      expect(result).toEqual({});
    });
  });

  describe('validateSeatAvailable()', () => {
    test('should allow seat assignment when available', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', quantity: 5 }] }) // getSubscriptionSeats
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', count: 2 }] }); // getActiveSeatUsage

      await expect(SeatService.validateSeatAvailable(100, 'premium')).resolves.not.toThrow();
    });

    test('should throw when seat limit reached', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', quantity: 5 }] }) // getSubscriptionSeats
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', count: 5 }] }); // getActiveSeatUsage

      const error = await SeatService.validateSeatAvailable(100, 'premium').catch(e => e);

      expect(error.message).toContain('Seat limit reached');
      expect(error.code).toBe('SEAT_LIMIT_EXCEEDED');
      expect(error.seatType).toBe('premium');
      expect(error.limit).toBe(5);
      expect(error.used).toBe(5);
      expect(error.status).toBe(402);
    });

    test('should throw when usage exceeds limit', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'basic', quantity: 3 }] }) // getSubscriptionSeats
        .mockResolvedValueOnce({ rows: [{ seat_type: 'basic', count: 5 }] }); // getActiveSeatUsage

      const error = await SeatService.validateSeatAvailable(100, 'basic').catch(e => e);

      expect(error.code).toBe('SEAT_LIMIT_EXCEEDED');
      expect(error.limit).toBe(3);
      expect(error.used).toBe(5);
    });

    test('should handle missing seat type (no purchase)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // getSubscriptionSeats - no premium seats
        .mockResolvedValueOnce({ rows: [] }); // getActiveSeatUsage

      const error = await SeatService.validateSeatAvailable(100, 'premium').catch(e => e);

      expect(error.code).toBe('SEAT_LIMIT_EXCEEDED');
      expect(error.limit).toBe(0);
    });
  });

  describe('assignSeatType()', () => {
    test('should assign premium seat type', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', quantity: 5 }] }) // getSubscriptionSeats
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', count: 2 }] }) // getActiveSeatUsage
        .mockResolvedValueOnce({
          rows: [{ id: 1, staff_id: 10, clinic_id: 100, seat_type: 'premium' }],
        }); // UPDATE

      const result = await SeatService.assignSeatType(10, 100, 'premium');

      expect(result.seat_type).toBe('premium');
    });

    test('should assign basic seat type', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'basic', quantity: 10 }] }) // getSubscriptionSeats
        .mockResolvedValueOnce({ rows: [] }) // getActiveSeatUsage
        .mockResolvedValueOnce({
          rows: [{ id: 1, staff_id: 10, clinic_id: 100, seat_type: 'basic' }],
        }); // UPDATE

      const result = await SeatService.assignSeatType(10, 100, 'basic');

      expect(result.seat_type).toBe('basic');
    });

    test('should throw on invalid seat type', async () => {
      const error = await SeatService.assignSeatType(10, 100, 'invalid').catch(e => e);

      expect(error.message).toContain('Invalid seat type');
    });

    test('should throw when staff not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', quantity: 5 }] }) // getSubscriptionSeats
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', count: 0 }] }) // getActiveSeatUsage
        .mockResolvedValueOnce({ rows: [] }); // UPDATE returns nothing

      const error = await SeatService.assignSeatType(999, 100, 'premium').catch(e => e);

      expect(error.message).toContain('Staff not found');
    });

    test('should check seat availability before assigning', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', quantity: 2 }] }) // getSubscriptionSeats
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', count: 2 }] }); // getActiveSeatUsage

      const error = await SeatService.assignSeatType(10, 100, 'premium').catch(e => e);

      expect(error.code).toBe('SEAT_LIMIT_EXCEEDED');
    });
  });

  describe('getActiveSessions()', () => {
    test('should return active session count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });

      const result = await SeatService.getActiveSessions(10, 100);

      expect(result).toBe(2);
    });

    test('should return 0 when no active sessions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const result = await SeatService.getActiveSessions(10, 100);

      expect(result).toBe(0);
    });
  });

  describe('validateConcurrentSessionLimit()', () => {
    test('should allow session when under limit for premium', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] }); // getActiveSessions

      await expect(
        SeatService.validateConcurrentSessionLimit(10, 100, 'premium')
      ).resolves.not.toThrow();
    });

    test('should throw when at concurrent limit for premium', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] }); // getActiveSessions - max is 2

      const error = await SeatService.validateConcurrentSessionLimit(10, 100, 'premium').catch(e => e);

      expect(error.message).toContain('Concurrent session limit');
      expect(error.code).toBe('CONCURRENT_SESSION_LIMIT');
      expect(error.limit).toBe(2);
      expect(error.active).toBe(2);
      expect(error.status).toBe(403);
    });

    test('should throw when exceeding concurrent limit for basic', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] }); // getActiveSessions - max is 1

      const error = await SeatService.validateConcurrentSessionLimit(10, 100, 'basic').catch(e => e);

      expect(error.code).toBe('CONCURRENT_SESSION_LIMIT');
      expect(error.limit).toBe(1);
    });

    test('should allow multiple sessions for scribe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] }); // getActiveSessions - max is 3

      await expect(
        SeatService.validateConcurrentSessionLimit(10, 100, 'scribe')
      ).resolves.not.toThrow();
    });
  });

  describe('getSeatTypeFeatures()', () => {
    test('should return premium features', () => {
      const features = SeatService.getSeatTypeFeatures('premium');

      expect(features.canPrescribe).toBe(true);
      expect(features.canCreateAppointments).toBe(true);
      expect(features.canViewAll).toBe(true);
      expect(features.maxConcurrentSessions).toBe(2);
      expect(features.aiFeatures).toContain('scribe');
      expect(features.aiFeatures).toContain('docassist');
    });

    test('should return basic features', () => {
      const features = SeatService.getSeatTypeFeatures('basic');

      expect(features.canPrescribe).toBe(false);
      expect(features.canCreateAppointments).toBe(true);
      expect(features.canViewAll).toBe(false);
      expect(features.maxConcurrentSessions).toBe(1);
      expect(features.aiFeatures).toEqual([]);
    });

    test('should return scribe features', () => {
      const features = SeatService.getSeatTypeFeatures('scribe');

      expect(features.canPrescribe).toBe(false);
      expect(features.maxConcurrentSessions).toBe(3);
      expect(features.aiFeatures).toContain('scribe');
    });

    test('should return basic features for unknown type', () => {
      const features = SeatService.getSeatTypeFeatures('unknown');

      expect(features).toEqual(SeatService.getSeatTypeFeatures('basic'));
    });
  });

  describe('getSeatSummary()', () => {
    test('should return comprehensive seat summary', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { seat_type: 'premium', quantity: 5 },
            { seat_type: 'basic', quantity: 10 },
          ],
        }) // getSubscriptionSeats
        .mockResolvedValueOnce({
          rows: [
            { seat_type: 'premium', count: 3 },
            { seat_type: 'basic', count: 8 },
          ],
        }); // getActiveSeatUsage

      const result = await SeatService.getSeatSummary(100);

      expect(result.premium).toEqual({
        purchased: 5,
        used: 3,
        available: 2,
      });

      expect(result.basic).toEqual({
        purchased: 10,
        used: 8,
        available: 2,
      });

      expect(result.scribe).toEqual({
        purchased: 0,
        used: 0,
        available: 0,
      });
    });

    test('should handle zero usage', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ seat_type: 'premium', quantity: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await SeatService.getSeatSummary(100);

      expect(result.premium.used).toBe(0);
      expect(result.premium.available).toBe(5);
    });

    test('should handle no purchases', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const result = await SeatService.getSeatSummary(100);

      expect(result.premium.purchased).toBe(0);
      expect(result.basic.purchased).toBe(0);
      expect(result.scribe.purchased).toBe(0);
    });
  });

  describe('createLoginSession()', () => {
    test('should create session successfully', async () => {
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
              staff_id: 10,
              seat_type: 'premium',
              ip_address: '192.168.1.1',
              user_agent: 'Mozilla/5.0',
              logged_in_at: '2026-06-29T10:00:00Z',
            },
          ],
        }) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      const result = await SeatService.createLoginSession(
        100,
        10,
        'premium',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(result.clinic_id).toBe(100);
      expect(result.staff_id).toBe(10);
      expect(result.seat_type).toBe('premium');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('should handle session creation errors', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Insert failed'))
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        SeatService.createLoginSession(100, 10, 'premium', '192.168.1.1', 'Mozilla/5.0')
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should store ip address and user agent', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockConnect.mockResolvedValueOnce(mockClient);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({});

      await SeatService.createLoginSession(
        100,
        10,
        'basic',
        '203.0.113.42',
        'Chrome/120.0'
      );

      const insertCall = mockClient.query.mock.calls.find(
        call => call[0].includes('INSERT INTO clinic_active_sessions')
      );

      expect(insertCall[1]).toContain('203.0.113.42');
      expect(insertCall[1]).toContain('Chrome/120.0');
    });
  });

  describe('endLoginSession()', () => {
    test('should end session successfully', async () => {
      mockQuery.mockResolvedValueOnce({});

      await SeatService.endLoginSession(1);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE clinic_active_sessions'),
        [1]
      );
    });

    test('should set logged_out_at timestamp', async () => {
      mockQuery.mockResolvedValueOnce({});

      await SeatService.endLoginSession(5);

      const call = mockQuery.mock.calls[0];
      expect(call[0]).toContain('logged_out_at = NOW()');
    });

    test('should handle errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(SeatService.endLoginSession(1)).rejects.toThrow();
    });
  });

  describe('concurrent session limits edge cases', () => {
    test('should block session at exact limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] }); // premium max is 2

      const error = await SeatService.validateConcurrentSessionLimit(10, 100, 'premium').catch(
        e => e
      );

      expect(error.code).toBe('CONCURRENT_SESSION_LIMIT');
    });

    test('should allow session below limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] }); // premium max is 2

      await expect(
        SeatService.validateConcurrentSessionLimit(10, 100, 'premium')
      ).resolves.not.toThrow();
    });

    test('should handle scribe higher limits', async () => {
      // Scribe can have up to 3 concurrent sessions
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });

      await expect(
        SeatService.validateConcurrentSessionLimit(10, 100, 'scribe')
      ).resolves.not.toThrow();

      mockQuery.mockResolvedValueOnce({ rows: [{ count: 3 }] });

      const error = await SeatService.validateConcurrentSessionLimit(10, 100, 'scribe').catch(
        e => e
      );

      expect(error.code).toBe('CONCURRENT_SESSION_LIMIT');
    });
  });

  describe('seat summary includes all types', () => {
    test('should include all three seat types in summary', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const result = await SeatService.getSeatSummary(100);

      expect(result).toHaveProperty('premium');
      expect(result).toHaveProperty('basic');
      expect(result).toHaveProperty('scribe');
    });
  });
});
