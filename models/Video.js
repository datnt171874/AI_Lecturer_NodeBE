const mongoose = require('mongoose');
const { Schema } = mongoose;

const VideoSchema = new Schema({
  lesson_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  name: { type: String},
  video_url: { type: String },
  format: { type: String },
  duration: { type: Number },
  resolution: { type: String },
  status: { type: String, default: 'processing' },
});

module.exports = mongoose.model('Video', VideoSchema);