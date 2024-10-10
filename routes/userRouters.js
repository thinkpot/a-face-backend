// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Training = require('../models/Training');
const User = require('../models/User');
const { Storage, Acl } = require('@google-cloud/storage');
const path = require('path');
const axios = require('axios');

// Google Cloud Storage setup
const gcs = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: path.join(__dirname, '../ai-face-generator-435017-76d6fa92854c.json') // Path to your service account JSON file
});

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

        // Create a structured response where each model has its own images list
        const modelsWithImages = trainingModels.map(model => {
            return {
                modelId: model.modelId, // or model.name if you have a name field
                modelName: model.modelName, // Add modelName if you have it in your schema
                images: model.images_list || [] // Return the images list for the model
            };
        });

        // Check if any model has images
        const hasImages = modelsWithImages.some(model => model.images.length > 0);

        if (!hasImages) {
            return res.status(404).json({ message: 'No images found for the user.' });
        }

        // Return the structured list of models with their images
        res.json({ models: modelsWithImages });
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


router.post('/delete-image', async (req, res) => {

    // Extract the user ID from JWT token
    const token = req.headers.authorization.split(' ')[1]; // "Bearer <token>"
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decodedToken.userId;

    const user = await User.findById(userId);

    const { imageUrl, modelId } = req.body;

    console.log("Image url ", imageUrl)
    console.log("model Id ", modelId)
    try {
        // Find the training model for the current user
        const trainingModel = await Training.findOne({ user: userId, modelId: modelId });

        if (!trainingModel) {
            return res.status(404).json({ message: 'Training model not found' });
        }

        console.log()
        // Check if the image exists in the model's images_list
        const imageIndex = trainingModel.images_list.indexOf(imageUrl);
        if (imageIndex === -1) {
            return res.status(404).json({ message: 'Image not found in this model.' });
        }

        // Remove the image URL from the images_list
        trainingModel.images_list.splice(imageIndex, 1); // Remove the image
        await trainingModel.save(); // Save the updated model

        // Delete the image from Google Cloud Storage
        const fileName = imageUrl.split('/').pop(); // Extract the file name from the URL
        const folderName = user.googleId; // Assuming folder name is the user ID
        const bucketName = `${process.env.GCLOUD_STORAGE_BUCKET}`;
        const file = gcs.bucket(bucketName).file(`${folderName}/${fileName}`);

        await file.delete();

        // Send success response
        res.status(200).json({ message: 'Image deleted successfully' });

    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

router.post('/generate-prompt', async (req, res) => {
    try {
        const { desire } = req.body;

        // Call the external API with axios
        const response = await axios.post('https://flux1.ai/api/chat', {
            messages: `Generate a detailed image prompt based on this short description: "${desire}"`,
        });

        // Return the response from the external API to the client
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error generating prompt:', error);
        res.status(500).json({ message: 'Failed to generate prompt', error: error.message });
    }
});


module.exports = router;

