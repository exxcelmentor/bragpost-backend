const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const connectDB = require('../../lib/mongodb');
const User = require('../../models/User');
const Payment = require('../../models/Payment');
const { buffer } = require('micro');

/**
 * Vercel Serverless Function: Stripe Webhook
 * Path: /api/payment/webhook
 * 
 * IMPORTANT: Disable body parser to get raw body for signature verification
 */
export const config = {
    api: {
        bodyParser: false,
    },
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        const rawBody = await buffer(req);
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
        console.error(`[ERROR] Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { auth0Id, planName, repliesToGain } = paymentIntent.metadata;

        console.log(`[WEBHOOK] Payment succeeded: ${paymentIntent.id} for user ${auth0Id}`);

        try {
            // 1. Ensure DB connection
            await connectDB();

            // 2. Update Payment record
            await Payment.findOneAndUpdate(
                { stripePaymentIntentId: paymentIntent.id },
                { status: 'succeeded' }
            );

            // 3. Add replies to user balance
            // We use upsert because the user might not be in our secondary DB yet 
            // (though they should be if they reached create-intent)
            const updatedUser = await User.findOneAndUpdate(
                { auth0Id },
                {
                    $inc: { tokensAvailable: parseInt(repliesToGain) },
                    $set: { plan: planName === 'bragpost_pro' ? 'pro' : 'free' }
                },
                { upsert: true, new: true }
            );

            console.log(`[SUCCESS] Updated balance for user ${auth0Id}: +${repliesToGain} (Total: ${updatedUser.tokensAvailable})`);

        } catch (dbErr) {
            console.error('[ERROR] Webhook DB Update Error:', dbErr.message);
            return res.status(500).json({ error: 'Database update failed' });
        }
    }

    res.status(200).json({ received: true });
};
