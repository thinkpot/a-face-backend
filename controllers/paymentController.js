const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User'); // Assuming you have a User model to track credits
const axios = require('axios');

// Initialize Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});


// Create Razorpay order
exports.createOrder = async (req, res) => {
    try {
        const { amount } = req.body;

        const options = {
            amount: amount * 100, // Amount is in paise, so multiply by 100 for Rs
            currency: 'INR',
            receipt: crypto.randomBytes(10).toString('hex'), // Unique receipt ID
        };

        const order = await razorpay.orders.create(options);
        res.status(200).json({
            success: true,
            order,
        });
    } catch (error) {
        console.error('Error in createOrder:', error);
        res.status(500).json({
            success: false,
            message: 'Could not create order',
            error: error.message,
        });
    }
};

// Verify payment and update user credits
exports.verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, amount } = req.body;
        const body = razorpay_order_id + '|' + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            // Find user and update credits
            const user = await User.findById(userId);
            console.log("User ", user)
            if (user) {
                // Add credits to the user, assuming 1 Rs = 1 credit
                user.credits += amount;
                await user.save();
                console.log("Added Credits ", amount)

                res.status(200).json({
                    success: true,
                    message: `${amount} credits added to the user account`,
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }
        } else {
            res.status(400).json({
                success: false,
                message: 'Invalid signature, payment verification failed',
            });
        }
    } catch (error) {
        console.error('Error in verifyPayment:', error);
        res.status(500).json({
            success: false,
            message: 'Could not verify payment',
            error: error.message,
        });
    }
};

// Fetch current user credits
exports.getUserCredits = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);

        if (user) {
            res.status(200).json({
                success: true,
                credits: user.credits,
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
    } catch (error) {
        console.error('Error in getUserCredits:', error);
        res.status(500).json({
            success: false,
            message: 'Could not fetch user credits',
            error: error.message,
        });
    }
};



// Cashfree API configuration
const CASHFREE_API_URL = process.env.CASHFREE_API_URL || 'https://sandbox.cashfree.com/pg'; // Use 'https://api.cashfree.com/pg' for production
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;


// Create Cashfree order
exports.createCashFreeOrder = async (req, res) => {
    try {
        const { amount, customerEmail, customerName, userId } = req.body;

        const orderData = {
            order_id: crypto.randomBytes(10).toString('hex'),  // Unique order ID
            order_amount: amount,
            order_currency: 'INR',
            customer_details: {
                customer_id: userId,
                customer_email: customerEmail,
                customer_name: customerName,
                customer_phone:"+918888888888"
            },
            order_meta: {
                return_url: `${process.env.FRONTEND_URL}/upload`,
                notify_url: `${process.env.APP_URL}/api/payment/verify-cashfree-payment`,
            },
            order_note: 'Payment for credits'
        };

        const response = await axios.post(`${CASHFREE_API_URL}/orders`, orderData, {
            headers: {
                'x-client-id': CASHFREE_APP_ID,
                'x-client-secret': CASHFREE_SECRET_KEY,
                'x-api-version': '2022-09-01',
                'Content-Type': 'application/json'
            }
        });

        console.log("Response " , response.data)
        if (response.data.order_status === 'ACTIVE') {
            res.status(200).json({
                success: true,
                paymentLink: response.data.payments.url,
                orderId: orderData.order_id,
                payment_session_id: response.data.payment_session_id
            });
            
        } else {
            throw new Error('Failed to create Cashfree order');
        }
    } catch (error) {
        console.error('Error in createCashFreeOrder:', error.response ? error.response.data : error.message);
        res.status(500).json({
            success: false,
            message: 'Could not create order',
            error: error.response ? error.response.data : error.message,
        });
    }
};


const generateCashfreeSignature = (orderId, orderAmount) => {
    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
  
    const stringToSign = `${appId}|${orderId}|${orderAmount}`;
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(stringToSign)
      .digest('hex');
      
    return signature;
  };


// Verify Cashfree payment and update user credits
exports.verifyCashFreePayment = async (req, res) => {
    try {
        const { order_id, userId, amount } = req.body;

        const response = await axios.get(`${CASHFREE_API_URL}/orders/${order_id}`, {
            headers: {
                'x-client-id': CASHFREE_APP_ID,
                'x-client-secret': CASHFREE_SECRET_KEY,
                'x-api-version': '2022-09-01'
            }
        });

        if (response.data.order_status === 'PAID') {
            const user = await User.findById(userId);

            if (user) {
                user.credits += amount;
                await user.save();

                res.status(200).json({
                    success: true,
                    message: `${amount} credits added to the user account`,
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }
        } else {
            res.status(400).json({
                success: false,
                message: `Payment verification failed: ${response.data.order_status}`,
            });
        }
    } catch (error) {
        console.error('Error in verifyCashFreePayment:', error.response ? error.response.data : error.message);
        res.status(500).json({
            success: false,
            message: 'Could not verify payment',
            error: error.response ? error.response.data : error.message,
        });
    }
};
