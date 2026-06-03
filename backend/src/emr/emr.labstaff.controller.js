/**
 * Lab Staff Controller
 * CRUD for lab staff accounts managed from OPD settings
 */

const db    = require('../db');
const bcrypt = require('bcryptjs');

// ── helpers ──────────────────────────────────────────────────────────────────

function safe(row) {
  const { password_hash, ...rest } = row;
  return rest;
}

// ── GET /labs/staff ───────────────────────────────────────────────────────────
async function listStaff(req, res) {
  try {
    const { clinic_id } = req.emrUser;

    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.lab_id, u.lab_role,
              u.can_upload_results, u.is_active,
              l.facility_name, l.lab_type, l.city, l.phone
       FROM users u
       LEFT JOIN laboratories l ON l.id = u.lab_id
       WHERE u.clinic_id = $1 AND u.lab_id IS NOT NULL
       ORDER BY u.name`,
      [clinic_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('listStaff error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /labs/staff ──────────────────────────────────────────────────────────
async function createStaff(req, res) {
  try {
    const { clinic_id } = req.emrUser;
    const { name, email, password, lab_role, facility_name, lab_type, phone, city } = req.body;

    if (!name || !email || !password || !facility_name) {
      return res.status(400).json({ error: 'name, email, password, facility_name are required' });
    }

    // Check email not already used
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    // Create or reuse laboratory record for this facility
    let labId;
    const labResult = await db.query(
      `SELECT id FROM laboratories
       WHERE facility_name = $1 AND clinic_id = $2 LIMIT 1`,
      [facility_name, clinic_id]
    );

    if (labResult.rows.length > 0) {
      labId = labResult.rows[0].id;
    } else {
      const apiKey = `lab_pk_${require('crypto').randomBytes(16).toString('hex')}`;
      const newLab = await db.query(
        `INSERT INTO laboratories
           (facility_name, lab_type, phone, city, api_key, status, clinic_id)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6)
         RETURNING id`,
        [facility_name, lab_type || 'DIAGNOSTIC', phone || null, city || null, apiKey, clinic_id]
      );
      labId = newLab.rows[0].id;
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await db.query(
      `INSERT INTO users
         (name, email, password_hash, lab_id, lab_role, can_upload_results, is_active, clinic_id)
       VALUES ($1, $2, $3, $4, $5, true, true, $6)
       RETURNING id, name, email, lab_id, lab_role, can_upload_results, is_active`,
      [name, email, hash, labId, lab_role || 'LAB_TECHNICIAN', clinic_id]
    );

    res.status(201).json({
      ...user.rows[0],
      facility_name,
      lab_type: lab_type || 'DIAGNOSTIC',
      phone: phone || null,
      city:  city  || null,
    });
  } catch (err) {
    console.error('createStaff error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ── PATCH /labs/staff/:id ─────────────────────────────────────────────────────
async function updateStaff(req, res) {
  try {
    const { clinic_id } = req.emrUser;
    const { id } = req.params;
    const { name, email, password, lab_role, facility_name, lab_type, phone, city, is_active } = req.body;

    // Verify ownership
    const check = await db.query(
      'SELECT id, lab_id FROM users WHERE id = $1 AND clinic_id = $2',
      [id, clinic_id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const labId = check.rows[0].lab_id;

    // Update user fields
    const updates = [];
    const params  = [];
    let   p       = 1;

    if (name      !== undefined) { updates.push(`name = $${p++}`);      params.push(name); }
    if (email     !== undefined) { updates.push(`email = $${p++}`);     params.push(email); }
    if (lab_role  !== undefined) { updates.push(`lab_role = $${p++}`);  params.push(lab_role); }
    if (is_active !== undefined) { updates.push(`is_active = $${p++}`); params.push(is_active); }
    if (password)                { updates.push(`password_hash = $${p++}`); params.push(await bcrypt.hash(password, 10)); }

    if (updates.length > 0) {
      params.push(id);
      await db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${p}`,
        params
      );
    }

    // Update lab fields if provided
    if (labId && (facility_name || lab_type || phone || city)) {
      const labUpdates = [];
      const labParams  = [];
      let   lp         = 1;
      if (facility_name !== undefined) { labUpdates.push(`facility_name = $${lp++}`); labParams.push(facility_name); }
      if (lab_type      !== undefined) { labUpdates.push(`lab_type = $${lp++}`);      labParams.push(lab_type); }
      if (phone         !== undefined) { labUpdates.push(`phone = $${lp++}`);         labParams.push(phone); }
      if (city          !== undefined) { labUpdates.push(`city = $${lp++}`);          labParams.push(city); }
      if (labUpdates.length > 0) {
        labParams.push(labId);
        await db.query(
          `UPDATE laboratories SET ${labUpdates.join(', ')} WHERE id = $${lp}`,
          labParams
        );
      }
    }

    // Return updated row
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.lab_id, u.lab_role, u.can_upload_results, u.is_active,
              l.facility_name, l.lab_type, l.city, l.phone
       FROM users u
       LEFT JOIN laboratories l ON l.id = u.lab_id
       WHERE u.id = $1`,
      [id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('updateStaff error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ── DELETE /labs/staff/:id ────────────────────────────────────────────────────
async function deleteStaff(req, res) {
  try {
    const { clinic_id } = req.emrUser;
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM users WHERE id = $1 AND clinic_id = $2 AND lab_id IS NOT NULL RETURNING id',
      [id, clinic_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    res.json({ deleted: true });
  } catch (err) {
    console.error('deleteStaff error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listStaff, createStaff, updateStaff, deleteStaff };
