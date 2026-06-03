/**
 * Laboratory Management Routes (Admin)
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query: dbQuery } = require('../../config/database');
const { emrAuth } = require('../../emr/emr.middleware');
const auditService = require('../../services/laboratory/auditService');
const criticalValueService = require('../../services/laboratory/criticalValueService');

/**
 * POST /api/v1/admin/laboratories
 * Create new laboratory
 */
router.post(
  '/laboratories',
  emrAuth,
  async (req, res) => {
    try {
      const {
        facility_name,
        lab_type,
        email,
        phone,
        address_line1,
        city,
        state,
        postal_code,
        hl7_enabled,
        fhir_enabled,
        processing_sla_seconds,
        critical_value_thresholds,
        is_nabl_accredited,
        iso_15189_compliant
      } = req.body;

      if (!facility_name || !lab_type) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Generate API credentials
      const apiKey = `lab_pk_${crypto.randomBytes(16).toString('hex')}`;
      const apiSecret = `lab_sk_${crypto.randomBytes(32).toString('hex')}`;

      const result = await dbQuery(
        `INSERT INTO laboratories (
          facility_name, lab_type, email, phone, address_line1, city, state, postal_code,
          api_key, api_secret_encrypted, hl7_enabled, fhir_enabled, processing_sla_seconds,
          critical_value_thresholds, is_nabl_accredited, iso_15189_compliant, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id, facility_name, lab_type, api_key`,
        [
          facility_name,
          lab_type,
          email,
          phone,
          address_line1,
          city,
          state,
          postal_code,
          apiKey,
          apiSecret, // In production, encrypt this
          hl7_enabled || false,
          fhir_enabled || false,
          processing_sla_seconds || 30,
          JSON.stringify(critical_value_thresholds || {}),
          is_nabl_accredited || false,
          iso_15189_compliant || false,
          req.user.id
        ]
      );

      const lab = result.rows[0];

      // Audit log
      await auditService.logAction({
        actor_user_id: req.user.id,
        actor_role: 'ADMIN',
        action: 'LABORATORY_CREATED',
        resource_type: 'LABORATORY',
        resource_id: lab.id,
        changes_made: { facility_name, lab_type },
        ip_address: req.ip
      });

      res.status(201).json({
        id: lab.id,
        facility_name: lab.facility_name,
        lab_type: lab.lab_type,
        api_key: apiKey,
        api_secret: apiSecret,
        message: 'Laboratory created successfully. Save the API credentials!'
      });
    } catch (error) {
      console.error('Create lab error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/v1/admin/laboratories/:lab_id
 * Get laboratory details
 */
router.get(
  '/laboratories/:lab_id',
  emrAuth,
  async (req, res) => {
    try {
      const { lab_id } = req.params;

      const result = await dbQuery(
        `SELECT id, facility_name, lab_type, email, phone, address_line1, city, state, postal_code,
                hl7_enabled, fhir_enabled, processing_sla_seconds, critical_value_thresholds,
                is_nabl_accredited, iso_15189_compliant, status, created_at, updated_at
         FROM laboratories WHERE id = $1`,
        [lab_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Laboratory not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/v1/admin/laboratories
 * List laboratories
 */
router.get('/laboratories', emrAuth, async (req, res) => {
  try {
    const { type, status, limit = 20, offset = 0 } = req.query;

    let query = 'SELECT * FROM laboratories WHERE 1=1';
    const params = [];

    if (type) {
      query += ` AND lab_type = $${params.length + 1}`;
      params.push(type);
    }

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    // If not admin, only show own lab
    if (req.user.role !== 'ADMIN' && req.user.lab_id) {
      query += ` AND id = $${params.length + 1}`;
      params.push(req.user.lab_id);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await dbQuery(query, params);

    res.json({
      laboratories: result.rows,
      total: result.rowCount,
      limit,
      offset
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/v1/admin/laboratories/:lab_id
 * Update laboratory
 */
router.put(
  '/laboratories/:lab_id',
  emrAuth,
  async (req, res) => {
    try {
      const { lab_id } = req.params;
      const updateData = req.body;

      const updates = [];
      const params = [lab_id];
      let paramCount = 2;

      if (updateData.facility_name) {
        updates.push(`facility_name = $${paramCount++}`);
        params.push(updateData.facility_name);
      }
      if (updateData.critical_value_thresholds) {
        updates.push(`critical_value_thresholds = $${paramCount++}`);
        params.push(JSON.stringify(updateData.critical_value_thresholds));
      }
      if (updateData.processing_sla_seconds) {
        updates.push(`processing_sla_seconds = $${paramCount++}`);
        params.push(updateData.processing_sla_seconds);
      }
      if (updateData.status) {
        updates.push(`status = $${paramCount++}`);
        params.push(updateData.status);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      const query = `UPDATE laboratories SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
      const result = await dbQuery(query, params);

      // Audit log
      await auditService.logAction({
        actor_user_id: req.user.id,
        actor_role: req.user.role,
        action: 'LABORATORY_UPDATED',
        resource_type: 'LABORATORY',
        resource_id: lab_id,
        changes_made: updateData,
        ip_address: req.ip
      });

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/v1/admin/laboratories/:lab_id/dashboard
 * Get lab dashboard statistics
 */
router.get('/laboratories/:lab_id/dashboard', requireAuth, verifyLabAccess, async (req, res) => {
  try {
    const { lab_id } = req.params;
    const { days = 7 } = req.query;

    const result = await dbQuery(
      `SELECT
        COUNT(*) as total_results,
        SUM(CASE WHEN result_status = 'FINAL' THEN 1 ELSE 0 END) as finalized_count,
        SUM(CASE WHEN result_status IN ('PENDING', 'PRELIMINARY') THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN is_critical_value THEN 1 ELSE 0 END) as critical_count,
        COUNT(DISTINCT patient_id) as unique_patients,
        AVG(EXTRACT(EPOCH FROM (result_timestamp - collection_timestamp))) as avg_turnaround_seconds
       FROM lab_test_results
       WHERE lab_id = $1 AND created_at > NOW() - INTERVAL '1 day' * $2`,
      [lab_id, days]
    );

    const stats = result.rows[0];

    res.json({
      lab_id,
      period_days: days,
      statistics: {
        total_results: parseInt(stats.total_results) || 0,
        finalized: parseInt(stats.finalized_count) || 0,
        pending: parseInt(stats.pending_count) || 0,
        critical_values: parseInt(stats.critical_count) || 0,
        unique_patients: parseInt(stats.unique_patients) || 0,
        avg_turnaround_seconds: parseInt(stats.avg_turnaround_seconds) || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/admin/laboratories/:lab_id/critical-values
 * Set critical value thresholds
 */
router.post(
  '/laboratories/:lab_id/critical-values',
  emrAuth,
  async (req, res) => {
    try {
      const { lab_id } = req.params;
      const { thresholds } = req.body;

      const success = await criticalValueService.setThresholds(lab_id, thresholds);

      if (success) {
        await auditService.logAction({
          actor_user_id: req.user.id,
          actor_role: req.user.role,
          action: 'CRITICAL_VALUES_UPDATED',
          resource_type: 'LABORATORY',
          resource_id: lab_id,
          changes_made: { thresholds },
          ip_address: req.ip
        });

        res.json({ status: 'success', message: 'Critical values updated' });
      } else {
        res.status(400).json({ error: 'Failed to update critical values' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
