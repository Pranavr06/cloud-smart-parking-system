/**
 * Cloud-Based Smart Parking Management System - Backend Server
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const db = require('./config/dynamodb');
const parkingRoutes = require('./routes/parkingRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const detectionRoutes = require('./routes/detectionRoutes');
const authRoutes = require('./routes/authRoutes');
const authService = require('./services/authService');

const app = express();
const PORT = process.env.PORT || 5000;
const startTime = new Date();

// Same-origin frontend/API; no cross-origin access is needed.
app.disable('x-powered-by');
// The public task security group accepts traffic only from the ALB.
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const frontendPath = path.join(__dirname, '..', 'frontend');
// The console is a protected document route. Static middleware alone would
// publish the dashboard shell before the API had a chance to reject a driver.
app.get('/admin.html', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const user = await authService.verifySession(req.cookies && req.cookies.smartpark_session);
    if (!user) return res.redirect(302, '/admin-login.html');
    if (!(user.groups || []).includes('parking-admin')) {
      return res.redirect(302, '/admin-login.html?denied=1');
    }
    return res.sendFile(path.join(frontendPath, 'admin.html'));
  } catch {
    res.clearCookie('smartpark_session', { path: '/' });
    return res.redirect(302, '/admin-login.html');
  }
});

// Serve public frontend files after the protected console route.
app.use(express.static(frontendPath));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const database = await db.checkHealth();
  const healthy = database.status === 'HEALTHY';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'HEALTHY' : 'DEGRADED',
    service: 'Cloud Smart Parking API',
    version: '1.0.0',
    uptimeSeconds: Math.floor((new Date() - startTime) / 1000),
    databaseMode: db.getMode(),
    databaseStatus: database.status,
    ...(database.reason ? { databaseReason: database.reason } : {}),
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/parking', parkingRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/detection', detectionRoutes);

// Catch-all for API 404
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Send the site root directly to sign-in so first-time visitors do not land
// on the public marketing/dashboard shell before seeing authentication.
app.get('/', (req, res) => {
  res.redirect(302, '/login.html');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start server if not imported by test suite
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log('==================================================');
    console.log(`🚀 Smart Parking System Backend running on port ${PORT}`);
    console.log(`📡 Database Mode: [${db.getMode().toUpperCase()}]`);
    console.log(`🌐 Web UI: http://localhost:${PORT}`);
    console.log(`🩺 Health API: http://localhost:${PORT}/api/health`);
    console.log('==================================================');
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => console.log('HTTP server closed'));
  });
}

module.exports = app;
