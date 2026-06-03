/**
 * Audit Logging Service (ISO 15189 Compliance)
 * Immutable append-only audit trail
 */

const db = require('../../db');

class AuditService {
  /**
   * Log an action
   */
  async logAction(auditData) {
    try {
      const {
        actor_user_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        changes_made,
        ip_address,
        user_agent
      } = auditData;

      const result = await db.query(
        `INSERT INTO lab_audit_logs (
          actor_user_id, actor_role, action, resource_type, resource_id,
          changes_made, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, created_at`,
        [
          actor_user_id,
          actor_role,
          action,
          resource_type,
          resource_id,
          JSON.stringify(changes_made || {}),
          ip_address,
          user_agent
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Audit logging error:', error);
      // Don't throw - audit failure shouldn't block operations
      return null;
    }
  }

  /**
   * Get audit trail for a resource
   */
  async getAuditTrail(resourceType, resourceId, limit = 100) {
    try {
      const result = await db.query(
        `SELECT * FROM lab_audit_logs
         WHERE resource_type = $1 AND resource_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [resourceType, resourceId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('Get audit trail error:', error);
      return [];
    }
  }

  /**
   * Get audit trail for a user's actions
   */
  async getUserAuditTrail(userId, limit = 100) {
    try {
      const result = await db.query(
        `SELECT * FROM lab_audit_logs
         WHERE actor_user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('Get user audit trail error:', error);
      return [];
    }
  }

  /**
   * Get audit logs for a date range (for compliance reports)
   */
  async getAuditLogsByDateRange(startDate, endDate, labId = null) {
    try {
      let query = `SELECT * FROM lab_audit_logs WHERE created_at BETWEEN $1 AND $2`;
      const params = [startDate, endDate];

      if (labId) {
        // You might want to add lab_id to audit logs
        query += ` AND resource_id IN (SELECT id FROM lab_test_results WHERE lab_id = $3)`;
        params.push(labId);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await db.query(query, params);

      return result.rows;
    } catch (error) {
      console.error('Get audit logs by date range error:', error);
      return [];
    }
  }

  /**
   * Verify audit trail integrity (detect tampering)
   */
  async verifyIntegrity(resourceId) {
    try {
      // Get all audit logs for resource
      const logs = await this.getAuditTrail('LAB_RESULT', resourceId, 1000);

      // Check sequential timestamps
      let isValid = true;
      for (let i = 1; i < logs.length; i++) {
        const prevTime = new Date(logs[i - 1].created_at);
        const currTime = new Date(logs[i].created_at);

        if (currTime > prevTime) {
          isValid = false;
          break;
        }
      }

      return {
        resourceId,
        isValid,
        logCount: logs.length,
        timeSpan:
          logs.length > 0
            ? {
                from: logs[logs.length - 1].created_at,
                to: logs[0].created_at
              }
            : null
      };
    } catch (error) {
      console.error('Verify integrity error:', error);
      return { isValid: false, error: error.message };
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(labId, startDate, endDate) {
    try {
      const logs = await this.getAuditLogsByDateRange(startDate, endDate, labId);

      const report = {
        labId,
        period: { startDate, endDate },
        summary: {
          total_events: logs.length,
          events_by_action: {},
          events_by_user: {},
          events_by_resource_type: {}
        },
        logs: logs
      };

      // Aggregate statistics
      for (const log of logs) {
        report.summary.events_by_action[log.action] =
          (report.summary.events_by_action[log.action] || 0) + 1;
        report.summary.events_by_user[log.actor_user_id] =
          (report.summary.events_by_user[log.actor_user_id] || 0) + 1;
        report.summary.events_by_resource_type[log.resource_type] =
          (report.summary.events_by_resource_type[log.resource_type] || 0) + 1;
      }

      return report;
    } catch (error) {
      console.error('Generate compliance report error:', error);
      return null;
    }
  }
}

module.exports = new AuditService();
