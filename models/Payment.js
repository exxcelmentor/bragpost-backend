const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: {
        type: String, // auth0Id for easier lookup
        required: true,
        index: true,
    },
    stripePaymentIntentId: {
        type: String,
        required: true,
        unique: true,
    },
    amount: {
        type: Number, // in cents
        required: true,
    },
    currency: {
        type: String,
        default: 'usd',
    },
    status: {
        type: String,
        enum: ['pending', 'succeeded', 'failed'],
        default: 'pending',
    },
    repliesAdded: {
        type: Number,
        required: true,
    },
    planName: {
        type: String,
    }
}, {
    timestamps: true,
});

module.exports = mongoose.model('Bragpost_payment', paymentSchema);
