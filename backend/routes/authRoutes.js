const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts. Wait a little and try again.' }
});

function requireHttpsForCredentials(req, res, next) {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.status(426).json({ success: false, error: 'HTTPS is required to create or use an account.' });
  }
  next();
}

router.post('/signup', requireHttpsForCredentials, authRateLimit, authController.signUp);
router.post('/confirm', requireHttpsForCredentials, authRateLimit, authController.confirmSignUp);
router.post('/login', requireHttpsForCredentials, authRateLimit, authController.signIn);
router.get('/me', requireAuth, authController.currentUser);
router.post('/logout', authController.signOut);

module.exports = router;
