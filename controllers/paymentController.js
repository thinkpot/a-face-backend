const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User'); // Assuming you have a User model to track credits

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
