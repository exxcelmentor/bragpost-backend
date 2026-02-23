const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    auth0Id: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    email: {
        type: String,
        required: true,
    },
    tokensAvailable: {
        type: Number,
        default: 0,
    },
    stripeCustomerId: {
        type: String,
    }
}, {
    timestamps: true,
    strict: false, // Allows interaction with existing fields not defined here
    collection: 'users' // Explicitly set the collection name
});

module.exports = mongoose.model('User', userSchema);
