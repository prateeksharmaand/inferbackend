const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead } = require('../controllers/notificationsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', getNotifications);
router.put('/read', markAsRead);

module.exports = router;
