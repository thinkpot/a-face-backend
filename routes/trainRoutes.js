const express = require('express');
const router = express.Router();
const multer = require('multer');
const Replicate = require('replicate');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // To generate random trainModelId
const jwt = require('jsonwebtoken'); // To decode JWT
const User = require('../models/User'); // Import User model
const Training = require('../models/Training'); // Import Training model
const Pricing = require('../models/Pricing'); // Import Pricing model
const { Storage } = require('@google-cloud/storage');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir); // Create the directory if it doesn't exist
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const gcs = new Storage();
const upload = multer({ storage: storage });
const bucketName = 'ai_face_bucket_1';

const generateUniqueTriggerWord = () => {
    const triggerWordLength = 9; // Length from 0-9
    const digits = '0123456789';
    let triggerWord = '';
    for (let i = 0; i < triggerWordLength; i++) {
        triggerWord += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return triggerWord;
};

router.post('/train', upload.single('file'), async (req, res) => {
    try {
        // Log the uploaded file's details
        const filePath = path.join(__dirname, '..', 'uploads', req.file.filename);

        // Check if the file exists at the specified path
        if (!fs.existsSync(filePath)) {
            return res.status(400).json({ message: 'File upload failed' });
        }

        // Retrieve user from the JWT token (assuming JWT token is in headers)
        const token = req.headers.authorization.split(' ')[1]; // "Bearer <token>"
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decodedToken.userId;

        // Generate a unique trigger word
        const triggerWord = generateUniqueTriggerWord();

        // Retrieve gender from request body
        const { gender, style, modelName } = req.body;
        console.log("Style hh ", style)
        if (!gender) {
            return res.status(400).json({ message: 'Gender is required' });
        }

        // Fetch the user from the database
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Fetch pricing details from the Pricing model
        const pricingDetails = await Pricing.findOne(); // Fetch the pricing document
        const trainingCost = pricingDetails ? pricingDetails.modelTrainingCharge : 300; // Default to 300 if not found
        const imageGenerationCost = pricingDetails ? pricingDetails.imageGenerationCharge : 7; 

        const totalCost = trainingCost + imageGenerationCost
        // Check if user has enough credits
        if (user.credits < totalCost) {
            return res.status(400).json({ message: 'Insufficient credits to train the model' });
        }

        const googleId = user.googleId;
        const trainModelId = crypto.randomBytes(8).toString('hex'); // Temporary ID
        const modelId = crypto.randomBytes(8).toString('hex');
        const folderName = googleId;
        const fileName = `${modelId}.zip`;
        const destinationPath = `${folderName}/${fileName}`;

        console.log("model id ", modelId)

        // Upload file to Google Cloud Storage
        await gcs.bucket(bucketName).upload(filePath, {
            destination: destinationPath,
            public: true
        });

        const publicUrl = `https://storage.googleapis.com/${process.env.GCLOUD_STORAGE_BUCKET}/${destinationPath}`;

        console.log(`File uploaded to ${bucketName}/${destinationPath}`);

        // Save initial training details to the database
        const newTraining = new Training({
            trainModelId: modelId, // Temporary ID before actual model ID from Replicate API
            user: user._id, // Associate the training with the user
            zipFileLink: publicUrl,
            trigger_word: triggerWord,
            modelId:modelId,
            version:"1",
            status:"starting",
            styleLink:style,
            modelName:modelName,
            gender
        });

        const savedTraining = await newTraining.save();

        // Initialize Replicate API
        const replicate = new Replicate({
            auth: process.env.REPLICATE_API_KEY,
        });

        // Step 1: Create a new model on Replicate
        const replicateResponse = await axios.post(
            'https://api.replicate.com/v1/models',
            {
                owner: process.env.REPLICATE_USER,
                name: modelId, // Use the trainModelId as the model name for uniqueness
                description: "Model created using Axios",
                visibility: "private", // Make the model public
                hardware: "cpu" // Specify the hardware
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.REPLICATE_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const newModel = replicateResponse.data;
        const replicate_user = process.env.REPLICATE_USER

        console.log("Model created successfully:");

        // Step 2: Initiate training with the newly created model and use the model name in the destination
        const trainingResponse = await replicate.trainings.create(
            "ostris",
            "flux-dev-lora-trainer",
            "885394e6a31c6f349dd4f9e6e7ffbabd8d9840ab2559ab78aed6b2451ab2cfef",
            {
                destination: `${replicate_user}/${modelId}`, // Use the newly created model's name here
                input: {
                    steps: 1000,
                    hf_token: "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",
                    lora_rank: 16,
                    optimizer: "adamw8bit",
                    batch_size: 1,
                    hf_repo_id: `${replicate_user}/shahid_fluxlora`,
                    resolution: "512,768,1024",
                    autocaption: true,
                    input_images: publicUrl,
                    trigger_word: triggerWord,
                    learning_rate: 0.0004,
                    wandb_project: "flux_train_replicate",
                    wandb_save_interval: 100,
                    caption_dropout_rate: 0.05,
                    cache_latents_to_disk: false,
                    wandb_sample_interval: 100
                }
            }
        );

        console.log("Training is started ", trainingResponse)

        const actualTrainModelId = trainingResponse.id; // Get the actual training ID from the Replicate response

        // Step 3: Update the training model in the database with the correct trainModelId
        savedTraining.trainModelId = actualTrainModelId;
        savedTraining.version = trainingResponse.version
        savedTraining.status = trainingResponse.status
        await savedTraining.save();
        console.log("Training Updated")

        // Deduct training cost from user credits after successful training initiation
        user.credits -= totalCost;
        await user.save(); //
        console.log("Training amount is deducted")

        // Call the endpoint to start the cron job
        try {
            const cronResponse = await axios.post(`${process.env.APP_URL}/cron/start-cron-job`);
            console.log('Cron job started successfully', cronResponse.data);
        } catch (error) {
            console.error('Failed to start cron job:', error.response ? error.response.data : error.message);
        }
        console.log("Cron Job HIT")
        // Handle success response
        res.json({ message: 'Model training initiated', data: trainingResponse });
    } catch (error) {
        // Handle error response
        res.status(500).json({ message: 'Error training the model', error: error.message });
    }
});


// Update training model with generated image URL
router.put('/:trainModelId', async (req, res) => {
  const { imageUrl } = req.body;

  try {
    const trainingModel = await Training.findOne({ trainModelId: req.params.trainModelId });

    if (!trainingModel) {
      return res.status(404).json({ message: 'Training model not found' });
    }

    // Add image URL to images_list
    trainingModel.images_list.push(imageUrl);
    await trainingModel.save();

    return res.status(200).json({ message: 'Training model updated', trainingModel });
  } catch (error) {
    console.error('Error updating training model:', error);
    return res.status(500).json({ message: 'Error updating training model' });
  }
});

module.exports = router;


module.exports = router;
