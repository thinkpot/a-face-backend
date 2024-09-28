const express = require('express');
const { createOrder, verifyPayment, getUserCredits } = require('../controllers/paymentController');
const router = express.Router();

router.post('/create-order', createOrder);
router.post('/verify-payment', verifyPayment);
router.get('/credits/:userId', getUserCredits);

module.exports = router;
