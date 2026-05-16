const { query } = require('../config/database');

async function getNotifications(req, res, next) {
  try {
    const { unread, limit = 30, offset = 0 } = req.query;

    let sql = `SELECT n.*, p.full_name as profile_name FROM notifications n
               LEFT JOIN profiles p ON n.profile_id = p.id
               WHERE n.account_id = $1`;
    const params = [req.accountId];

    if (unread === 'true') {
      sql += ' AND n.is_read = FALSE';
    }

    sql += ` ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);
    const countResult = await query(
      'SELECT COUNT(*) FROM notifications WHERE account_id = $1 AND is_read = FALSE',
      [req.accountId]
    );

    res.json({ notifications: result.rows, unreadCount: parseInt(countResult.rows[0].count) });
  } catch (err) {
    next(err);
  }
}

async function markAsRead(req, res, next) {
  try {
    const { notificationIds } = req.body;

    if (notificationIds?.length) {
      await query(
        'UPDATE notifications SET is_read = TRUE WHERE id = ANY($1) AND account_id = $2',
        [notificationIds, req.accountId]
      );
    } else {
      await query('UPDATE notifications SET is_read = TRUE WHERE account_id = $1', [req.accountId]);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getNotifications, markAsRead };
