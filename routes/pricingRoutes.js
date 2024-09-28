// routes/pricingRoutes.js
const express = require('express');
const router = express.Router();
const { getPricing, updatePricing } = require('../controllers/pricingController');

// Get pricing details
router.get('/pricing', getPricing);

// Update pricing (only for admin use, protect this route as needed)
router.put('/pricing', updatePricing);

module.exports = router;
