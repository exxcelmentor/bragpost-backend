require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(morgan('dev'));
app.use(cors({
    origin: '*', // Allow all origins for the API
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Database Connection with explicit options
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try {
        // Ensure we are connecting to the 'bragpost' database specifically
        const uri = process.env.MONGODB_URI.includes('?')
            ? process.env.MONGODB_URI.replace('?', 'bragpost?')
            : process.env.MONGODB_URI.includes('.net/')
                ? process.env.MONGODB_URI.replace('.net/', '.net/bragpost')
                : `${process.env.MONGODB_URI}/bragpost`;

        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            bufferCommands: false, // Disable buffering so we fail fast instead of hanging
        });
        isConnected = true;
        console.log('Connected to MongoDB database: bragpost');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        throw err; // Stop execution if DB is missing
    }
};

// Connect immediately
connectDB();

// Middleware to ensure DB connection for every request
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// Body parsing logic
app.use((req, res, next) => {
    if (req.originalUrl === '/api/payment/webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});

// Routes
app.use('/api/payment', paymentRoutes);

app.get('/', (req, res) => {
    res.json({
        message: 'Bragpost',
        version: '1.0.0',
        status: 'running'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Backend server running on port ${PORT}`);
    });
}

module.exports = app;
