// models/Training.js
const mongoose = require('mongoose');

const TrainingSchema = new mongoose.Schema({
  trainModelId: { type: String, required: true, unique: true },
  modelId:{type: String},
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  zipFileLink: { type: String, required: true },
  trigger_word: { type: String, required: true, unique: true },
  version: {type: String, required: true},
  gender: {type: String},
  status: { type: String},
  generatedImageUrl: { type: String },
  images_list: [{ type: String }],
  styleLink: { type: String, required: true },
});

module.exports = mongoose.model('Training', TrainingSchema);
