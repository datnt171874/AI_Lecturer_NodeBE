const mongoose = require('mongoose');
const { Schema } = mongoose;

const SlideSchema = new Schema({
  segment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Segment', required: true },
  image_url: { type: String },
  display_time: { type: Number },
  order_index: { type: Number },
  status: { type: String },
});

module.exports = mongoose.model('Slide', SlideSchema);