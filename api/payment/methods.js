const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const connectDB = require('../../lib/mongodb');
const User = require('../../models/User');

/**
 * Vercel Serverless Function: Get Payment Methods
 * Path: /api/payment/methods
 */
module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { auth0Id } = req.query;

        if (!auth0Id) {
            return res.status(400).json({ error: 'auth0Id is required' });
        }

        await connectDB();

        const user = await User.findOne({ auth0Id });
        if (!user || !user.stripeCustomerId) {
            return res.status(200).json([]);
        }

        const paymentMethods = await stripe.paymentMethods.list({
            customer: user.stripeCustomerId,
            type: 'card',
        });

        const formattedMethods = paymentMethods.data.map(pm => ({
            id: pm.id,
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year
        }));

        res.status(200).json(formattedMethods);

    } catch (error) {
        console.error('[ERROR] /api/payment/methods:', error);
        res.status(500).json({ error: error.message });
    }
};
