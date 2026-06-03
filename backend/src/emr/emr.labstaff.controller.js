/**
 * Lab Staff Controller
 * CRUD for lab staff — stored in emr_lab_staff, scoped to clinic_id (INTEGER)
 */

const { pool } = require('../config/database');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

// ── GET /labs/staff ───────────────────────────────────────────────────────────
async function listStaff(req, res) {
  try {
    const { clinic_id } = req.emrUser;

    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.email, s.lab_role, s.is_active, s.lab_id, s.created_at,
              l.facility_name, l.lab_type, l.city, l.phone
       FROM emr_lab_staff s
       LEFT JOIN laboratories l ON l.id = s.lab_id
       WHERE s.clinic_id = $1
       ORDER BY s.name`,
      [clinic_id]
    );

    res.json(rows);
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
      return res.status(400).json({ error: 'name, email, password and facility_name are required' });
    }

    // Check email not already used
    const existing = await pool.query(
      'SELECT id FROM emr_lab_staff WHERE email = $1', [email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    // Reuse or create laboratory record
    const labRes = await pool.query(
      `SELECT id FROM laboratories WHERE facility_name = $1 AND clinic_id = $2 LIMIT 1`,
      [facility_name, clinic_id]
    );

    let labId;
    if (labRes.rows.length > 0) {
      labId = labRes.rows[0].id;
    } else {
      const apiKey  = `lab_pk_${crypto.randomBytes(16).toString('hex')}`;
      const newLab  = await pool.query(
        `INSERT INTO laboratories (clinic_id, facility_name, lab_type, phone, city, api_key, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE') RETURNING id`,
        [clinic_id, facility_name, lab_type || 'DIAGNOSTIC', phone || null, city || null, apiKey]
      );
      labId = newLab.rows[0].id;
    }

    const hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO emr_lab_staff (clinic_id, lab_id, name, email, password_hash, lab_role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, lab_role, is_active, lab_id`,
      [clinic_id, labId, name, email, hash, lab_role || 'LAB_TECHNICIAN']
    );

    res.status(201).json({
      ...rows[0],
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
    const { id }        = req.params;
    const { name, email, password, lab_role, facility_name, lab_type, phone, city, is_active } = req.body;

    // Verify ownership
    const check = await pool.query(
      'SELECT id, lab_id FROM emr_lab_staff WHERE id = $1 AND clinic_id = $2',
      [id, clinic_id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const labId = check.rows[0].lab_id;

    // Build user update
    const updates = []; const params = []; let p = 1;
    if (name      !== undefined) { updates.push(`name = $${p++}`);          params.push(name); }
    if (email     !== undefined) { updates.push(`email = $${p++}`);         params.push(email); }
    if (lab_role  !== undefined) { updates.push(`lab_role = $${p++}`);      params.push(lab_role); }
    if (is_active !== undefined) { updates.push(`is_active = $${p++}`);     params.push(is_active); }
    if (password)                { updates.push(`password_hash = $${p++}`); params.push(await bcrypt.hash(password, 10)); }

    if (updates.length > 0) {
      params.push(id);
      await pool.query(
        `UPDATE emr_lab_staff SET ${updates.join(', ')} WHERE id = $${p}`,
        params
      );
    }

    // Update lab record
    if (labId) {
      const lu = []; const lp = []; let lc = 1;
      if (facility_name !== undefined) { lu.push(`facility_name = $${lc++}`); lp.push(facility_name); }
      if (lab_type      !== undefined) { lu.push(`lab_type = $${lc++}`);      lp.push(lab_type); }
      if (phone         !== undefined) { lu.push(`phone = $${lc++}`);         lp.push(phone); }
      if (city          !== undefined) { lu.push(`city = $${lc++}`);          lp.push(city); }
      if (lu.length > 0) {
        lp.push(labId);
        await pool.query(
          `UPDATE laboratories SET ${lu.join(', ')} WHERE id = $${lc}`, lp
        );
      }
    }

    // Return updated row
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.email, s.lab_role, s.is_active, s.lab_id,
              l.facility_name, l.lab_type, l.city, l.phone
       FROM emr_lab_staff s
       LEFT JOIN laboratories l ON l.id = s.lab_id
       WHERE s.id = $1`,
      [id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('updateStaff error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ── DELETE /labs/staff/:id ────────────────────────────────────────────────────
async function deleteStaff(req, res) {
  try {
    const { clinic_id } = req.emrUser;
    const { id }        = req.params;

    const { rows } = await pool.query(
      'DELETE FROM emr_lab_staff WHERE id = $1 AND clinic_id = $2 RETURNING id',
      [id, clinic_id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('deleteStaff error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /labs/staff/login  (used by lab portal) ─────────────────────────────
async function loginStaff(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const { rows } = await pool.query(
      `SELECT s.*, l.facility_name, l.lab_type
       FROM emr_lab_staff s
       LEFT JOIN laboratories l ON l.id = s.lab_id
       WHERE s.email = $1 AND s.is_active = true`,
      [email]
    );

    if (rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const staff = rows[0];
    const match = await bcrypt.compare(password, staff.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: staff.id, clinic_id: staff.clinic_id, lab_id: staff.lab_id, lab_role: staff.lab_role, email: staff.email },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id:            staff.id,
        name:          staff.name,
        email:         staff.email,
        lab_id:        staff.lab_id,
        lab_role:      staff.lab_role,
        facility_name: staff.facility_name,
      }
    });
  } catch (err) {
    console.error('loginStaff error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listStaff, createStaff, updateStaff, deleteStaff, loginStaff };
