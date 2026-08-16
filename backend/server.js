const path = require('path');
require('dotenv').config({path: path.join(__dirname, '.env')});
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./routes/auth');
const streamRoutes = require('./routes/stream');
const deviceRoutes = require('./routes/devices');
const screenStreamRoutes = require('./routes/screenStream');

// Initialize Express app
const app = express();

// Middleware
app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(value => value.trim());
app.use(cors({origin: allowedOrigins, credentials: true}));
// Screen frame relay is mounted before the global rate limiter and JSON cap:
// frames are large and high-frequency, so it applies its own limits/parser.
app.use('/api/devices', screenStreamRoutes);
// Devices poll the heartbeat endpoint every ~3 s (20 req/min per device), so
// the global cap must comfortably exceed one device's polling rate plus
// admin traffic; frame uploads live on their own per-route limiters.
app.use(rateLimit({windowMs: 15 * 60 * 1000, limit: 3000, standardHeaders: true, legacyHeaders: false}));
app.use(express.json({limit: '256kb'}));
app.use(express.urlencoded({extended: true, limit: '256kb'}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/devices', deviceRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    success: true,
    message: 'Parental Control Backend Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'Parental Control API',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login'
      },
      stream: {
        verify: 'GET /api/stream/verify/:uniqueId',
        adminToken: 'GET /api/stream/token/admin/:uniqueId',
        clientToken: 'GET /api/stream/token/client/:uniqueId'
      }
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Route not found' 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ 
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Start server
const PORT = process.env.PORT || 5000;

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 API Base URL: http://localhost:${PORT}`);
    console.log(`💚 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
};

// MongoDB Connection
const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/parental_control_app';

  await mongoose.connect(uri, {serverSelectionTimeoutMS: 5000});
  console.log('✅ MongoDB connected successfully');
};

const shouldSkipDbConnect = process.env.SKIP_DB_CONNECT === 'true';

if (shouldSkipDbConnect) {
  console.log('⚠️ SKIP_DB_CONNECT=true, skipping MongoDB connection and starting server.');
  startServer();
} else {
  connectDB().then(startServer).catch((err) => {
    console.error('❌ Backend startup aborted: MongoDB is unavailable.', err.message);
    process.exit(1);
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  process.exit(1);
});
