const path = require('path');
const { Storage } = require('@google-cloud/storage');

// Initialize Google Cloud Storage
const storage = new Storage({
  keyFilename: path.join(__dirname, '../ai-face-generator-435017-76d6fa92854c.json'), // Use your own path here
});
const bucketName = 'ai_face_bucket_1'; // Your Google Cloud bucket name

// Function to list images from a specific directory in the bucket based on gender and tab
const listImages = async (req, res) => {
  try {
    const { gender, tab } = req.params; // Gender and tab are passed in as parameters

    // Determine the directory based on gender and tab
    let directory = '';

    if (gender === 'male') {
      if (tab === 'professional') {
        directory = 'styles/male_styles/professional/';
      } else if (tab === 'dating') {
        directory = 'styles/male_styles/dating/';
      }
    } else if (gender === 'female') {
      if (tab === 'professional') {
        directory = 'styles/female_styles/professional/';
      } else if (tab === 'dating') {
        directory = 'styles/female_styles/dating/';
      }
    } else {
      return res.status(400).json({ error: 'Invalid gender or tab.' });
    }

    // Fetch files from the bucket
    const [files] = await storage.bucket(bucketName).getFiles({
      prefix: directory,
    });

    // Filter out directories and keep only files with an extension
    const imageUrls = files
      .filter(file => path.extname(file.name)) // Keep only files with an extension (e.g., .jpg, .png)
      .map(file => {
        return {
          name: path.basename(file.name),
          url: `https://storage.googleapis.com/${bucketName}/${file.name}` // Construct the full URL for each image
        };
      });

    res.status(200).json(imageUrls);
  } catch (error) {
    console.error('Error fetching images from Google Cloud:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
};

module.exports = {
  listImages,
};
