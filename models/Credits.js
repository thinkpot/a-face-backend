const mongoose = require('mongoose');

const CreditsSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    credits: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Credits', CreditsSchema);
