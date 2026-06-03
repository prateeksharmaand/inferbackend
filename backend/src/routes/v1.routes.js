const router = require('express').Router();
const { loginStaff } = require('../emr/emr.labstaff.controller');
const labManagementRoutes = require('./labs/labManagementRoutes');
const labUploadRoutes = require('./labs/labUploadRoutes');
const orderRoutes = require('./labs/orderRoutes');
const sampleRoutes = require('./labs/sampleRoutes');
const reportRoutes = require('./labs/reportRoutes');
const analyticsRoutes = require('./labs/analyticsRoutes');
const catalogRoutes = require('./labs/catalogRoutes');
const labResultRoutes = require('./doctors/labResultRoutes');

// Lab staff login (v1 API for OPD portal)
router.post('/auth/lab/login', loginStaff);

// Lab management endpoints
router.use('/admin', labManagementRoutes);

// Lab upload endpoints
router.use('/labs', labUploadRoutes);

// Order management
router.use('/orders', orderRoutes);

// Sample tracking
router.use('/samples', sampleRoutes);

// Reports
router.use('/reports', reportRoutes);

// Analytics (routes prefixed /analytics internally)
router.use('/', analyticsRoutes);

// Test catalog and panels (routes prefixed /catalog and /panels internally)
router.use('/', catalogRoutes);

// Doctor-facing lab results
router.use('/doctors', labResultRoutes);

module.exports = router;
