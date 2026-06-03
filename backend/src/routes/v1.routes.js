const router = require('express').Router();
const { loginStaff } = require('../emr/emr.labstaff.controller');

// Lab staff login (v1 API for OPD portal)
router.post('/auth/lab/login', loginStaff);

module.exports = router;
