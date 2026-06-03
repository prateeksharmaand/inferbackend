/**
 * Sample Routes
 * Lab sample registration, tracking, and chain of custody
 */

const router = require('express').Router();
const labAuth = require('../../middleware/labAuth');
const sampleService = require('../../services/laboratory/sampleService');
const workflowService = require('../../services/laboratory/workflowService');

const verifyLabToken = labAuth.verifyLabToken;

// POST /samples - register sample
router.post('/', verifyLabToken, async (req, res) => {
  try {
    const {
      order_id, patient_id, patient_uhid, lab_id, specimen_type, collection_method,
      collection_site, collected_by, collected_at, volume_ml, container_type,
      storage_location, notes,
    } = req.body;

    if (!patient_uhid && !patient_id) {
      return res.status(400).json({ error: 'patient_uhid or patient_id is required' });
    }
    if (!lab_id || !specimen_type) {
      return res.status(400).json({ error: 'lab_id and specimen_type are required' });
    }

    const sample = await sampleService.createSample({
      order_id, patient_id: patient_id || null, patient_uhid: patient_uhid || null,
      lab_id, specimen_type, collection_method,
      collection_site, collected_by: collected_by || req.user.id,
      collected_at, volume_ml, container_type, storage_location, notes,
    });

    return res.status(201).json({ success: true, sample });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /samples/:sample_id - get sample
router.get('/:sample_id', verifyLabToken, async (req, res) => {
  try {
    const sample = await sampleService.getSample(req.params.sample_id);
    if (!sample) return res.status(404).json({ error: 'Sample not found' });
    return res.json({ success: true, sample });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /orders/:order_id/samples - samples for order
router.get('/orders/:order_id/samples', verifyLabToken, async (req, res) => {
  try {
    const samples = await sampleService.getSamplesByOrder(req.params.order_id);
    return res.json({ success: true, samples });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /samples/:sample_id/status - update status
router.patch('/:sample_id/status', verifyLabToken, async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });

    const updated = await workflowService.transitionSample(
      req.params.sample_id, status, req.user.id, notes
    );
    return res.json({ success: true, sample: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /samples/:sample_id/custody - add custody event
router.post('/:sample_id/custody', verifyLabToken, async (req, res) => {
  try {
    const { action, location, notes } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required' });

    const event = await sampleService.addCustodyEvent(
      req.params.sample_id, action, req.user.id, location, notes
    );
    return res.status(201).json({ success: true, event });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /samples/:sample_id/custody - custody chain
router.get('/:sample_id/custody', verifyLabToken, async (req, res) => {
  try {
    const chain = await sampleService.getCustodyChain(req.params.sample_id);
    return res.json({ success: true, chain });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /samples/:sample_id/reject - reject sample
router.post('/:sample_id/reject', verifyLabToken, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    const sample = await sampleService.rejectSample(req.params.sample_id, reason, req.user.id);
    return res.json({ success: true, sample });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
