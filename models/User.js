const mongoose = require('mongoose')
const {Schema} = mongoose;

const UserSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    fullname:{
        type: String
    },  
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: false
    },
    role: {
        type: String,  
        enum: ['Admin', 'Lecturer'],
        default: 'Lecturer',
    },
    phone:{
        type: String,
    },
    googleId: {
    type: String,
    unique: true,
    sparse: true, // Cho phép null nhưng vẫn đảm bảo tính duy nhất
  },
});
module.exports = mongoose.model('User', UserSchema);