const express = require('express');
const router = express.Router();
const stripeService = require('../services/stripe');
const Payment = require('../models/Payment');
const User = require('../models/User');

// Create Payment Intent
router.post('/create-intent', async (req, res) => {
    try {
        const { auth0Id, planName } = req.body;
        if (!auth0Id || !planName) {
            return res.status(400).json({ error: 'auth0Id and planName are required' });
        }

        const result = await stripeService.createPaymentIntent(auth0Id, planName);

        // Create a pending payment record
        const plans = {
            'bragpost_basic': { amount: 1000, replies: 200 },
            'bragpost_pro': { amount: 2000, replies: 500 }
        };

        await Payment.create({
            userId: auth0Id,
            stripePaymentIntentId: result.paymentIntentId,
            amount: plans[planName].amount,
            repliesAdded: plans[planName].replies,
            planName: planName,
            status: 'pending'
        });

        res.json(result);
    } catch (error) {
        console.error('Create intent error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get saved payment methods
router.get('/methods/:auth0Id', async (req, res) => {
    try {
        const { auth0Id } = req.params;
        const methods = await stripeService.getCustomerPaymentMethods(auth0Id);
        res.json(methods);
    } catch (error) {
        console.error('Get methods error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripeService.stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { auth0Id, planName, repliesToGain } = paymentIntent.metadata;

        console.log(`Payment succeeded: ${paymentIntent.id} for user ${auth0Id}`);

        try {
            // 1. Update Payment record
            await Payment.findOneAndUpdate(
                { stripePaymentIntentId: paymentIntent.id },
                { status: 'succeeded' }
            );

            // 2. Add replies to user balance
            await User.findOneAndUpdate(
                { auth0Id },
                { $inc: { tokensAvailable: parseInt(repliesToGain) } },
                { upsert: true }
            );

            console.log(`Updated balance for user ${auth0Id}: +${repliesToGain} tokens`);
        } catch (err) {
            console.error('Error updating payment/user on success:', err.message);
            // In production, you might want to retry this or alert
        }
    }

    res.json({ received: true });
});

module.exports = router;
