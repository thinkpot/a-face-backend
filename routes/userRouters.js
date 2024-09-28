// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Training = require('../models/Training');
const User = require('../models/User');

// Example route to get user information (authenticated)
router.get('/profile', (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        // Send user profile information
        res.json(decoded);
        // console.log("User info ", decoded.email)
    });
});

router.get('/get-credits', async (req, res) => {
    try {
      const token = req.headers.authorization.split(' ')[1]; // Extract JWT token
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET); // Verify token
      const user = await User.findById(decodedToken.userId); // Find the user by ID
  
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      console.log(user)
  
      res.status(200).json({ credits: user.credits }); // Return the user's credits
    } catch (error) {
      res.status(500).json({ message: 'Error fetching credits', error: error.message });
    }
  });


router.get('/images', async (req, res) => {
    try {
        // Extract the user ID from JWT token
        const token = req.headers.authorization.split(' ')[1]; // "Bearer <token>"
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decodedToken.userId;

        // Find all training models for this user
        const trainingModels = await Training.find({ user: userId });

        if (!trainingModels || trainingModels.length === 0) {
            return res.status(404).json({ message: 'No models or images found for the user.' });
        }

        // Extract all images from the user's training models
        const images = trainingModels.reduce((acc, model) => {
            if (model.images_list && model.images_list.length > 0) {
                acc.push(...model.images_list); // Collect all images
            }
            return acc;
        }, []);

        if (images.length === 0) {
            return res.status(404).json({ message: 'No images found for the user.' });
        }

        // Return all the images
        res.json({ images });
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


module.exports = router;
