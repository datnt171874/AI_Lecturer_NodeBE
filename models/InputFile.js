const mongoose = require('mongoose');
const { Schema } = mongoose;

const InputFileSchema = new Schema({
  lesson_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  file_url: { type: String },
  file_format: { type: String },
  status: { type: String, default: 'uploaded'},
});

module.exports = mongoose.model('InputFile', InputFileSchema);