const express = require('express');
const authMiddleware = require('../middleware/auth');
const authRoutes = require('./auth.routes');
const vitalsRoutes = require('./vitals.routes');
const documentsRoutes = require('./documents.routes');
const healthbotRoutes = require('./healthbot.routes');
const remindersRoutes = require('./reminders.routes');
const timelineRoutes = require('./timeline.routes');
const ocrRoutes = require('./ocr.routes');
const gmailRoutes = require('./gmail.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/vitals', authMiddleware, vitalsRoutes);
router.use('/documents', authMiddleware, documentsRoutes);
router.use('/healthbot', authMiddleware, healthbotRoutes);
router.use('/reminders', authMiddleware, remindersRoutes);
router.use('/timeline', authMiddleware, timelineRoutes);
router.use('/ocr', authMiddleware, ocrRoutes);
router.use('/gmail', gmailRoutes); // auth handled inside gmail.routes.js (callback is public)

module.exports = router;
