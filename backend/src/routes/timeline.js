const express = require('express');
const router = express.Router();
const { getTimeline, addTimelineNote, deleteTimelineEvent } = require('../controllers/timelineController');
const { authenticate, authorizeProfile } = require('../middleware/auth');

router.use(authenticate);

router.get('/profile/:profileId', authorizeProfile, getTimeline);
router.post('/note', addTimelineNote);
router.delete('/:eventId', deleteTimelineEvent);

module.exports = router;
