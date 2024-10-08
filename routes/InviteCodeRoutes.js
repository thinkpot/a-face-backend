// routes/inviteCode.js
const express = require('express');
const router = express.Router();
const InviteUsage = require('../models/InviteUsage');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Function to generate a random invite code
const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase(); // Random alphanumeric string
};

// Create a new invite code
router.post('/create', async (req, res) => {
    try {
        const code = generateInviteCode();
        const newInviteCode = new InviteUsage({ inviteCode: code });
        await newInviteCode.save();
        res.status(201).json({ message: 'Invite code created successfully', code });
    } catch (error) {
        console.error('Error creating invite code:', error);
        res.status(500).json({ message: 'Error creating invite code' });
    }
});

// Fetch a specific invite code by ID
router.get('/:inviteCode', async (req, res) => {
    try {
      const { inviteCode } = req.params;
  
      // Find the invite usage by invite code
      const inviteUsage = await InviteUsage.findOne({ inviteCode });
  
      if (!inviteUsage) {
        return res.status(404).json({ message: 'Invite code not found.' });
      }
  
      // Send back the invite code details
      res.json(inviteUsage);
    } catch (error) {
      console.error('Error fetching invite code:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

router.post('/redeem-invite', async (req, res) => {
    const { inviteCode } = req.body;

    try {

        // Extract the user ID from JWT token
        const token = req.headers.authorization.split(' ')[1]; // "Bearer <token>"
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decodedToken.userId;
        const user = await User.findById(userId);

        // Find the invite code usage document
        let invite = await InviteUsage.findOne({ inviteCode });

        if (!invite) {
            return res.status(400).json({ message: 'Invalid invite code.' });
        }

        // Check if the invite code has been used up
        if (invite.usageCount >= invite.maxUsage) {
            return res.status(400).json({ message: 'Invite code usage limit reached.' });
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (user.inviteCodeRedeemed) {
            return res.status(400).json({ message: 'User has already redeemed an invite code.' });
        }

        // Update the invite usage count
        invite.usageCount += 1;
        await invite.save();

        // Add credits to the user account
        user.credits += invite.freeCreditsAmount;
        user.inviteCodeRedeemed = true; // Mark that the user has redeemed the invite
        await user.save();

        res.json({ message: 'Invite code redeemed successfully. Credits added to your account.', credits: user.credits });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error.' });
    }
});


module.exports = router;
