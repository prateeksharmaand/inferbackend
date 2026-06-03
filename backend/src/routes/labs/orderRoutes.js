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
router.patch('/:order_id/status', verifyLabToken, verifyLabAccess, async (req, res) => {
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
