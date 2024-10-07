const express = require('express');
const { createOrder, verifyPayment, getUserCredits, createCashFreeOrder, verifyCashFreePayment } = require('../controllers/paymentController');
const router = express.Router();

router.post('/create-order', createOrder);
router.post('/verify-payment', verifyPayment);
router.get('/credits/:userId', getUserCredits);

router.post('/create-cashfree-order', createCashFreeOrder);
router.post('/verify-cashfree-payment', verifyCashFreePayment);

router.get('/payment-success', (req, res) => {
    const orderId = req.query.order_id;
    // Here, you can handle whatever logic you need after successful payment
    // For example, you could display a success message or redirect to a user dashboard
    res.send(`Payment was successful for order ID: ${orderId}`);
});

module.exports = router;
