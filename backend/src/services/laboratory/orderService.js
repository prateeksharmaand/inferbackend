/**
 * Order Service
 * Manages lab test orders lifecycle
 */

const { query } = require('../../config/database');
const auditService = require('./auditService');

function generateOrderNumber() {
  const date = new Date();
  const prefix = `ORD${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${rand}`;
}

class OrderService {
  async createOrder({
    patient_id,
    patient_uhid,
    patient_name,
    lab_id,
    ordering_doctor_id,
    clinic_id,
    priority = 'ROUTINE',
    clinical_notes,
    diagnosis_codes,
    tests = [],
    panels = [],
    scheduled_collection_at,
    performed_by,
  }) {
    // 1. Validate and fetch tests
    let totalCost = 0;
    const resolvedItems = [];

    if (tests.length > 0) {
      const testRes = await query(
        `SELECT id, test_code, test_name, price FROM lab_test_catalog WHERE id = ANY($1) AND lab_id = $2 AND is_active = TRUE`,
        [tests, lab_id]
      );
      for (const t of testRes.rows) {
        totalCost += parseFloat(t.price || 0);
        resolvedItems.push({ test_id: t.id, panel_id: null, test_code: t.test_code, test_name: t.test_name, price: t.price });
      }
    }

    if (panels.length > 0) {
      const panelRes = await query(
        `SELECT p.id AS panel_id, p.panel_code, p.panel_name, p.price,
                t.id AS test_id, t.test_code, t.test_name
         FROM lab_test_panels p
         JOIN lab_panel_tests pt ON pt.panel_id = p.id
         JOIN lab_test_catalog t ON t.id = pt.test_id
         WHERE p.id = ANY($1) AND p.lab_id = $2 AND p.is_active = TRUE`,
        [panels, lab_id]
      );
      const panelPrices = {};
      for (const row of panelRes.rows) {
        if (!panelPrices[row.panel_id]) {
          panelPrices[row.panel_id] = parseFloat(row.price || 0);
          totalCost += parseFloat(row.price || 0);
        }
        resolvedItems.push({
          test_id: row.test_id,
          panel_id: row.panel_id,
          test_code: row.test_code,
          test_name: row.test_name,
          price: null,
        });
      }
    }

    // 2. Insert order (allow orders without tests - they can be added later via samples)
    const orderNumber = generateOrderNumber();
    const orderRes = await query(
      `INSERT INTO lab_orders
         (order_number, patient_id, patient_uhid, patient_name, lab_id, ordering_doctor_id, clinic_id, priority,
          clinical_notes, diagnosis_codes, scheduled_collection_at, total_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        orderNumber,
        patient_id || null,
        patient_uhid || null,
        patient_name || null,
        lab_id,
        ordering_doctor_id || null,
        clinic_id || null,
        priority,
        clinical_notes || null,
        diagnosis_codes || null,
        scheduled_collection_at || null,
        totalCost,
      ]
    );
    const order = orderRes.rows[0];

    // 3. Insert order items
    for (const item of resolvedItems) {
      await query(
        `INSERT INTO lab_order_items (order_id, test_id, panel_id, test_code, test_name, price)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.id, item.test_id, item.panel_id, item.test_code, item.test_name, item.price]
      );
    }

    // 4. Log workflow event
    await query(
      `INSERT INTO lab_workflow_events (entity_type, entity_id, from_status, to_status, performed_by, notes)
       VALUES ('ORDER', $1, NULL, 'PENDING', $2, 'Order created')`,
      [order.id, performed_by || null]
    );

    // 5. Audit
    await auditService.logAction({
      actor_user_id: performed_by || ordering_doctor_id,
      actor_role: 'ORDERING_DOCTOR',
      action: 'CREATE_ORDER',
      resource_type: 'LAB_ORDER',
      resource_id: order.id,
      changes_made: { order_number: orderNumber, tests: resolvedItems.length },
    });

    return this.getOrder(order.id);
  }

  async getOrder(order_id) {
    const orderRes = await query(
      `SELECT o.*,
              COALESCE(o.patient_name, u.first_name || ' ' || u.last_name) AS patient_name,
              d.first_name || ' ' || d.last_name AS doctor_name,
              l.facility_name AS lab_name
       FROM lab_orders o
       LEFT JOIN users u ON u.id = o.patient_id
       LEFT JOIN users d ON d.id = o.ordering_doctor_id
       LEFT JOIN laboratories l ON l.id = o.lab_id
       WHERE o.id = $1`,
      [order_id]
    );
    if (orderRes.rows.length === 0) return null;
    const order = orderRes.rows[0];

    const itemsRes = await query(
      `SELECT oi.*, ltr.result_value, ltr.result_unit, ltr.is_abnormal, ltr.is_critical_value
       FROM lab_order_items oi
       LEFT JOIN lab_test_results ltr ON ltr.id = oi.result_id
       WHERE oi.order_id = $1`,
      [order_id]
    );
    order.items = itemsRes.rows;
    return order;
  }

  async getOrdersByPatient(patient_id, filters = {}) {
    const params = [patient_id];
    let where = 'o.patient_id = $1';
    let idx = 2;

    if (filters.status) {
      where += ` AND o.status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters.start_date) {
      where += ` AND o.created_at >= $${idx++}`;
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      where += ` AND o.created_at <= $${idx++}`;
      params.push(filters.end_date);
    }

    const res = await query(
      `SELECT o.*, l.facility_name AS lab_name, d.first_name || ' ' || d.last_name AS doctor_name
       FROM lab_orders o
       LEFT JOIN laboratories l ON l.id = o.lab_id
       LEFT JOIN users d ON d.id = o.ordering_doctor_id
       WHERE ${where}
       ORDER BY o.created_at DESC`,
      params
    );
    return res.rows;
  }

  async getOrdersByLab(lab_id, filters = {}) {
    const params = [lab_id];
    let where = 'o.lab_id = $1';
    let idx = 2;

    if (filters.status) {
      where += ` AND o.status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters.priority) {
      where += ` AND o.priority = $${idx++}`;
      params.push(filters.priority);
    }
    if (filters.start_date) {
      where += ` AND o.created_at >= $${idx++}`;
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      where += ` AND o.created_at <= $${idx++}`;
      params.push(filters.end_date);
    }

    const res = await query(
      `SELECT o.*,
              COALESCE(o.patient_name, u.first_name || ' ' || u.last_name) AS patient_name,
              d.first_name || ' ' || d.last_name AS doctor_name
       FROM lab_orders o
       LEFT JOIN users u ON u.id = o.patient_id
       LEFT JOIN users d ON d.id = o.ordering_doctor_id
       WHERE ${where}
       ORDER BY
         CASE o.priority WHEN 'STAT' THEN 1 WHEN 'URGENT' THEN 2 ELSE 3 END,
         o.created_at DESC`,
      params
    );
    return res.rows;
  }

  async updateOrderStatus(order_id, new_status, performed_by, notes) {
    const orderRes = await query(`SELECT status FROM lab_orders WHERE id = $1`, [order_id]);
    if (orderRes.rows.length === 0) throw new Error('Order not found');
    const fromStatus = orderRes.rows[0].status;

    const timestampFields = {
      COLLECTED: 'collected_at',
      PROCESSING: 'received_at_lab',
      REPORTED: 'reported_at',
    };
    const tsField = timestampFields[new_status];
    const tsClause = tsField ? `, ${tsField} = NOW()` : '';

    const res = await query(
      `UPDATE lab_orders SET status = $1 ${tsClause}, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [new_status, order_id]
    );

    await query(
      `INSERT INTO lab_workflow_events (entity_type, entity_id, from_status, to_status, performed_by, notes)
       VALUES ('ORDER', $1, $2, $3, $4, $5)`,
      [order_id, fromStatus, new_status, performed_by || null, notes || null]
    );

    await auditService.logAction({
      actor_user_id: performed_by,
      action: 'UPDATE_ORDER_STATUS',
      resource_type: 'LAB_ORDER',
      resource_id: order_id,
      changes_made: { from: fromStatus, to: new_status },
    });

    return res.rows[0];
  }

  async cancelOrder(order_id, reason, performed_by) {
    const orderRes = await query(`SELECT status FROM lab_orders WHERE id = $1`, [order_id]);
    if (orderRes.rows.length === 0) throw new Error('Order not found');
    const fromStatus = orderRes.rows[0].status;

    if (fromStatus === 'CANCELLED') throw new Error('Order is already cancelled');
    if (['RESULTED', 'REPORTED'].includes(fromStatus)) {
      throw new Error('Cannot cancel an order that has already been resulted or reported');
    }

    const res = await query(
      `UPDATE lab_orders
       SET status = 'CANCELLED', cancelled_at = NOW(), cancellation_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, order_id]
    );

    await query(
      `INSERT INTO lab_workflow_events (entity_type, entity_id, from_status, to_status, performed_by, notes)
       VALUES ('ORDER', $1, $2, 'CANCELLED', $3, $4)`,
      [order_id, fromStatus, performed_by || null, reason]
    );

    await auditService.logAction({
      actor_user_id: performed_by,
      action: 'CANCEL_ORDER',
      resource_type: 'LAB_ORDER',
      resource_id: order_id,
      changes_made: { reason, from: fromStatus },
    });

    return res.rows[0];
  }

  async getOrderTimeline(order_id) {
    const res = await query(
      `SELECT we.*, u.first_name || ' ' || u.last_name AS performed_by_name
       FROM lab_workflow_events we
       LEFT JOIN users u ON u.id = we.performed_by
       WHERE we.entity_type = 'ORDER' AND we.entity_id = $1
       ORDER BY we.created_at ASC`,
      [order_id]
    );
    return res.rows;
  }
}

module.exports = new OrderService();
