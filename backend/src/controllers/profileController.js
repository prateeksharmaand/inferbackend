const { query } = require('../config/database');

async function getProfiles(req, res, next) {
  try {
    const result = await query(
      'SELECT * FROM profiles WHERE account_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [req.accountId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getProfile(req, res, next) {
  try {
    const result = await query(
      'SELECT * FROM profiles WHERE id = $1 AND account_id = $2',
      [req.params.profileId, req.accountId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function createProfile(req, res, next) {
  try {
    const { fullName, relationship, dateOfBirth, gender, bloodGroup, heightCm, weightKg, allergies, chronicConditions, emergencyContactName, emergencyContactPhone } = req.body;

    // Max 6 profiles per account
    const count = await query('SELECT COUNT(*) FROM profiles WHERE account_id = $1', [req.accountId]);
    if (parseInt(count.rows[0].count) >= 6) {
      return res.status(400).json({ error: 'Maximum 6 family profiles allowed per account' });
    }

    const result = await query(
      `INSERT INTO profiles (account_id, full_name, relationship, date_of_birth, gender, blood_group,
        height_cm, weight_kg, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.accountId, fullName, relationship || 'other', dateOfBirth, gender, bloodGroup,
        heightCm, weightKg, allergies, chronicConditions, emergencyContactName, emergencyContactPhone]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { fullName, dateOfBirth, gender, bloodGroup, heightCm, weightKg, allergies, chronicConditions, emergencyContactName, emergencyContactPhone } = req.body;

    const result = await query(
      `UPDATE profiles SET
        full_name = COALESCE($1, full_name),
        date_of_birth = COALESCE($2, date_of_birth),
        gender = COALESCE($3, gender),
        blood_group = COALESCE($4, blood_group),
        height_cm = COALESCE($5, height_cm),
        weight_kg = COALESCE($6, weight_kg),
        allergies = COALESCE($7, allergies),
        chronic_conditions = COALESCE($8, chronic_conditions),
        emergency_contact_name = COALESCE($9, emergency_contact_name),
        emergency_contact_phone = COALESCE($10, emergency_contact_phone),
        updated_at = NOW()
       WHERE id = $11 AND account_id = $12 RETURNING *`,
      [fullName, dateOfBirth, gender, bloodGroup, heightCm, weightKg, allergies, chronicConditions,
        emergencyContactName, emergencyContactPhone, req.params.profileId, req.accountId]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteProfile(req, res, next) {
  try {
    const profile = await query(
      'SELECT is_primary FROM profiles WHERE id = $1 AND account_id = $2',
      [req.params.profileId, req.accountId]
    );

    if (!profile.rows.length) return res.status(404).json({ error: 'Profile not found' });
    if (profile.rows[0].is_primary) return res.status(400).json({ error: 'Cannot delete primary profile' });

    await query('DELETE FROM profiles WHERE id = $1', [req.params.profileId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const avatarUrl = `/uploads/${req.accountId}/${req.file.filename}`;

    await query(
      'UPDATE profiles SET avatar_url = $1, updated_at = NOW() WHERE id = $2 AND account_id = $3',
      [avatarUrl, req.params.profileId, req.accountId]
    );

    res.json({ avatarUrl });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfiles, getProfile, createProfile, updateProfile, deleteProfile, uploadAvatar };
