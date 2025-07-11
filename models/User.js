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
        required: true
    },
    role: {
        type: String,  
        enum: ['Admin', 'Lecturer'],
        default: 'Lecturer',
    },
    phone:{
        type: String,
    }

});
module.exports = mongoose.model('User', UserSchema);