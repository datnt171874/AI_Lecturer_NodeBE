const mongoose = require('mongoose');
const { Schema } = mongoose;

const SegmentSchema = new Schema({
  lesson_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  segment_order: { type: Number },
  text: { type: String },
  duration: { type: Number },
  start_time: { type: Number },
});

module.exports = mongoose.model('Segment', SegmentSchema);