/**
 * SeatService - Manage seat licensing and validation
 *
 * Handles:
 * - Seat type assignments
 * - Seat count validation
 * - Active session tracking
 * - Seat type features/permissions
 */

const { pool } = require('../../config/database');
const logger = require('../../utils/logger');

const SEAT_TYPES = {
  PREMIUM: 'premium',   // Doctors, can prescribe, full access
  BASIC: 'basic',       // Reception, billing, limited access
  SCRIBE: 'scribe',     // AI scribe features
};

const SEAT_TYPE_FEATURES = {
  premium: {
    canPrescribe: true,
    canCreateAppointments: true,
    canViewAll: true,
    aiFeatures: ['scribe', 'docassist', 'codingassist'],
    maxConcurrentSessions: 2,
  },
  basic: {
    canPrescribe: false,
    canCreateAppointments: true,
    canViewAll: false,
    aiFeatures: [],
    maxConcurrentSessions: 1,
  },
  scribe: {
    canPrescribe: false,
    canCreateAppointments: false,
    canViewAll: false,
    aiFeatures: ['scribe'],
    maxConcurrentSessions: 3,
  },
};

class SeatService {
  /**
   * Get subscription seat configuration
   * @param {number} clinicId
   * @returns {Object} {premium: 5, basic: 10, scribe: 2, ...}
   */
  async getSubscriptionSeats(clinicId) {
    try {
      const { rows } = await pool.query(
        `SELECT item_key AS seat_type, quantity FROM clinic_subscription_items
         WHERE clinic_id = $1 AND item_type = 'seat'`,
        [clinicId]
      );

      const seats = {};
      rows.forEach(row => {
        seats[row.seat_type] = row.quantity;
      });

      return seats;
    } catch (error) {
      logger.error('[SeatService.getSubscriptionSeats] failed:', error.message);
      throw error;
    }
  }

  /**
   * Get active seat usage
   * @param {number} clinicId
   * @returns {Object} {premium: 3, basic: 8, scribe: 1, ...}
   */
  async getActiveSeatUsage(clinicId) {
    try {
      const { rows } = await pool.query(
        `SELECT seat_type, COUNT(*)::int AS count
         FROM emr_clinic_staff
         WHERE clinic_id = $1 AND is_active = true AND seat_type IS NOT NULL
         GROUP BY seat_type`,
        [clinicId]
      );

      const usage = {};
      rows.forEach(row => {
        usage[row.seat_type] = row.count;
      });

      return usage;
    } catch (error) {
      logger.error('[SeatService.getActiveSeatUsage] failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate staff can be added for seat type
   * @param {number} clinicId
   * @param {string} seatType
   * @throws {Error} If seat limit reached
   */
  async validateSeatAvailable(clinicId, seatType) {
    try {
      const purchased = await this.getSubscriptionSeats(clinicId);
      const usage = await this.getActiveSeatUsage(clinicId);

      const purchasedCount = purchased[seatType] || 0;
      const usedCount = usage[seatType] || 0;

      if (usedCount >= purchasedCount) {
        const error = new Error(`Seat limit reached for ${seatType}`);
        error.code = 'SEAT_LIMIT_EXCEEDED';
        error.seatType = seatType;
        error.limit = purchasedCount;
        error.used = usedCount;
        error.status = 402;
        throw error;
      }
    } catch (error) {
      if (error.code === 'SEAT_LIMIT_EXCEEDED') throw error;
      logger.error('[SeatService.validateSeatAvailable] failed:', error.message);
      throw error;
    }
  }

  /**
   * Assign or update staff seat type
   * @param {number} staffId
   * @param {number} clinicId
   * @param {string} seatType
   * @returns {Object} Updated staff record
   */
  async assignSeatType(staffId, clinicId, seatType) {
    try {
      // Validate seat type
      if (!Object.values(SEAT_TYPES).includes(seatType)) {
        throw new Error(`Invalid seat type: ${seatType}`);
      }

      // Check availability before assigning
      await this.validateSeatAvailable(clinicId, seatType);

      // Update staff
      const { rows } = await pool.query(
        `UPDATE emr_clinic_staff
         SET seat_type = $1, updated_at = NOW()
         WHERE id = $2 AND clinic_id = $3
         RETURNING *`,
        [seatType, staffId, clinicId]
      );

      if (rows.length === 0) {
        throw new Error('Staff not found');
      }

      logger.info(`[SeatService] Assigned ${seatType} seat to staff ${staffId} in clinic ${clinicId}`);
      return rows[0];
    } catch (error) {
      logger.error('[SeatService.assignSeatType] failed:', error.message);
      throw error;
    }
  }

  /**
   * Get concurrent sessions for staff
   * @param {number} staffId
   * @param {number} clinicId
   * @returns {number} Active session count
   */
  async getActiveSessions(staffId, clinicId) {
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM clinic_active_sessions
         WHERE staff_id = $1 AND clinic_id = $2 AND logged_out_at IS NULL`,
        [staffId, clinicId]
      );
      return rows[0].count;
    } catch (error) {
      logger.error('[SeatService.getActiveSessions] failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate concurrent session limit for seat type
   * @param {number} staffId
   * @param {number} clinicId
   * @param {string} seatType
   * @throws {Error} If concurrent session limit exceeded
   */
  async validateConcurrentSessionLimit(staffId, clinicId, seatType) {
    try {
      const activeSessions = await this.getActiveSessions(staffId, clinicId);
      const maxSessions = SEAT_TYPE_FEATURES[seatType]?.maxConcurrentSessions || 1;

      if (activeSessions >= maxSessions) {
        const error = new Error(`Concurrent session limit reached for ${seatType}`);
        error.code = 'CONCURRENT_SESSION_LIMIT';
        error.seatType = seatType;
        error.limit = maxSessions;
        error.active = activeSessions;
        error.status = 403;
        throw error;
      }
    } catch (error) {
      if (error.code === 'CONCURRENT_SESSION_LIMIT') throw error;
      logger.error('[SeatService.validateConcurrentSessionLimit] failed:', error.message);
      throw error;
    }
  }

  /**
   * Get features for seat type
   * @param {string} seatType
   * @returns {Object} Features and permissions
   */
  getSeatTypeFeatures(seatType) {
    return SEAT_TYPE_FEATURES[seatType] || SEAT_TYPE_FEATURES.basic;
  }

  /**
   * Get seat summary for clinic
   * @param {number} clinicId
   * @returns {Object} Seats purchased, used, available
   */
  async getSeatSummary(clinicId) {
    try {
      const purchased = await this.getSubscriptionSeats(clinicId);
      const usage = await this.getActiveSeatUsage(clinicId);

      const summary = {};
      Object.keys(SEAT_TYPES).forEach(seatKey => {
        const seatType = SEAT_TYPES[seatKey];
        summary[seatType] = {
          purchased: purchased[seatType] || 0,
          used: usage[seatType] || 0,
          available: Math.max(0, (purchased[seatType] || 0) - (usage[seatType] || 0)),
        };
      });

      return summary;
    } catch (error) {
      logger.error('[SeatService.getSeatSummary] failed:', error.message);
      throw error;
    }
  }

  /**
   * Create login session
   * @param {number} clinicId
   * @param {number} staffId
   * @param {string} seatType
   * @param {string} ipAddress
   * @param {string} userAgent
   * @returns {Object} Session record
   */
  async createLoginSession(clinicId, staffId, seatType, ipAddress, userAgent) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create session
      const { rows } = await client.query(
        `INSERT INTO clinic_active_sessions
           (clinic_id, staff_id, seat_type, ip_address, user_agent, logged_in_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [clinicId, staffId, seatType, ipAddress, userAgent]
      );

      await client.query('COMMIT');

      logger.info(`[SeatService] Created session for staff ${staffId} in clinic ${clinicId}`);
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[SeatService.createLoginSession] failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * End login session
   * @param {number} sessionId
   */
  async endLoginSession(sessionId) {
    try {
      await pool.query(
        `UPDATE clinic_active_sessions
         SET logged_out_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );

      logger.info(`[SeatService] Ended session ${sessionId}`);
    } catch (error) {
      logger.error('[SeatService.endLoginSession] failed:', error.message);
      throw error;
    }
  }
}

module.exports = new SeatService();
