const mongoose = require('mongoose');
const { Schema } = mongoose;

const AudioSchema = new Schema({
  segment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Segment', required: true },
  audio_url: { type: String },
  language: { type: String },
  voice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Voice' },
  speed: { type: Number, default: 1.0 },
  duration: { type: Number },
  status: { type: String , default: 'processing'},
});

module.exports = mongoose.model('Audio', AudioSchema);