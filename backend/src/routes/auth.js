const express = require('express');
const router = express.Router();
const { register, login, updateFcmToken, changePassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.put('/fcm-token', authenticate, updateFcmToken);
router.put('/change-password', authenticate, changePassword);

module.exports = router;
