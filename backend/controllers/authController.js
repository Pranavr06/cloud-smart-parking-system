const authService = require('../services/authService');

const COOKIE_NAME = 'smartpark_session';

function sessionCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge
  };
}

function publicError(err, fallback) {
  if (['UsernameExistsException', 'CodeMismatchException', 'ExpiredCodeException', 'InvalidPasswordException', 'InvalidParameterException'].includes(err.code)) {
    return { status: 400, message: err.message };
  }
  if (['NotAuthorizedException', 'UserNotFoundException'].includes(err.code)) {
    return { status: 401, message: 'Email or password is incorrect.' };
  }
  if (err.code === 'LimitExceededException' || err.code === 'TooManyRequestsException') {
    return { status: 429, message: 'Too many attempts. Wait a moment and try again.' };
  }
  if (err.code === 'ChallengeRequired') return { status: 403, message: err.message };
  console.error('[Auth]', err.name || err.code || 'Unexpected authentication error');
  return { status: 503, message: fallback };
}

async function signUp(req, res) {
  try {
    const result = await authService.signUp(req.body.email, req.body.password);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const error = publicError(err, 'Account registration is temporarily unavailable.');
    res.status(error.status).json({ success: false, error: error.message });
  }
}

async function confirmSignUp(req, res) {
  try {
    const result = await authService.confirmSignUp(req.body.email, req.body.code);
    res.json({ success: true, data: result });
  } catch (err) {
    const error = publicError(err, 'We could not confirm this account. Check the email and code, then try again.');
    res.status(error.status).json({ success: false, error: error.message });
  }
}

async function signIn(req, res) {
  try {
    const session = await authService.signIn(req.body.email, req.body.password);
    res.cookie(COOKIE_NAME, session.token, sessionCookieOptions(session.expiresIn * 1000));
    res.json({ success: true, data: session.user });
  } catch (err) {
    const error = publicError(err, 'Sign in is temporarily unavailable.');
    res.status(error.status).json({ success: false, error: error.message });
  }
}

async function currentUser(req, res) {
  res.json({ success: true, data: req.user });
}

async function signOut(req, res) {
  try {
    await authService.signOut(req.cookies && req.cookies[COOKIE_NAME]);
  } catch (err) {
    console.warn('[Auth] Remote sign-out could not be completed:', err.name || 'unknown error');
  }
  res.clearCookie(COOKIE_NAME, sessionCookieOptions(0));
  res.json({ success: true });
}

module.exports = { signUp, confirmSignUp, signIn, currentUser, signOut };
