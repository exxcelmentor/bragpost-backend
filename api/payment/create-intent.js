const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const connectDB = require('../../lib/mongodb');
const User = require('../../models/User');
const Payment = require('../../models/Payment');

/**
 * Vercel Serverless Function: Create Payment Intent
 * Path: /api/payment/create-intent
 */
module.exports = async (req, res) => {
    // 1. Set CORS headers for serverless environment
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { auth0Id, planName } = req.body;
        console.log(`[DEBUG] Received create-intent request for ${auth0Id}, plan: ${planName}`);

        if (!auth0Id || !planName) {
            return res.status(400).json({ error: 'auth0Id and planName are required' });
        }

        // 2. Ensure DB connection (reused if hot)
        await connectDB();

        const plans = {
            'bragpost_basic': { amount: 1000, replies: 200 },
            'bragpost_pro': { amount: 2000, replies: 500 }
        };

        const plan = plans[planName];
        if (!plan) {
            return res.status(400).json({ error: 'Invalid plan selection' });
        }

        // 3. Find user in MongoDB
        const user = await User.findOne({ auth0Id });
        if (!user) {
            return res.status(404).json({ error: 'User not found in database. Please log in again.' });
        }

        // 4. Handle Stripe Customer
        let customerId = user.stripeCustomerId;
        if (!customerId) {
            console.log(`[STRIPE] Creating customer for ${user.email}`);
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { auth0Id }
            });
            customerId = customer.id;
            user.stripeCustomerId = customerId;
            await user.save();
        }

        // 5. Create Payment Intent
        console.log(`[STRIPE] Creating intent for ${customerId}`);
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

        // 6. Create Pending Payment Record
        await Payment.create({
            userId: auth0Id,
            stripePaymentIntentId: paymentIntent.id,
            amount: plan.amount,
            repliesAdded: plan.replies,
            planName: planName,
            status: 'pending'
        });

        console.log(`[SUCCESS] Intent created: ${paymentIntent.id}`);
        res.status(200).json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        console.error('[ERROR] /api/payment/create-intent:', error);
        res.status(500).json({ error: error.message });
    }
};
