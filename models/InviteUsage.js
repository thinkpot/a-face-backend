// models/InviteUsage.js

const mongoose = require('mongoose');

const inviteUsageSchema = new mongoose.Schema({
  inviteCode: {
    type: String,
    required: true,
    unique: true, // Ensure invite code is unique
  },
  usageCount: {
    type: Number,
    required: true,
    default: 0, // Initialize usage count at 0
  },
  maxUsage: {
    type: Number,
    required: true,
    default: 100, // Maximum number of uses
  },
  freeCreditsAmount: {
    type: Number,
    required: true,
    default: 377, // Amount of credits to give on redemption
  },
});

const InviteUsage = mongoose.model('InviteUsage', inviteUsageSchema);

module.exports = InviteUsage;
