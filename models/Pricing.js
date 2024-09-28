// models/Pricing.js
const mongoose = require('mongoose');

const PricingSchema = new mongoose.Schema({
  modelTrainingCharge: {
    type: Number,
    required: true,
    default: 300, // Default value for model training
  },
  imageGenerationCharge: {
    type: Number,
    required: true,
    default: 7, // Default value for image generation
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the timestamp automatically when charges are updated
PricingSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

const Pricing = mongoose.model('Pricing', PricingSchema);
module.exports = Pricing;
