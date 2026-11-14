const staffForm = document.getElementById('staff-auth-form');
const staffMessage = document.getElementById('staff-auth-message');
const staffSubmit = document.getElementById('staff-auth-submit');

function showStaffMessage(message, success = false) {
  staffMessage.textContent = message;
  staffMessage.classList.toggle('success', success);
}

if (new URLSearchParams(location.search).has('denied')) {
  showStaffMessage('This account is not assigned facility administrator access.');
}

staffForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  staffSubmit.disabled = true;
  showStaffMessage('');
  try {
    await ParkingAPI.signIn(document.getElementById('staff-email').value.trim().toLowerCase(), document.getElementById('staff-password').value);
    const session = await ParkingAPI.getSession();
    if (!(session.data.groups || []).includes('parking-admin')) {
      await ParkingAPI.signOut();
      showStaffMessage('This account is not assigned facility administrator access.');
      return;
    }
    location.assign('/admin.html');
  } catch (error) {
    showStaffMessage(error.message || 'We could not verify this staff account.');
  } finally {
    staffSubmit.disabled = false;
  }
});

ParkingAPI.getSession().then((session) => {
  if ((session.data.groups || []).includes('parking-admin')) location.replace('/admin.html');
}).catch(() => {});
