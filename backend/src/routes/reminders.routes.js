const router = require('express').Router();
const { getReminders, addReminder, updateReminder, deleteReminder } = require('../controllers/reminders.controller');
router.get('/', getReminders);
router.post('/', addReminder);
router.patch('/:id', updateReminder);
router.delete('/:id', deleteReminder);
module.exports = router;
