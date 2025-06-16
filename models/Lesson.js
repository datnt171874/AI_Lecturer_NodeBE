const mongoose = require('mongoose');
const { Schema } = mongoose;

const LessonSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    text_content: {
        type: String,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        status: { type: String, enum: ['uploaded', 'processing', 'failed', 'completed'] },
    },
    language: {
        type: String
    }
});
module.exports = mongoose.model('Lesson', LessonSchema);