// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  name: String,
  email: String,
  profilePic: String,
  credits: {
    type: Number,
    default: 0,  // New users start with 0 credits
  },
});

module.exports = mongoose.model('User', UserSchema);
