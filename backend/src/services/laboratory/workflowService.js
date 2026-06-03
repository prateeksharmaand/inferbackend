/**
 * Workflow Service
 * Orchestrates order/sample status transitions and notifications
 */

const { query } = require('../../config/database');
const orderService = require('./orderService');
const sampleService = require('./sampleService');

const STATUS_TRANSITIONS = {
  ORDER: {
    PENDING: ['SCHEDULED', 'COLLECTED', 'CANCELLED'],
    SCHEDULED: ['COLLECTED', 'CANCELLED'],
    COLLECTED: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['RESULTED'],
    RESULTED: ['REPORTED'],
  },
  SAMPLE: {
    PENDING: ['COLLECTED', 'REJECTED'],
    COLLECTED: ['RECEIVED', 'REJECTED'],
    RECEIVED: ['PROCESSING'],
    PROCESSING: ['COMPLETED'],
  },
};

// Will be set via setSocketManager if available
let socketManager = null;

class WorkflowService {
  setSocketManager(sm) {
    socketManager = sm;
  }

  _validateTransition(entityType, fromStatus, toStatus) {
    const allowed = STATUS_TRANSITIONS[entityType]?.[fromStatus];
    if (!allowed) throw new Error(`No transitions defined from status ${fromStatus} for ${entityType}`);
    if (!allowed.includes(toStatus)) {
      throw new Error(`Invalid transition for ${entityType}: ${fromStatus} -> ${toStatus}. Allowed: ${allowed.join(', ')}`);
    }
  }

  async transitionOrder(order_id, to_status, performed_by, notes) {
    const orderRes = await query(`SELECT status, patient_id, lab_id FROM lab_orders WHERE id = $1`, [order_id]);
    if (orderRes.rows.length === 0) throw new Error('Order not found');
    const { status: fromStatus, patient_id, lab_id } = orderRes.rows[0];

    this._validateTransition('ORDER', fromStatus, to_status);

    const updated = await orderService.updateOrderStatus(order_id, to_status, performed_by, notes);

    // Sync sample status when order is collected
    if (to_status === 'COLLECTED') {
      const samplesRes = await query(
        `SELECT id, status FROM lab_samples WHERE order_id = $1 AND status = 'PENDING'`,
        [order_id]
      );
      for (const sample of samplesRes.rows) {
        try {
          await sampleService.updateSampleStatus(sample.id, 'COLLECTED', performed_by, 'Auto-synced from order status');
        } catch (_) { /* non-fatal */ }
      }
    }

    await this.notifyStatusChange('ORDER', order_id, fromStatus, to_status, { patient_id, lab_id });

    return updated;
  }

  async transitionSample(sample_id, to_status, performed_by, notes) {
    const sampleRes = await query(
      `SELECT id, status, patient_id, lab_id FROM lab_samples WHERE id = $1 OR sample_id = $1`,
      [sample_id]
    );
    if (sampleRes.rows.length === 0) throw new Error('Sample not found');
    const { id: uuid, status: fromStatus, patient_id, lab_id } = sampleRes.rows[0];

    this._validateTransition('SAMPLE', fromStatus, to_status);

    const updated = await sampleService.updateSampleStatus(uuid, to_status, performed_by, notes);

    await this.notifyStatusChange('SAMPLE', uuid, fromStatus, to_status, { patient_id, lab_id });

    return updated;
  }

  async notifyStatusChange(entity_type, entity_id, from_status, to_status, context = {}) {
    if (!socketManager) return;

    try {
      const message = `${entity_type} status changed: ${from_status} -> ${to_status}`;
      if (context.patient_id) {
        socketManager.notifyDoctor(context.patient_id, {
          type: 'STATUS_CHANGE',
          entity_type,
          entity_id,
          from_status,
          to_status,
          message,
        });
        // Also emit to patient room
        if (socketManager.io) {
          socketManager.io.to(`patient:${context.patient_id}`).emit('order_status_change', {
            entity_type,
            entity_id,
            from_status,
            to_status,
            message,
            timestamp: new Date(),
          });
        }
      }
    } catch (err) {
      console.error('Notification error:', err.message);
    }
  }

  async getWorkflowHistory(entity_type, entity_id) {
    const res = await query(
      `SELECT we.*, u.first_name || ' ' || u.last_name AS performed_by_name
       FROM lab_workflow_events we
       LEFT JOIN users u ON u.id = we.performed_by
       WHERE we.entity_type = $1 AND we.entity_id = $2
       ORDER BY we.created_at ASC`,
      [entity_type, entity_id]
    );
    return res.rows;
  }

  async checkSLABreaches(lab_id) {
    // Find orders where TAT has been exceeded based on catalog turnaround_hours
    const res = await query(
      `SELECT lo.id, lo.order_number, lo.status, lo.priority, lo.created_at,
              lo.patient_id, COALESCE(lo.patient_name, u.first_name || ' ' || u.last_name) AS patient_name,
              EXTRACT(EPOCH FROM (NOW() - lo.created_at))/3600 AS hours_elapsed,
              MIN(tc.turnaround_hours) AS expected_tat_hours
       FROM lab_orders lo
       JOIN lab_order_items loi ON loi.order_id = lo.id
       LEFT JOIN lab_test_catalog tc ON tc.id = loi.test_id
       LEFT JOIN users u ON u.id = lo.patient_id
       WHERE lo.lab_id = $1
         AND lo.status NOT IN ('REPORTED','CANCELLED')
         AND lo.reported_at IS NULL
       GROUP BY lo.id, lo.order_number, lo.status, lo.priority, lo.created_at,
                lo.patient_id, lo.patient_name, u.first_name, u.last_name
       HAVING EXTRACT(EPOCH FROM (NOW() - lo.created_at))/3600 > MIN(tc.turnaround_hours)
       ORDER BY hours_elapsed DESC`,
      [lab_id]
    );
    return res.rows;
  }
}

module.exports = new WorkflowService();
