const router = require('express').Router();
const { getTimeline } = require('../controllers/timeline.controller');
router.get('/', getTimeline);
module.exports = router;
