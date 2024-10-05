// server.js
const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/userRouters'); // Import userRoutes
const trainRoutes = require('./routes/trainRoutes');
const cors = require('cors'); // Optional, for handling CORS
const User = require('./models/User'); // Import User model
const generateImageRoute = require('./routes/generate-image');
const cronJobRoutes = require('./cronStatus'); // Import the cron job routes
const verifyToken = require('./authMiddleware');
const paymentRoutes = require('./routes/paymentRoutes');
const pricingRoutes = require('./routes/pricingRoutes');
const { listImages } = require('./routes/googleStorageController');


dotenv.config();
const app = express();

// Middleware to parse JSON requests
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:3000', // Update this if your frontend is deployed elsewhere
  methods: 'GET,POST, PUT', // Allow the necessary HTTP methods
  allowedHeaders: 'Content-Type,Authorization', // Allow necessary headers
})); // Optional, for handling CORS
app.options('*', cors());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

// Set up Passport with Google OAuth
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user already exists in our db
      let user = await User.findOne({ googleId: profile.id });
      
      if (user) {
        // User exists, return user
        return done(null, user);
      } else {
        // If not, create a new user in our db
        user = await new User({
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          profilePic: profile._json.picture
        }).save();
        
        return done(null, user);
      }
    } catch (err) {
      return done(err, null);
    }
  }
));

// Initialize Passport middleware
app.use(passport.initialize());

// Auth routes
app.use('/auth', authRoutes);

// User routes
app.use('/user', userRoutes); // Connect userRoutes

const userModelsRoutes = require('./routes/userModelsRoutes');

app.use('/user', userModelsRoutes);

app.post('/train', trainRoutes)

app.use('/generate', generateImageRoute);

app.get('/verify-token', verifyToken, (req, res) => {
  res.status(200).json({ message: 'Token is valid', user: req.user });
});

app.use('/update-training-model', trainRoutes);

app.use('/cron', cronJobRoutes); // Add the cron job routes

// Use payment routes
app.use('/api/payment', paymentRoutes);

app.get('/api/styles/:gender/:tab', listImages);


// Use the pricing routes
app.use('/api', pricingRoutes);



// Basic route
app.get('/', (req, res) => {
    res.send('AI Face Image Generator Backend is running!');
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
