/**
 * Order Routes
 * Lab test order management endpoints
 */

const router = require('express').Router();
const { verifyLabToken, verifyLabAccess } = require('../../middleware/labAuth');
const orderService = require('../../services/laboratory/orderService');
const workflowService = require('../../services/laboratory/workflowService');

// POST /orders - create order
router.post('/', verifyLabToken, async (req, res) => {
  try {
    const {
      patient_id, patient_uhid, patient_name, lab_id, ordering_doctor_id, clinic_id, priority,
      clinical_notes, diagnosis_codes, tests, panels, scheduled_collection_at,
    } = req.body;

    if (!patient_uhid && !patient_id) {
      return res.status(400).json({ error: 'patient_uhid or patient_id is required' });
    }
    if (!lab_id) {
      return res.status(400).json({ error: 'lab_id is required' });
    }

    const order = await orderService.createOrder({
      patient_id: patient_id || null, patient_uhid: patient_uhid || null, patient_name: patient_name || null,
      lab_id, ordering_doctor_id, clinic_id, priority,
      clinical_notes, diagnosis_codes, tests, panels, scheduled_collection_at,
      performed_by: req.user.id,
    });

    return res.status(201).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /orders/:order_id - get order details
router.get('/:order_id', verifyLabToken, async (req, res) => {
  try {
    const order = await orderService.getOrder(req.params.order_id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /patients/:patient_id/orders - patient's orders
router.get('/patients/:patient_id/orders', verifyLabToken, async (req, res) => {
  try {
    const { status, priority, start_date, end_date } = req.query;
    const orders = await orderService.getOrdersByPatient(req.params.patient_id, {
      status, priority, start_date, end_date,
    });
    return res.json({ success: true, orders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /lab/:lab_id - lab's orders
router.get('/lab/:lab_id', verifyLabToken, verifyLabAccess, async (req, res) => {
  try {
    const { status, priority, start_date, end_date } = req.query;
    try {
      const orders = await orderService.getOrdersByLab(req.params.lab_id, {
        status, priority, start_date, end_date,
      });
      return res.json({ success: true, orders });
    } catch (dbErr) {
      // Return empty orders if tables don't exist yet (migrations not run)
      if (dbErr.message.includes('does not exist') || dbErr.message.includes('undefined')) {
        return res.json({ success: true, orders: [] });
      }
      throw dbErr;
    }
  } catch (err) {
    console.error('Orders query error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /orders/:order_id/status - update status with workflow validation
router.patch('/:order_id/status', verifyLabToken, async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });

    const updated = await workflowService.transitionOrder(
      req.params.order_id, status, req.user.id, notes
    );
    return res.json({ success: true, order: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /orders/:order_id/results - save results for all items in an order
router.post('/:order_id/results', verifyLabToken, async (req, res) => {
  try {
    const { results, instrument, technician_notes, action } = req.body;
    // results: [{ test_code, test_name, result_value, result_unit, reference_range_low, reference_range_high, is_critical_value }]
    if (!Array.isArray(results) || results.length === 0) return res.status(400).json({ error: 'results array required' });

    const { query } = require('../../config/database');

    // Get order to get lab_id and patient info
    const orderRes = await query(`SELECT * FROM lab_orders WHERE id = $1`, [req.params.order_id]);
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = orderRes.rows[0];

    const saved = [];
    for (const r of results) {
      if (r.result_value === null || r.result_value === undefined || r.result_value === '') continue;

      // Insert into lab_test_results
      const isCritical = r.is_critical_value || (
        r.result_value != null && (
          (r.critical_low  != null && parseFloat(r.result_value) < parseFloat(r.critical_low))  ||
          (r.critical_high != null && parseFloat(r.result_value) > parseFloat(r.critical_high))
        )
      );

      const trRes = await query(
        `INSERT INTO lab_test_results
           (patient_id, patient_uhid, lab_id, test_code, test_name, result_value, result_unit,
            reference_range_low, reference_range_high, result_status, source_format,
            collection_timestamp, is_critical_value, visibility_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'FINAL','MANUAL',NOW(),$10,'DOCTOR_VISIBLE')
         RETURNING id`,
        [
          order.patient_id || null, order.patient_uhid || null, order.lab_id,
          r.test_code, r.test_name,
          parseFloat(r.result_value), r.result_unit || null,
          r.reference_range_low || null, r.reference_range_high || null,
          isCritical,
        ]
      );
      const resultId = trRes.rows[0].id;
      saved.push({ test_code: r.test_code, result_id: resultId, is_critical: isCritical });

      // Link back to order item
      await query(
        `UPDATE lab_order_items SET result_id = $1, status = 'RESULTED' WHERE order_id = $2 AND test_code = $3`,
        [resultId, req.params.order_id, r.test_code]
      ).catch(() => {}); // non-fatal if item not found
    }

    // Advance order status based on action
    const statusMap = { validate: 'RESULTED', draft: 'PROCESSING', review: 'PROCESSING', reject: 'CANCELLED' };
    const newStatus = statusMap[action] || 'RESULTED';
    await query(
      `UPDATE lab_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, req.params.order_id]
    );

    return res.json({ success: true, saved, order_status: newStatus });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /orders/:order_id - cancel order
router.delete('/:order_id', verifyLabToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await orderService.cancelOrder(req.params.order_id, reason, req.user.id);
    return res.json({ success: true, order });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /orders/:order_id/timeline - workflow events
router.get('/:order_id/timeline', verifyLabToken, async (req, res) => {
  try {
    const timeline = await orderService.getOrderTimeline(req.params.order_id);
    return res.json({ success: true, timeline });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
