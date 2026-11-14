const form = document.getElementById('auth-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const codeInput = document.getElementById('code-input');
const message = document.getElementById('auth-message');
const submitButton = document.getElementById('auth-submit');
const passwordGroup = document.getElementById('password-group');
const codeGroup = document.getElementById('code-group');
const title = document.getElementById('auth-title');
const description = document.getElementById('auth-description');
const signinTab = document.getElementById('signin-tab');
const signupTab = document.getElementById('signup-tab');
let mode = 'signin';
let accountRole = 'driver';

function getNextPage() {
  const page = new URLSearchParams(window.location.search).get('next');
  return page === 'booking.html' ? page : 'booking.html';
}

function showMessage(text, success = false) {
  message.textContent = text;
  message.classList.toggle('success', success);
}

function setMode(nextMode) {
  mode = nextMode;
  const confirming = mode === 'confirm';
  const signup = mode === 'signup';
  signinTab.classList.toggle('active', mode === 'signin');
  signupTab.classList.toggle('active', signup);
  signinTab.setAttribute('aria-selected', String(mode === 'signin'));
  signupTab.setAttribute('aria-selected', String(signup));
  document.querySelector('.auth-tabs').classList.toggle('auth-hidden', confirming);
  passwordGroup.classList.toggle('auth-hidden', confirming);
  passwordInput.required = !confirming;
  codeGroup.classList.toggle('auth-hidden', !confirming);
  codeInput.required = confirming;
  title.textContent = confirming ? 'Check your email' : signup ? 'Create your account' : 'Welcome back';
  description.textContent = confirming
    ? `Enter the confirmation code sent to ${emailInput.value}.`
    : signup ? 'Create an account to keep your reservations together.'
      : accountRole === 'staff' ? 'Use an assigned facility staff account to open the operations console.'
        : 'Sign in to manage your parking reservations.';
  if (!confirming && !signup) title.textContent = accountRole === 'staff' ? 'Staff sign in' : 'Welcome back';
  submitButton.textContent = confirming ? 'Confirm email' : signup ? 'Create account' : 'Sign in';
  passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
  document.querySelector('.auth-footnote').textContent = accountRole === 'staff'
    ? 'Staff access is assigned by the facility owner. Choosing this option does not grant administrator access.'
    : 'By continuing, you agree to use your account for your own parking reservations.';
  showMessage('');
}

signinTab.addEventListener('click', () => setMode('signin'));
signupTab.addEventListener('click', () => setMode('signup'));

document.querySelectorAll('input[name="account-role"]').forEach(input => {
  input.addEventListener('change', () => {
    accountRole = input.value;
    signupTab.hidden = accountRole === 'staff';
    if (accountRole === 'staff' && mode !== 'signin') setMode('signin');
    else setMode(mode);
  });
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  submitButton.disabled = true;
  showMessage('');
  try {
    const email = emailInput.value.trim().toLowerCase();
    if (mode === 'signup') {
      const result = await ParkingAPI.signUp(email, passwordInput.value);
      if (result.data.needsConfirmation) {
        setMode('confirm');
        showMessage('We sent a confirmation code to your email.', true);
      } else {
        setMode('signin');
        showMessage('Account created. Sign in to continue.', true);
      }
      return;
    }
    if (mode === 'confirm') {
      await ParkingAPI.confirmSignUp(email, codeInput.value.trim());
      setMode('signin');
      showMessage('Email confirmed. You can sign in now.', true);
      passwordInput.focus();
      return;
    }
    await ParkingAPI.signIn(email, passwordInput.value);
    if (accountRole === 'staff') {
      const session = await ParkingAPI.getSession();
      if (!(session.data.groups || []).includes('parking-admin')) {
        await ParkingAPI.signOut();
        showMessage('This account has not been assigned facility staff access. Ask the facility owner to add your email.');
        return;
      }
      window.location.assign('/admin.html');
      return;
    }
    window.location.assign(getNextPage());
  } catch (error) {
    showMessage(error.message || 'We could not complete that request. Try again.');
  } finally {
    submitButton.disabled = false;
  }
});
