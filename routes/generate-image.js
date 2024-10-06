const express = require('express');
const axios = require('axios');
const router = express.Router();
const Replicate = require('replicate');
const Training = require('../models/Training');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Pricing = require('../models/Pricing');
const { Storage, Acl } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Google Cloud Storage setup
const gcs = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: path.join(__dirname, '../ai-face-generator-435017-76d6fa92854c.json') // Path to your service account JSON file
});

// Replace with your actual Replicate API key
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;

router.post('/generate-image', async (req, res) => {
    const { prompt, version, trigger_word, modelId } = req.body;
    try {

        // Retrieve user from the JWT token (assuming JWT token is in headers)
        const token = req.headers.authorization.split(' ')[1]; // "Bearer <token>"
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decodedToken.userId;

        // Fetch the user from the database
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Fetch the pricing model for image generation charge
        const pricing = await Pricing.findOne();
        if (!pricing) {
            return res.status(404).json({ error: 'Pricing data not found' });
          }
        const imageGenerationCharge = pricing.imageGenerationCharge;

        // Check if user has enough credits
        if (user.credits < imageGenerationCharge) {
            return res.status(400).json({ message: 'Insufficient credits' });
        }

        // Set up authorization header with Replicate API key
        const replicate = new Replicate({
            auth: process.env.REPLICATE_API_KEY,
        });

        const output = await replicate.run(
            `${version}`,
            {
                input: {
                    model: "dev",
                    prompt: trigger_word + " " + prompt,
                    lora_scale: 1,
                    num_outputs: 1,
                    aspect_ratio: "1:1",
                    output_format: "jpg",
                    guidance_scale: 3.5,
                    output_quality: 90,
                    prompt_strength: 0.8,
                    extra_lora_scale: 1,
                    num_inference_steps: 28
                }
            }
        );

        // The URL from Replicate API
        const replicateImageUrl = output[0];

        // Deduct the credits for image generation
        user.credits -= imageGenerationCharge;
        await user.save();
        console.log("Image Generation Charges Deducted ",imageGenerationCharge)

        // Fetch the image from the URL
        const imageResponse = await axios({
            url: replicateImageUrl,
            method: 'GET',
            responseType: 'arraybuffer'
        });

        const imageBuffer = Buffer.from(imageResponse.data, 'binary');
        const googleId = user.googleId;
        const folderName = googleId;
        const imageName = `generated-image-${uuidv4()}.jpg`; // Generate a unique name for the image
        const destinationPath = `${folderName}/${imageName}`;

        // Upload the image to Google Cloud Storage
        const bucketName = 'ai_face_bucket_1';
        const file = gcs.bucket(bucketName).file(destinationPath);
        await file.save(imageBuffer, {
            metadata: {
                contentType: 'image/jpeg',
            }
        });

        // Make the file publicly accessible
        await file.makePublic();

        // Get the public URL of the uploaded image
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${destinationPath}`;

        const trainingModel = await Training.findOne({ modelId: modelId });
        if (!trainingModel) {
            return res.status(404).json({ message: 'Training model not found' });
        }

        // Add the public URL to images_list
        trainingModel.images_list.push(publicUrl);
        await trainingModel.save();

        // Send the result URL back to the client
        return res.status(200).json({ imageUrl: publicUrl });

    } catch (error) {
        console.error('Error generating image:', error);
        return res.status(500).json({ error: 'Failed to generate image or upload to cloud' });
    }
});

module.exports = router;

/* Working */