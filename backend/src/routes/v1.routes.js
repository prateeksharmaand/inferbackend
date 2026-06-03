const router = require('express').Router();
const { loginStaff } = require('../emr/emr.labstaff.controller');
const labManagementRoutes = require('./labs/labManagementRoutes');
const labUploadRoutes = require('./labs/labUploadRoutes');

// Lab staff login (v1 API for OPD portal)
router.post('/auth/lab/login', loginStaff);

// Lab management endpoints
router.use('/admin', labManagementRoutes);

// Lab upload endpoints
router.use('/labs', labUploadRoutes);

module.exports = router;
