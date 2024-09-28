const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User'); // Import your User model
const router = express.Router();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Route to handle Google token exchange
router.post('/google/callback', async (req, res) => {
    const { token } = req.body;
    console.log("Received token:", token); // Debugging line

    if (!token) {
        return res.status(400).json({ message: 'Token is required' });
    }

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        console.log("Payload:", payload); // Debugging line

        const { sub: googleId, email, name, picture: profilePic } = payload;

        // Check if the user already exists in the database
        let user = await User.findOne({ googleId });

        if (!user) {
            // If the user doesn't exist, create a new user
            user = new User({
                googleId,
                name,
                email,
                profilePic
            });
            await user.save();
        }

        // Generate a JWT token with the user info
        const jwtToken = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '10h' });

        console.log("JWT token", jwtToken);
        res.json({ token: jwtToken, user });
    } catch (error) {
        console.error("Error verifying token:", error); // Debugging line
        res.status(401).json({ message: 'Invalid token' });
    }
});

module.exports = router;
