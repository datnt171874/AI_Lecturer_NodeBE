const mongoose = require('mongoose');
const { Schema } = mongoose;

const VoiceSchema = new Schema({
  language: { type: String },
  voice_name: { type: String },
});

module.exports = mongoose.model('Voice', VoiceSchema);