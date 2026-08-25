// backend/routes/analytics.js
const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');

// GET /api/analytics - Full Visual Analytics Data Endpoint
router.get('/', async (req, res) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      customer: req.query.customer,
      loom: req.query.loom,
      design: req.query.design,
      beam: req.query.beam,
      unit: req.query.unit,
      order: req.query.order,
      status: req.query.status,
      vendor: req.query.vendor,
      productionType: req.query.productionType
    };
    const data = await analyticsService.getDashboardData(filters);
    res.json(data);
  } catch (err) {
    console.error('Analytics route error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

module.exports = router;
