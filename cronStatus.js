const express = require('express');
const router = express.Router();
const cron = require('node-cron');
const axios = require('axios');
const Training = require('./models/Training'); // Your Training model
const Replicate = require('replicate');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Pricing = require('./models/Pricing');
const { v4: uuidv4 } = require('uuid');
const { Storage } = require('@google-cloud/storage');
const path = require('path');


// Google Cloud Storage setup
const gcs = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: path.join(__dirname, './ai-face-generator-435017-76d6fa92854c.json') // Path to your service account JSON file
});
// Global flag to track if the cron job is running
let cronJobRunning = false;
let imageGenerationInProgress = false; // Ensure only one image generation happens at a time

// Middleware to authenticate the user via JWT
function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
}

// Function to check training status and generate image if succeeded
async function checkAndGenerateImage(training, task) {
    try {
        if (imageGenerationInProgress) {
            console.log('Image generation already in progress, skipping this iteration.');
            return;
        }

        const { trainModelId, trigger_word, gender, user, styleLink } = training;
        const replicateResponse = await axios.get(`https://api.replicate.com/v1/trainings/${trainModelId}`, {
            headers: {
                Authorization: `Bearer ${process.env.REPLICATE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const { status, version } = replicateResponse.data;
        console.log(`Training status for model ${trainModelId}: ${status}`);

        if (status === 'succeeded') {
            console.log(`Training succeeded for model ${trainModelId}. Generating image...`);

            imageGenerationInProgress = true; // Set flag to prevent multiple image generations

            const user = await User.findById(training.user);
            
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
            console.log("User ", user, "Charge ", imageGenerationCharge, "Credits ", user.credits)
            const replicate = new Replicate({
                auth: process.env.REPLICATE_API_KEY,
            });

            const generateResponse = await replicate.run(
                `${replicateResponse.data.output.version}`,  // Use the version from the Replicate response
                {
                    input: {
                        model: "dev",  // Example model (replace if needed)
                        prompt: `${trigger_word} is ${gender}`,
                        lora_scale: 1,
                        num_outputs: 1,
                        aspect_ratio: "1:1",
                        output_format: "webp",
                        guidance_scale: 3.5,
                        output_quality: 90,
                        prompt_strength: 0.8,
                        extra_lora_scale: 1,
                        num_inference_steps: 28,
                        image: styleLink,
                    }
                }
            );

            const imageUrl = generateResponse;
            console.log(`Generated image URL: ${imageUrl}`);
            // Now uploading to Cloud Storage
            console.log("Now uploading to gdrive")
            const imageResponse = await axios({
                url: imageUrl[0],
                method: 'GET',
                responseType: 'arraybuffer'
            });

            const imageBuffer = Buffer.from(imageResponse.data, 'binary');
            const googleId = user.googleId;
            const folderName = googleId;
            const imageName = `generated-image-${uuidv4()}.jpg`; // Generate a unique name for the image
            const destinationPath = `${folderName}/${imageName}`;

            const bucketName = process.env.GCLOUD_STORAGE_BUCKET;
            const file = gcs.bucket(bucketName).file(destinationPath);
            await file.save(imageBuffer, {
                metadata: {
                    contentType: 'image/jpeg',
                }
            });

            await file.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${destinationPath}`;

            // Update training with generated image URL and status
            training.generatedImageUrl = publicUrl;
            training.status = 'succeeded';
            training.version = replicateResponse.data.output.version;
            training.images_list.push(publicUrl);
            await training.save();

            // Deduct the credits for image generation
            user.credits -= imageGenerationCharge;
            await user.save();
            console.log("Image Generation Charges Deducted ", user.credits)
            console.log(`Image generation for model ${trainModelId} completed and saved.`);

            // After successful generation, stop the cron job
            stopCronJob(task);
            imageGenerationInProgress = false; // Reset flag after completion
        } else if (status === 'failed') {
            console.log(`Training failed for model ${trainModelId}`);
            training.status = 'failed';
            await training.save();
        }
    } catch (error) {
        console.error(`Error processing model ${training.trainModelId}:`, error.message);
        imageGenerationInProgress = false; // Reset flag on error
    }
}

// Function to start the cron job for the user
function startCronJob(userId) {
    if (cronJobRunning) {
        console.log('Cron job already running, skipping new job scheduling.');
        return;
    }

    cronJobRunning = true; // Mark cron job as running

    const current_task = cron.schedule('*/5 * * * *', async () => { // Check every 10 seconds
        console.log('Cron job checking training status...');
        if (imageGenerationInProgress) {
            console.log('Image generation is in progress, waiting for completion.');
            return; // Skip iteration if image generation is in progress
        }

        // Find the ongoing training models for the user
        const ongoingTrainings = await Training.find({ user: userId, status: 'starting' });

        if (ongoingTrainings.length === 0) {
            console.log('No ongoing trainings found. Stopping cron job.');
            stopCronJob(current_task); // Stop the cron job if no ongoing trainings
            return;
        }

        // Process each ongoing training
        for (const training of ongoingTrainings) {
            await checkAndGenerateImage(training, current_task); // Process each training status
        }

    }, {
        timezone: "Asia/Kolkata" // Indian timezone
    });

    console.log('Cron job started.');
}

// Function to stop the cron job
function stopCronJob(task) {
    task.stop();
    cronJobRunning = false;
    console.log('Cron job stopped.');

}

// API to start the cron job manually after upload (for authenticated users)
router.post('/start-cron-job', authenticateToken, async (req, res) => {
    try {
        // Extract the user ID from JWT token
        const token = req.headers.authorization.split(' ')[1]; // "Bearer <token>"
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decodedToken.userId;
        // Start the cron job for the logged-in user

        startCronJob(userId);

        res.json({ message: 'Cron job started to monitor your model training status.' });
    } catch (error) {
        console.error('Error starting cron job:', error.message);
        res.status(500).json({ error: 'Error starting cron job.' });
    }
});

module.exports = router; // Export router for use in server.js
