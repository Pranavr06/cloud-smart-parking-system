require('dotenv').config();
const crypto = require('crypto');
const authService = require('../services/authService');

function secureKeyMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

const DETECTION_API_KEY = process.env.DETECTION_API_KEY;
if (process.env.NODE_ENV === 'production' && (!DETECTION_API_KEY || DETECTION_API_KEY.length < 32)) {
  throw new Error('Production requires a DETECTION_API_KEY of at least 32 characters.');
}

async function requireAuth(req, res, next) {
  try {
    const user = await authService.verifySession(req.cookies && req.cookies.smartpark_session);
    if (!user) return res.status(401).json({ success: false, error: 'Sign in to continue.' });
    req.user = user;
    next();
  } catch {
    res.clearCookie('smartpark_session', { path: '/' });
    return res.status(401).json({ success: false, error: 'Your session has expired. Sign in again.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Sign in to continue.' });
  if (!(req.user.groups || []).includes('parking-admin')) {
    return res.status(403).json({ success: false, error: 'Administrator access is required.' });
  }
  next();
}

function requireDetectionKey(req, res, next) {
  if (process.env.NODE_ENV !== 'production' && !DETECTION_API_KEY) return next();
  if (!secureKeyMatches(req.headers['x-detection-key'], DETECTION_API_KEY)) {
    return res.status(401).json({ success: false, error: 'Valid detection API key required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireDetectionKey };
