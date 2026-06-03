/**
 * Sample Service
 * Manages lab sample lifecycle and chain of custody
 */

const { query } = require('../../config/database');
const auditService = require('./auditService');

function generateSampleId() {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `SAM-${dateStr}-${rand}`;
}

function generateBarcode() {
  const ts = Date.now().toString();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BC${ts}${rand}`;
}

class SampleService {
  async createSample({
    order_id,
    patient_id,
    patient_uhid,
    lab_id,
    specimen_type,
    collection_method,
    collection_site,
    collected_by,
    collected_at,
    volume_ml,
    container_type,
    storage_location,
    notes,
  }) {
    const sample_id = generateSampleId();
    const barcode = generateBarcode();

    const res = await query(
      `INSERT INTO lab_samples
         (sample_id, barcode, order_id, patient_id, patient_uhid, lab_id, specimen_type,
          collection_method, collection_site, collected_by, collected_at,
          volume_ml, container_type, storage_location, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        sample_id,
        barcode,
        order_id || null,
        patient_id || null,
        patient_uhid || null,
        lab_id,
        specimen_type,
        collection_method || null,
        collection_site || null,
        collected_by || null,
        collected_at || null,
        volume_ml || null,
        container_type || null,
        storage_location || null,
        notes || null,
      ]
    );

    const sample = res.rows[0];

    // Record initial custody event
    await query(
      `INSERT INTO lab_sample_custody (sample_id, action, performed_by, location, notes)
       VALUES ($1, 'REGISTERED', $2, $3, 'Sample registered in system')`,
      [sample.id, collected_by || null, collection_site || null]
    );

    await query(
      `INSERT INTO lab_workflow_events (entity_type, entity_id, from_status, to_status, performed_by, notes)
       VALUES ('SAMPLE', $1, NULL, 'PENDING', $2, 'Sample registered')`,
      [sample.id, collected_by || null]
    );

    await auditService.logAction({
      actor_user_id: collected_by,
      action: 'CREATE_SAMPLE',
      resource_type: 'LAB_SAMPLE',
      resource_id: sample.id,
      changes_made: { sample_id, barcode, specimen_type },
    });

    return sample;
  }

  async getSample(sample_id) {
    const res = await query(
      `SELECT s.*,
              COALESCE(s.patient_uhid, u.first_name || ' ' || u.last_name) AS patient_name,
              c.first_name || ' ' || c.last_name AS collected_by_name,
              l.name AS lab_name
       FROM lab_samples s
       LEFT JOIN users u ON u.id = s.patient_id
       LEFT JOIN users c ON c.id = s.collected_by
       LEFT JOIN laboratories l ON l.id = s.lab_id
       WHERE s.id = $1 OR s.sample_id = $1`,
      [sample_id]
    );
    return res.rows[0] || null;
  }

  async getSamplesByOrder(order_id) {
    const res = await query(
      `SELECT s.*,
              COALESCE(s.patient_uhid, u.first_name || ' ' || u.last_name) AS patient_name,
              c.first_name || ' ' || c.last_name AS collected_by_name
       FROM lab_samples s
       LEFT JOIN users u ON u.id = s.patient_id
       LEFT JOIN users c ON c.id = s.collected_by
       WHERE s.order_id = $1
       ORDER BY s.created_at ASC`,
      [order_id]
    );
    return res.rows;
  }

  async updateSampleStatus(sample_id, new_status, performed_by, notes) {
    const sampleRes = await query(`SELECT id, status FROM lab_samples WHERE id = $1 OR sample_id = $1`, [sample_id]);
    if (sampleRes.rows.length === 0) throw new Error('Sample not found');
    const sample = sampleRes.rows[0];
    const fromStatus = sample.status;

    const timestampFields = {
      COLLECTED: 'collected_at',
      RECEIVED: 'received_at',
    };
    const tsField = timestampFields[new_status];
    const tsClause = tsField ? `, ${tsField} = NOW()` : '';

    const res = await query(
      `UPDATE lab_samples SET status = $1 ${tsClause}, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [new_status, sample.id]
    );

    await this.addCustodyEvent(sample.id, new_status, performed_by, null, notes);

    await query(
      `INSERT INTO lab_workflow_events (entity_type, entity_id, from_status, to_status, performed_by, notes)
       VALUES ('SAMPLE', $1, $2, $3, $4, $5)`,
      [sample.id, fromStatus, new_status, performed_by || null, notes || null]
    );

    await auditService.logAction({
      actor_user_id: performed_by,
      action: 'UPDATE_SAMPLE_STATUS',
      resource_type: 'LAB_SAMPLE',
      resource_id: sample.id,
      changes_made: { from: fromStatus, to: new_status },
    });

    return res.rows[0];
  }

  async addCustodyEvent(sample_id, action, performed_by, location, notes) {
    // Resolve UUID if passed a string sample_id like SAM-...
    let resolvedId = sample_id;
    if (typeof sample_id === 'string' && sample_id.startsWith('SAM-')) {
      const r = await query(`SELECT id FROM lab_samples WHERE sample_id = $1`, [sample_id]);
      if (r.rows.length === 0) throw new Error('Sample not found');
      resolvedId = r.rows[0].id;
    }

    let performedByName = null;
    if (performed_by) {
      const uRes = await query(`SELECT first_name || ' ' || last_name AS name FROM users WHERE id = $1`, [performed_by]);
      if (uRes.rows.length > 0) performedByName = uRes.rows[0].name;
    }

    const res = await query(
      `INSERT INTO lab_sample_custody (sample_id, action, performed_by, performed_by_name, location, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [resolvedId, action, performed_by || null, performedByName, location || null, notes || null]
    );
    return res.rows[0];
  }

  async getCustodyChain(sample_id) {
    let resolvedId = sample_id;
    if (typeof sample_id === 'string' && sample_id.startsWith('SAM-')) {
      const r = await query(`SELECT id FROM lab_samples WHERE sample_id = $1`, [sample_id]);
      if (r.rows.length === 0) throw new Error('Sample not found');
      resolvedId = r.rows[0].id;
    }

    const res = await query(
      `SELECT c.*, u.full_name AS user_name
       FROM lab_sample_custody c
       LEFT JOIN users u ON u.id = c.performed_by
       WHERE c.sample_id = $1
       ORDER BY c.created_at ASC`,
      [resolvedId]
    );
    return res.rows;
  }

  async rejectSample(sample_id, reason, performed_by) {
    const sampleRes = await query(`SELECT id, status FROM lab_samples WHERE id = $1 OR sample_id = $1`, [sample_id]);
    if (sampleRes.rows.length === 0) throw new Error('Sample not found');
    const sample = sampleRes.rows[0];

    const res = await query(
      `UPDATE lab_samples
       SET status = 'REJECTED', rejection_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, sample.id]
    );

    await this.addCustodyEvent(sample.id, 'REJECTED', performed_by, null, `Rejected: ${reason}`);

    await query(
      `INSERT INTO lab_workflow_events (entity_type, entity_id, from_status, to_status, performed_by, notes)
       VALUES ('SAMPLE', $1, $2, 'REJECTED', $3, $4)`,
      [sample.id, sample.status, performed_by || null, reason]
    );

    await auditService.logAction({
      actor_user_id: performed_by,
      action: 'REJECT_SAMPLE',
      resource_type: 'LAB_SAMPLE',
      resource_id: sample.id,
      changes_made: { reason, from: sample.status },
    });

    return res.rows[0];
  }
}

module.exports = new SampleService();
