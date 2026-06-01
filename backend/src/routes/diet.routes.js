const express = require('express');
const c = require('../controllers/diet.controller');
const router = express.Router();

// ensure DB tables exist on first use
c.ensureTables().catch(console.error);

router.get('/charts',           c.listCharts);
router.post('/charts',          c.createChart);
router.put('/charts/:id',       c.updateChart);
router.delete('/charts/:id',    c.deleteChart);

router.get('/templates',        c.listTemplates);
router.post('/templates',       c.saveTemplate);

router.get('/food-items',       c.listFoodItems);
router.post('/food-items',      c.createFoodItem);
router.put('/food-items/:id',   c.updateFoodItem);
router.delete('/food-items/:id',c.deleteFoodItem);

router.get('/food-groups',        c.listFoodGroups);
router.post('/food-groups',       c.createFoodGroup);
router.delete('/food-groups/:id', c.deleteFoodGroup);

router.post('/ai-meal-plan',      c.generateAIMealPlan);

module.exports = router;
