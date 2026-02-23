require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');

/**
 * Create a Payment Intent for a specific plan
 */
async function createPaymentIntent(auth0Id, planName) {
    const plans = {
        'bragpost_basic': { amount: 1000, replies: 200 }, // $10 for 200 replies
        'bragpost_pro': { amount: 2000, replies: 500 }   // $20 for 500 replies
    };

    const plan = plans[planName];
    if (!plan) throw new Error('Invalid plan selection');

    console.log(`[STRIPE] Plan: ${planName}, Amount: ${plan.amount}`);

    console.log(`[STRIPE] Looking for user ${auth0Id} in DB`);
    let user = await User.findOne({ auth0Id });

    if (!user) {
        console.log(`[STRIPE] User ${auth0Id} not found in database`);
        throw new Error('User profile not found in database. Please ensure you are logged in correctly.');
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
        console.log(`[STRIPE] Creating new Stripe customer for ${user.email}`);
        const customer = await stripe.customers.create({
            email: user.email,
            metadata: { auth0Id }
        });
        customerId = customer.id;
        user.stripeCustomerId = customerId;
        await user.save();
    }

    const paymentIntent = await stripe.paymentIntents.create({
        amount: plan.amount,
        currency: 'usd',
        customer: customerId,
        metadata: {
            auth0Id,
            planName,
            repliesToGain: plan.replies
        },
        setup_future_usage: 'off_session',
    });

    return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
    };
}

/**
 * Get customer's saved payment methods
 */
async function getCustomerPaymentMethods(auth0Id) {
    const user = await User.findOne({ auth0Id });
    if (!user || !user.stripeCustomerId) return [];

    const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
    });

    return paymentMethods.data.map(pm => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year
    }));
}

module.exports = {
    createPaymentIntent,
    getCustomerPaymentMethods,
    stripe
};
