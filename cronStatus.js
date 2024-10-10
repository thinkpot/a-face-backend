const express = require('express');
const router = express.Router();
const cron = require('node-cron');
const axios = require('axios');
const Training = require('./models/Training');
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
    keyFilename: path.join(__dirname, './ai-face-generator-435017-76d6fa92854c.json')
});

// Map to store cron jobs for each user
const userCronJobs = new Map();

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
async function checkAndGenerateImage(training, userId) {
    try {
        const { trainModelId, trigger_word, gender, styleLink } = training;
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

            const user = await User.findById(userId);
            const pricing = await Pricing.findOne();
            if (!pricing) {
                console.error('Pricing data not found');
                return;
            }
            const imageGenerationCharge = pricing.imageGenerationCharge;
            if (user.credits < imageGenerationCharge) {
                console.error('Insufficient credits');
                return;
            }

            const replicate = new Replicate({
                auth: process.env.REPLICATE_API_KEY,
            });

            const generateResponse = await replicate.run(
                `${replicateResponse.data.output.version}`,
                {
                    input: {
                        model: "dev",
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

            const imageUrl = generateResponse[0];
            console.log(`Generated image URL: ${imageUrl}`);

            // Upload to Google Cloud Storage
            const imageResponse = await axios({
                url: imageUrl,
                method: 'GET',
                responseType: 'arraybuffer'
            });

            const imageBuffer = Buffer.from(imageResponse.data, 'binary');
            const folderName = user.googleId;
            const imageName = `generated-image-${uuidv4()}.jpg`;
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
            console.log(`Image generation for model ${trainModelId} completed and saved.`);

        } else if (status === 'failed') {
            console.log(`Training failed for model ${trainModelId}`);
            training.status = 'failed';
            await training.save();
        }
    } catch (error) {
        console.error(`Error processing model ${training.trainModelId}:`, error.message);
    }
}

// Function to start the cron job for a user
function startCronJob(userId) {
    if (userCronJobs.has(userId)) {
        console.log(`Cron job already running for user ${userId}`);
        return;
    }

    const task = cron.schedule('*/5 * * * *', async () => {
        console.log(`Cron job checking training status for user ${userId}...`);

        const ongoingTrainings = await Training.find({ user: userId, status: 'starting' });

        if (ongoingTrainings.length === 0) {
            console.log(`No ongoing trainings found for user ${userId}. Stopping cron job.`);
            stopCronJob(userId);
            return;
        }

        for (const training of ongoingTrainings) {
            await checkAndGenerateImage(training, userId);
        }
    }, {
        timezone: "Asia/Kolkata"
    });

    userCronJobs.set(userId, task);
    console.log(`Cron job started for user ${userId}.`);
}

// Function to stop the cron job for a user
function stopCronJob(userId) {
    const task = userCronJobs.get(userId);
    if (task) {
        task.stop();
        userCronJobs.delete(userId);
        console.log(`Cron job stopped for user ${userId}.`);
    }
}

// API to start the cron job manually after upload (for authenticated users)
router.post('/start-cron-job', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        startCronJob(userId);
        res.json({ message: 'Cron job started to monitor your model training status.' });
    } catch (error) {
        console.error('Error starting cron job:', error.message);
        res.status(500).json({ error: 'Error starting cron job.' });
    }
});

module.exports = router;