const mongoose = require('mongoose')
const {Schema} = mongoose;

const UserSchema = new Schema({
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
    },
    phone:{
        type: String,
    }

});
module.exports = mongoose.model('User', UserSchema);