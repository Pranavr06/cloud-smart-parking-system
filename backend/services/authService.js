const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  GlobalSignOutCommand
} = require('@aws-sdk/client-cognito-identity-provider');

const AUTH_MODE = process.env.AUTH_MODE || (process.env.NODE_ENV === 'production' ? 'cognito' : 'local');
const SINGLE_INSTANCE_MODE = process.env.DEPLOYMENT_MODE === 'single-instance';
const REGION = process.env.COGNITO_REGION || process.env.AWS_REGION;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const LOCAL_USERS_FILE = path.join(process.env.LOCAL_DATA_DIR || path.join(__dirname, '..', 'data'), 'local_users.json');
const SESSION_SECRET = process.env.LOCAL_SESSION_SECRET || 'local-only-session-secret-change-before-release';
const cognito = new CognitoIdentityProviderClient({ region: REGION || 'us-east-1' });
const cognitoVerifier = AUTH_MODE === 'cognito' && USER_POOL_ID && CLIENT_ID
  ? CognitoJwtVerifier.create({ userPoolId: USER_POOL_ID, tokenUse: 'access', clientId: CLIENT_ID })
  : null;

if (!['local', 'cognito'].includes(AUTH_MODE)) throw new Error('AUTH_MODE must be local or cognito.');
if (process.env.NODE_ENV === 'production' && AUTH_MODE !== 'cognito' && !(AUTH_MODE === 'local' && SINGLE_INSTANCE_MODE)) {
  throw new Error('Production requires Amazon Cognito or the explicitly configured single-instance authentication mode.');
}
if (AUTH_MODE === 'cognito' && (!REGION || !USER_POOL_ID || !CLIENT_ID)) {
  throw new Error('Cognito auth requires COGNITO_REGION, COGNITO_USER_POOL_ID, and COGNITO_CLIENT_ID.');
}
if (AUTH_MODE === 'local' && process.env.NODE_ENV === 'production') {
  if (!SINGLE_INSTANCE_MODE) throw new Error('Local authentication must not be used in production outside single-instance mode.');
  if (!process.env.LOCAL_SESSION_SECRET || process.env.LOCAL_SESSION_SECRET.length < 32) {
    throw new Error('Single-instance production mode requires LOCAL_SESSION_SECRET with at least 32 characters.');
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateCredentials(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Enter a valid email address.');
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new Error('Password must be between 10 and 128 characters.');
  }
  return normalizedEmail;
}

function readLocalUsers() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_USERS_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeLocalUsers(users) {
  fs.mkdirSync(path.dirname(LOCAL_USERS_FILE), { recursive: true });
  fs.chmodSync(path.dirname(LOCAL_USERS_FILE), 0o700);
  fs.writeFileSync(LOCAL_USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.chmodSync(LOCAL_USERS_FILE, 0o600);
}

function localGroupsFor(email) {
  const admins = String(process.env.LOCAL_ADMIN_EMAILS || '').split(',').map(normalizeEmail);
  return admins.includes(email) ? ['parking-admin'] : [];
}

async function signUp(email, password) {
  const username = validateCredentials(email, password);
  if (AUTH_MODE === 'cognito') {
    const result = await cognito.send(new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: username }]
    }));
    return { needsConfirmation: !result.UserConfirmed, email: username };
  }

  const users = readLocalUsers();
  if (users[username]) {
    const error = new Error('An account with this email already exists.');
    error.code = 'UsernameExistsException';
    throw error;
  }
  users[username] = {
    sub: crypto.randomUUID(),
    email: username,
    passwordHash: await bcrypt.hash(password, 12),
    groups: localGroupsFor(username),
    createdAt: new Date().toISOString()
  };
  writeLocalUsers(users);
  return { needsConfirmation: false, email: username };
}

async function confirmSignUp(email, code) {
  const username = normalizeEmail(email);
  if (AUTH_MODE !== 'cognito') return { confirmed: true, email: username };
  await cognito.send(new ConfirmSignUpCommand({ ClientId: CLIENT_ID, Username: username, ConfirmationCode: String(code || '').trim() }));
  return { confirmed: true, email: username };
}

async function signIn(email, password) {
  const username = validateCredentials(email, password);
  if (AUTH_MODE === 'cognito') {
    const result = await cognito.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { USERNAME: username, PASSWORD: password }
    }));
    if (!result.AuthenticationResult || !result.AuthenticationResult.AccessToken) {
      const error = new Error('Additional sign-in verification is required.');
      error.code = 'ChallengeRequired';
      throw error;
    }
    return {
      token: result.AuthenticationResult.AccessToken,
      expiresIn: result.AuthenticationResult.ExpiresIn || 3600,
      user: { email: username }
    };
  }

  const user = readLocalUsers()[username];
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    const error = new Error('Email or password is incorrect.');
    error.code = 'NotAuthorizedException';
    throw error;
  }
  const groups = localGroupsFor(username);
  const token = jwt.sign({ sub: user.sub, email: user.email, 'cognito:groups': groups }, SESSION_SECRET, { expiresIn: '8h', issuer: 'smartpark-local' });
  return { token, expiresIn: 8 * 60 * 60, user: { sub: user.sub, email: user.email, groups } };
}

async function verifySession(token) {
  if (!token) return null;
  if (AUTH_MODE === 'cognito') {
    const claims = await cognitoVerifier.verify(token);
    return { sub: claims.sub, email: claims.username || '', groups: claims['cognito:groups'] || [] };
  }
  const claims = jwt.verify(token, SESSION_SECRET, { issuer: 'smartpark-local' });
  return { sub: claims.sub, email: claims.email, groups: localGroupsFor(normalizeEmail(claims.email)) };
}

async function signOut(token) {
  if (AUTH_MODE === 'cognito' && token) await cognito.send(new GlobalSignOutCommand({ AccessToken: token }));
}

module.exports = { AUTH_MODE, signUp, confirmSignUp, signIn, verifySession, signOut };
