const express = require('express');
const router = express.Router();
const Training = require('../models/Training');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Middleware to authenticate the user
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'No token provided' });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ message: 'Invalid token' });
        req.user = decoded; // Save decoded user data to req.user
        next();
    });
};

// Route to get all training models for the current user
router.get('/models', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId; // Assuming userId is stored in token

        // Fetch all models for the current user
        const models = await Training.find({ user: userId }).select('trainModelId zipFileLink trigger_word version modelId modelName');

        // Fetch the status of each model from the Replicate API
        const replicateApiKey = process.env.REPLICATE_API_KEY; // Store this in your environment variables
        const modelsWithStatus = await Promise.all(
            models.map(async (model) => {
                try {
                    const replicateResponse = await axios.get(`https://api.replicate.com/v1/trainings/${model.trainModelId}`, {
                        headers: {
                            Authorization: `Bearer ${replicateApiKey}`
                        }
                    });
                    
                    return { ...model._doc, status: replicateResponse.data.status }; // Add status to the model
                } catch (err) {
                    console.error(`Error fetching status for model ${model.trainModelId}:`, err);
                    return { ...model._doc, status: 'Unknown' }; // If error occurs, return 'Unknown' status
                }
            })
        );

        res.json(modelsWithStatus);
    } catch (err) {
        console.error('Error fetching training models:', err);
        res.status(500).json({ message: 'Error fetching training models', error: err });
    }
});

module.exports = router;
