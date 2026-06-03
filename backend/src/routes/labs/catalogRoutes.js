/**
 * Catalog Routes
 * Lab test catalog and panel management
 */

const router = require('express').Router();
const labAuth = require('../../middleware/labAuth');
const { query } = require('../../config/database');

const verifyLabToken = labAuth.verifyLabToken;

// GET /catalog - list tests
router.get('/catalog', verifyLabToken, async (req, res) => {
  try {
    const { lab_id, category, specimen_type, is_active = 'true', search } = req.query;
    const labId = lab_id || req.user.lab_id;
    const params = [];
    const conditions = [];
    let idx = 1;

    if (labId) { conditions.push(`lab_id = $${idx++}`); params.push(labId); }
    if (category) { conditions.push(`category = $${idx++}`); params.push(category); }
    if (specimen_type) { conditions.push(`specimen_type = $${idx++}`); params.push(specimen_type); }
    if (is_active !== undefined) { conditions.push(`is_active = $${idx++}`); params.push(is_active === 'true'); }
    if (search) { conditions.push(`(test_name ILIKE $${idx} OR test_code ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res2 = await query(`SELECT * FROM lab_test_catalog ${where} ORDER BY category, test_name`, params);
    return res.json({ success: true, tests: res2.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /catalog - add test
router.post('/catalog', verifyLabToken, async (req, res) => {
  try {
    const {
      lab_id, test_code, test_name, category, sub_category, specimen_type,
      collection_method, sample_volume_ml, turnaround_hours, price, unit,
      reference_range_low, reference_range_high, reference_range_text,
      critical_low, critical_high,
    } = req.body;

    if (!test_code || !test_name) {
      return res.status(400).json({ error: 'test_code and test_name are required' });
    }

    const labId = lab_id || req.user.lab_id;

    const result = await query(
      `INSERT INTO lab_test_catalog
         (lab_id, test_code, test_name, category, sub_category, specimen_type,
          collection_method, sample_volume_ml, turnaround_hours, price, unit,
          reference_range_low, reference_range_high, reference_range_text,
          critical_low, critical_high)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        labId, test_code, test_name, category || null, sub_category || null,
        specimen_type || null, collection_method || null, sample_volume_ml || null,
        turnaround_hours || 24, price || null, unit || null,
        reference_range_low || null, reference_range_high || null, reference_range_text || null,
        critical_low || null, critical_high || null,
      ]
    );
    return res.status(201).json({ success: true, test: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Test code already exists for this lab' });
    return res.status(500).json({ error: err.message });
  }
});

// PUT /catalog/:test_id - update test
router.put('/catalog/:test_id', verifyLabToken, async (req, res) => {
  try {
    const {
      test_code, test_name, category, sub_category, specimen_type, collection_method,
      sample_volume_ml, turnaround_hours, price, unit, reference_range_low,
      reference_range_high, reference_range_text, critical_low, critical_high, is_active,
    } = req.body;

    const result = await query(
      `UPDATE lab_test_catalog SET
         test_code = COALESCE($1, test_code),
         test_name = COALESCE($2, test_name),
         category = COALESCE($3, category),
         sub_category = COALESCE($4, sub_category),
         specimen_type = COALESCE($5, specimen_type),
         collection_method = COALESCE($6, collection_method),
         sample_volume_ml = COALESCE($7, sample_volume_ml),
         turnaround_hours = COALESCE($8, turnaround_hours),
         price = COALESCE($9, price),
         unit = COALESCE($10, unit),
         reference_range_low = COALESCE($11, reference_range_low),
         reference_range_high = COALESCE($12, reference_range_high),
         reference_range_text = COALESCE($13, reference_range_text),
         critical_low = COALESCE($14, critical_low),
         critical_high = COALESCE($15, critical_high),
         is_active = COALESCE($16, is_active)
       WHERE id = $17
       RETURNING *`,
      [
        test_code, test_name, category, sub_category, specimen_type, collection_method,
        sample_volume_ml, turnaround_hours, price, unit, reference_range_low,
        reference_range_high, reference_range_text, critical_low, critical_high,
        is_active !== undefined ? is_active : null,
        req.params.test_id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Test not found' });
    return res.json({ success: true, test: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /catalog/:test_id - deactivate test
router.delete('/catalog/:test_id', verifyLabToken, async (req, res) => {
  try {
    const result = await query(
      `UPDATE lab_test_catalog SET is_active = FALSE WHERE id = $1 RETURNING *`,
      [req.params.test_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Test not found' });
    return res.json({ success: true, test: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /panels - list panels
router.get('/panels', verifyLabToken, async (req, res) => {
  try {
    const { lab_id, is_active = 'true' } = req.query;
    const labId = lab_id || req.user.lab_id;
    const params = [];
    const conditions = [];
    let idx = 1;

    if (labId) { conditions.push(`p.lab_id = $${idx++}`); params.push(labId); }
    conditions.push(`p.is_active = $${idx++}`);
    params.push(is_active === 'true');

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const panelsRes = await query(
      `SELECT p.*, COUNT(pt.test_id) AS test_count
       FROM lab_test_panels p
       LEFT JOIN lab_panel_tests pt ON pt.panel_id = p.id
       ${where}
       GROUP BY p.id
       ORDER BY p.panel_name`,
      params
    );
    return res.json({ success: true, panels: panelsRes.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /panels - create panel
router.post('/panels', verifyLabToken, async (req, res) => {
  try {
    const { lab_id, panel_code, panel_name, description, price } = req.body;
    if (!panel_code || !panel_name) {
      return res.status(400).json({ error: 'panel_code and panel_name are required' });
    }

    const labId = lab_id || req.user.lab_id;
    const result = await query(
      `INSERT INTO lab_test_panels (lab_id, panel_code, panel_name, description, price)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [labId, panel_code, panel_name, description || null, price || null]
    );
    return res.status(201).json({ success: true, panel: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /panels/:panel_id - update panel
router.put('/panels/:panel_id', verifyLabToken, async (req, res) => {
  try {
    const { panel_code, panel_name, description, price, is_active } = req.body;
    const result = await query(
      `UPDATE lab_test_panels SET
         panel_code = COALESCE($1, panel_code),
         panel_name = COALESCE($2, panel_name),
         description = COALESCE($3, description),
         price = COALESCE($4, price),
         is_active = COALESCE($5, is_active)
       WHERE id = $6 RETURNING *`,
      [panel_code, panel_name, description, price, is_active !== undefined ? is_active : null, req.params.panel_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Panel not found' });
    return res.json({ success: true, panel: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /panels/:panel_id/tests - add tests to panel
router.post('/panels/:panel_id/tests', verifyLabToken, async (req, res) => {
  try {
    const { test_ids } = req.body;
    if (!Array.isArray(test_ids) || test_ids.length === 0) {
      return res.status(400).json({ error: 'test_ids array is required' });
    }

    const inserted = [];
    for (const test_id of test_ids) {
      try {
        await query(
          `INSERT INTO lab_panel_tests (panel_id, test_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [req.params.panel_id, test_id]
        );
        inserted.push(test_id);
      } catch (_) { /* skip duplicates */ }
    }

    // Return updated panel with tests
    const panelRes = await query(
      `SELECT p.*, json_agg(json_build_object('id', t.id, 'test_code', t.test_code, 'test_name', t.test_name)) AS tests
       FROM lab_test_panels p
       JOIN lab_panel_tests pt ON pt.panel_id = p.id
       JOIN lab_test_catalog t ON t.id = pt.test_id
       WHERE p.id = $1
       GROUP BY p.id`,
      [req.params.panel_id]
    );

    return res.json({ success: true, inserted: inserted.length, panel: panelRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /sample-types - list all sample types
router.get('/sample-types', verifyLabToken, async (req, res) => {
  try {
    const res2 = await query(
      `SELECT id, name, description FROM lab_sample_types WHERE is_active = true ORDER BY name`,
      []
    );
    return res.json({ success: true, sample_types: res2.rows });
  } catch (err) {
    // If table doesn't exist yet (migration not run), return empty array
    if (err.message.includes('does not exist')) {
      return res.json({ success: true, sample_types: [] });
    }
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
