const { query } = require('../config/database');
const { checkMultipleInteractions, getDrugInfo } = require('../services/drugInteractionService');

async function getMedicines(req, res, next) {
  try {
    const { profileId } = req.params;
    const { active } = req.query;

    let sql = 'SELECT * FROM medicines WHERE profile_id = $1';
    const params = [profileId];

    if (active !== undefined) {
      sql += ' AND is_active = $2';
      params.push(active === 'true');
    }

    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function addMedicine(req, res, next) {
  try {
    const { profileId, name, genericName, brandName, dosage, dosageUnit, frequency, route,
      prescribedBy, startDate, endDate, notes, reminderTimes, daysOfWeek } = req.body;

    const result = await query(
      `INSERT INTO medicines (profile_id, name, generic_name, brand_name, dosage, dosage_unit,
        frequency, route, prescribed_by, start_date, end_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [profileId, name, genericName, brandName, dosage, dosageUnit, frequency, route || 'oral',
        prescribedBy, startDate, endDate, notes]
    );

    const medicine = result.rows[0];

    // Set up reminders if provided
    if (reminderTimes && reminderTimes.length > 0) {
      await query(
        `INSERT INTO medicine_reminders (medicine_id, profile_id, reminder_times, days_of_week)
         VALUES ($1, $2, $3, $4)`,
        [medicine.id, profileId, reminderTimes, daysOfWeek || [0, 1, 2, 3, 4, 5, 6]]
      );
    }

    // Add to timeline
    await query(
      `INSERT INTO timeline_events (profile_id, event_type, title, reference_id, reference_type)
       VALUES ($1, 'medicine', $2, $3, 'medicine')`,
      [profileId, `Started ${name} ${dosage}`, medicine.id]
    );

    res.status(201).json(medicine);
  } catch (err) {
    next(err);
  }
}

async function updateMedicine(req, res, next) {
  try {
    const { name, dosage, dosageUnit, frequency, isActive, endDate, notes } = req.body;

    const result = await query(
      `UPDATE medicines SET
        name = COALESCE($1, name),
        dosage = COALESCE($2, dosage),
        dosage_unit = COALESCE($3, dosage_unit),
        frequency = COALESCE($4, frequency),
        is_active = COALESCE($5, is_active),
        end_date = COALESCE($6, end_date),
        notes = COALESCE($7, notes),
        updated_at = NOW()
       WHERE id = $8 AND profile_id IN (SELECT id FROM profiles WHERE account_id = $9) RETURNING *`,
      [name, dosage, dosageUnit, frequency, isActive, endDate, notes, req.params.medicineId, req.accountId]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Medicine not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteMedicine(req, res, next) {
  try {
    await query(
      `DELETE FROM medicines WHERE id = $1
       AND profile_id IN (SELECT id FROM profiles WHERE account_id = $2)`,
      [req.params.medicineId, req.accountId]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function logMedicineTaken(req, res, next) {
  try {
    const { medicineId, profileId, status, scheduledAt, notes } = req.body;

    const result = await query(
      `INSERT INTO medicine_logs (medicine_id, profile_id, status, scheduled_at, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [medicineId, profileId, status || 'taken', scheduledAt, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function checkInteractions(req, res, next) {
  try {
    const { profileId } = req.params;

    const medicines = await query(
      'SELECT name, generic_name FROM medicines WHERE profile_id = $1 AND is_active = TRUE',
      [profileId]
    );

    const drugNames = medicines.rows.map(m => m.generic_name || m.name);
    if (drugNames.length < 2) {
      return res.json({ interactions: [], message: 'Need at least 2 active medicines to check' });
    }

    const interactions = await checkMultipleInteractions(drugNames);
    res.json({ interactions });
  } catch (err) {
    next(err);
  }
}

async function getDrugInformation(req, res, next) {
  try {
    const { drugName } = req.params;
    const info = await getDrugInfo(drugName);
    if (!info) return res.status(404).json({ error: 'Drug information not found' });
    res.json(info);
  } catch (err) {
    next(err);
  }
}

async function getReminders(req, res, next) {
  try {
    const { profileId } = req.params;
    const result = await query(
      `SELECT mr.*, m.name, m.dosage, m.dosage_unit FROM medicine_reminders mr
       JOIN medicines m ON mr.medicine_id = m.id
       WHERE mr.profile_id = $1 AND mr.is_active = TRUE`,
      [profileId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMedicines, addMedicine, updateMedicine, deleteMedicine, logMedicineTaken, checkInteractions, getDrugInformation, getReminders };
