const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../config/database');

const BCRYPT_ROUNDS = 12;

function requireAdmin(req, res) {
  if (req.emrUser.role !== 'admin') {
    res.status(403).json({ error: 'Only clinic admins can manage staff and roles' });
    return false;
  }
  return true;
}

// ── Staff CRUD ────────────────────────────────────────────────────────────────

const listStaff = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, mobile, employee_id, department, designation,
            profile_photo, permissions, is_active, created_at, updated_at
     FROM emr_clinic_staff
     WHERE clinic_id = $1
     ORDER BY name`,
    [req.emrUser.clinic_id]
  );
  res.json(rows);
};

const createStaff = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { name, email, password, role = 'staff', mobile, employee_id, department, designation } = req.body;
  if (!name?.trim() || !email?.trim() || !password)
    return res.status(400).json({ error: 'name, email and password are required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const { rows } = await pool.query(
      `INSERT INTO emr_clinic_staff
         (clinic_id, name, email, password_hash, role, mobile, employee_id, department, designation, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
       RETURNING id, name, email, role, mobile, employee_id, department, designation, is_active, created_at`,
      [req.emrUser.clinic_id, name.trim(), email.trim().toLowerCase(), hash, role,
       mobile || null, employee_id || null, department || null, designation || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    throw err;
  }
};

const updateStaff = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { name, email, password, role, mobile, employee_id, department, designation, is_active, permissions } = req.body;
  const sets = []; const vals = []; let i = 1;

  if (name        !== undefined) { sets.push(`name=$${i++}`);        vals.push(name.trim()); }
  if (email       !== undefined) { sets.push(`email=$${i++}`);       vals.push(email.trim().toLowerCase()); }
  if (role        !== undefined) { sets.push(`role=$${i++}`);        vals.push(role); }
  if (mobile      !== undefined) { sets.push(`mobile=$${i++}`);      vals.push(mobile || null); }
  if (employee_id !== undefined) { sets.push(`employee_id=$${i++}`); vals.push(employee_id || null); }
  if (department  !== undefined) { sets.push(`department=$${i++}`);  vals.push(department || null); }
  if (designation !== undefined) { sets.push(`designation=$${i++}`); vals.push(designation || null); }
  if (is_active   !== undefined) { sets.push(`is_active=$${i++}`);   vals.push(is_active); }
  if (permissions !== undefined) { sets.push(`permissions=$${i++}`); vals.push(JSON.stringify(permissions)); }
  if (password) {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    sets.push(`password_hash=$${i++}`); vals.push(hash);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  sets.push(`updated_at=NOW()`);

  vals.push(req.params.id, req.emrUser.clinic_id);
  const { rows } = await pool.query(
    `UPDATE emr_clinic_staff SET ${sets.join(',')}
     WHERE id=$${i++} AND clinic_id=$${i++}
     RETURNING id, name, email, role, mobile, employee_id, department, designation, is_active, permissions, updated_at`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'Staff member not found' });
  res.json(rows[0]);
};

const deleteStaff = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (parseInt(req.params.id) === req.emrUser.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });

  const { rows } = await pool.query(
    `DELETE FROM emr_clinic_staff WHERE id=$1 AND clinic_id=$2 RETURNING id`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Staff member not found' });
  res.json({ ok: true });
};

// ── Roles CRUD ────────────────────────────────────────────────────────────────

const listRoles = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, COUNT(s.id)::int AS user_count
     FROM staff_roles r
     LEFT JOIN emr_clinic_staff s ON s.clinic_id = r.clinic_id AND s.role = r.slug AND s.is_active = true
     WHERE r.clinic_id = $1
     GROUP BY r.id
     ORDER BY r.is_system DESC, r.name`,
    [req.emrUser.clinic_id]
  );
  res.json(rows);
};

const createRole = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { name, permissions = {}, color = '#7c3aed' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  try {
    const { rows } = await pool.query(
      `INSERT INTO staff_roles (clinic_id, name, slug, is_system, permissions, color)
       VALUES ($1,$2,$3,false,$4,$5) RETURNING *`,
      [req.emrUser.clinic_id, name.trim(), slug, JSON.stringify(permissions), color]
    );
    res.status(201).json({ ...rows[0], user_count: 0 });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A role with that slug already exists' });
    throw err;
  }
};

const updateRole = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { name, permissions, color } = req.body;
  const sets = []; const vals = []; let i = 1;
  if (name        !== undefined) { sets.push(`name=$${i++}`);        vals.push(name.trim()); }
  if (permissions !== undefined) { sets.push(`permissions=$${i++}`); vals.push(JSON.stringify(permissions)); }
  if (color       !== undefined) { sets.push(`color=$${i++}`);       vals.push(color); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

  vals.push(req.params.id, req.emrUser.clinic_id);
  const { rows } = await pool.query(
    `UPDATE staff_roles SET ${sets.join(',')} WHERE id=$${i++} AND clinic_id=$${i++} RETURNING *`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'Role not found' });
  res.json(rows[0]);
};

const deleteRole = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { rows } = await pool.query(
    `SELECT is_system FROM staff_roles WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Role not found' });
  if (rows[0].is_system) return res.status(400).json({ error: 'System roles cannot be deleted' });

  await pool.query(`DELETE FROM staff_roles WHERE id=$1 AND clinic_id=$2`, [req.params.id, req.emrUser.clinic_id]);
  res.json({ ok: true });
};

const cloneRole = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { rows: [src] } = await pool.query(
    `SELECT * FROM staff_roles WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!src) return res.status(404).json({ error: 'Role not found' });

  const newName = `${src.name} (Copy)`;
  const newSlug = `${src.slug}_copy_${Date.now()}`;
  const { rows } = await pool.query(
    `INSERT INTO staff_roles (clinic_id, name, slug, is_system, permissions, color)
     VALUES ($1,$2,$3,false,$4,$5) RETURNING *`,
    [req.emrUser.clinic_id, newName, newSlug, src.permissions, src.color]
  );
  res.status(201).json({ ...rows[0], user_count: 0 });
};

// ── Invitations ───────────────────────────────────────────────────────────────

const listInvitations = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, r.name AS role_name, r.color AS role_color, s.name AS invited_by_name
     FROM staff_invitations i
     LEFT JOIN staff_roles r ON r.id = i.role_id
     LEFT JOIN emr_clinic_staff s ON s.id = i.invited_by
     WHERE i.clinic_id = $1
     ORDER BY i.created_at DESC LIMIT 100`,
    [req.emrUser.clinic_id]
  );
  res.json(rows);
};

const createInvitation = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { email, name, role = 'staff', role_id, department, designation } = req.body;
  const token = crypto.randomBytes(32).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO staff_invitations
       (clinic_id, token, email, name, role, role_id, department, designation, invited_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.emrUser.clinic_id, token, email || null, name || null, role,
     role_id || null, department || null, designation || null, req.emrUser.id]
  );
  const base = process.env.APP_URL || 'http://localhost:5173';
  res.status(201).json({ ...rows[0], invite_url: `${base}/opd/invite/${token}` });
};

const revokeInvitation = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { rows } = await pool.query(
    `UPDATE staff_invitations SET status='revoked' WHERE id=$1 AND clinic_id=$2 RETURNING id`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Invitation not found' });
  res.json({ ok: true });
};

// Public — no auth
const getInvitation = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, r.name AS role_name, c.name AS clinic_name
     FROM staff_invitations i
     LEFT JOIN staff_roles r ON r.id = i.role_id
     LEFT JOIN emr_clinics c ON c.id = i.clinic_id
     WHERE i.token = $1`,
    [req.params.token]
  );
  if (!rows.length) return res.status(404).json({ error: 'Invitation not found or invalid' });
  const inv = rows[0];
  if (inv.status !== 'pending') return res.status(400).json({ error: `Invitation is ${inv.status}` });
  if (new Date(inv.expires_at) < new Date()) return res.status(400).json({ error: 'Invitation has expired' });
  res.json({ clinic_name: inv.clinic_name, role_name: inv.role_name || inv.role, email: inv.email, name: inv.name });
};

const acceptInvitation = async (req, res) => {
  const { name, password, email: bodyEmail } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'name and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const { rows } = await pool.query(
    `SELECT i.*, c.name AS clinic_name
     FROM staff_invitations i
     JOIN emr_clinics c ON c.id = i.clinic_id
     WHERE i.token = $1`,
    [req.params.token]
  );
  if (!rows.length) return res.status(404).json({ error: 'Invitation not found' });
  const inv = rows[0];
  if (inv.status !== 'pending') return res.status(400).json({ error: `Invitation is ${inv.status}` });
  if (new Date(inv.expires_at) < new Date()) return res.status(400).json({ error: 'Invitation has expired' });

  const email = inv.email || bodyEmail;
  if (!email?.trim()) return res.status(400).json({ error: 'email is required' });

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO emr_clinic_staff
         (clinic_id, name, email, password_hash, role, department, designation, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
      [inv.clinic_id, name.trim(), email.trim().toLowerCase(), hash, inv.role,
       inv.department || null, inv.designation || null]
    );
    await client.query(
      `UPDATE staff_invitations SET status='accepted', accepted_at=NOW() WHERE id=$1`,
      [inv.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ ok: true, clinic_name: inv.clinic_name });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered in this clinic' });
    throw err;
  } finally {
    client.release();
  }
};

// ── Activity Logs ─────────────────────────────────────────────────────────────

const listActivityLogs = async (req, res) => {
  const { date_from, date_to, staff_id, action, limit = 50, offset = 0 } = req.query;
  const conds = [`clinic_id = $1`]; const vals = [req.emrUser.clinic_id]; let i = 2;
  if (date_from) { conds.push(`created_at >= $${i++}`); vals.push(date_from); }
  if (date_to)   { conds.push(`created_at <= $${i++}`); vals.push(date_to); }
  if (staff_id)  { conds.push(`staff_id = $${i++}`);    vals.push(staff_id); }
  if (action)    { conds.push(`action ILIKE $${i++}`);  vals.push(`%${action}%`); }

  vals.push(Math.min(parseInt(limit) || 50, 200), parseInt(offset) || 0);
  const { rows } = await pool.query(
    `SELECT * FROM staff_activity_logs
     WHERE ${conds.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    vals
  );
  res.json(rows);
};

module.exports = {
  listStaff, createStaff, updateStaff, deleteStaff,
  listRoles, createRole, updateRole, deleteRole, cloneRole,
  listInvitations, createInvitation, revokeInvitation,
  getInvitation, acceptInvitation,
  listActivityLogs,
};
