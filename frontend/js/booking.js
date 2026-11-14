let availableSlots = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function getRequestedSlot() {
  return new URLSearchParams(window.location.search).get('slotId') || '';
}

function validateVehicleRegistration(input) {
  const value = input.value.trim().toUpperCase();
  const compact = value.replace(/[\s-]/g, '');
  const standard = /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$/.test(compact);
  const bharat = /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(compact);
  input.setCustomValidity(!value || standard || bharat
    ? ''
    : 'Enter a valid Indian registration, such as KA-01-MJ-4050 or 22BH1234AA.');
}

async function loadAvailableSlots() {
  const select = document.getElementById('slot-select');
  if (!select) return;
  try {
    const response = await ParkingAPI.getAvailability();
    availableSlots = (response.data.slots || []).filter(slot => slot.status === 'FREE');
    const button = document.getElementById('submit-booking-btn');
    if (!availableSlots.length) {
      select.innerHTML = '<option value="">No spaces are available right now</option>';
      select.disabled = true;
      button.disabled = true;
      return;
    }
    const requested = getRequestedSlot().toUpperCase();
    select.disabled = false;
    button.disabled = false;
    select.innerHTML = '<option value="">Choose a space</option>' + availableSlots.map(slot => {
      const slotId = escapeHtml(slot.slotId);
      const area = escapeHtml(slot.parkingArea || 'Main parking');
      const selected = slot.slotId === requested ? ' selected' : '';
      return `<option value="${slotId}"${selected}>${slotId} · ${area}</option>`;
    }).join('');
  } catch (error) {
    select.innerHTML = '<option value="">Availability is temporarily unavailable</option>';
    select.disabled = true;
    document.getElementById('submit-booking-btn').disabled = true;
    ParkingAPI.showToast('Could not load available spaces.', 'error');
  }
}

async function loadUserBookings() {
  const container = document.getElementById('user-bookings-container');
  if (!container) return;
  container.innerHTML = '<p class="booking-empty">Loading your reservations…</p>';
  try {
    const response = await ParkingAPI.getBookings();
    const bookings = response.data || [];
    if (!bookings.length) {
      container.innerHTML = '<div class="booking-empty"><strong>No reservations yet.</strong><span>Your confirmed bookings will appear here.</span></div>';
      return;
    }
    container.innerHTML = `<div class="booking-list">${bookings.map(booking => {
      const active = booking.status === 'ACTIVE';
      const status = active ? 'badge-free' : 'badge-unknown';
      const date = booking.bookingTime ? new Date(booking.bookingTime).toLocaleString() : '—';
      return `<article class="booking-entry">
        <div class="booking-entry-top"><strong class="booking-bay">${escapeHtml(booking.slotId)}</strong><span class="badge ${status}">${escapeHtml(booking.status)}</span><span class="booking-reference">${escapeHtml(booking.bookingId)}</span></div>
        <div class="booking-entry-details"><span><small>Vehicle</small>${escapeHtml(booking.vehicleNumber || '—')}</span><span><small>Duration</small>${escapeHtml(booking.durationMinutes || 60)} min</span><span><small>Reserved</small>${escapeHtml(date)}</span></div>
        <div class="booking-entry-action">
          ${active ? `<button class="btn btn-secondary btn-sm" data-cancel-booking="${escapeHtml(booking.bookingId)}" data-slot="${escapeHtml(booking.slotId)}">Cancel reservation</button>` : ''}
          <button class="btn btn-danger btn-sm" data-delete-booking="${escapeHtml(booking.bookingId)}" data-slot="${escapeHtml(booking.slotId)}">Delete reservation</button>
        </div>
      </article>`;
    }).join('')}</div>`;
    container.querySelectorAll('[data-cancel-booking]').forEach(button => button.addEventListener('click', () => cancelUserBooking(button.dataset.cancelBooking, button.dataset.slot)));
    container.querySelectorAll('[data-delete-booking]').forEach(button => button.addEventListener('click', () => deleteUserBooking(button.dataset.deleteBooking, button.dataset.slot)));
  } catch (error) {
    container.innerHTML = '<p class="booking-empty">Your reservations could not be loaded. Please refresh and try again.</p>';
  }
}

async function handleBookingSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = document.getElementById('submit-booking-btn');
  const payload = {
    slotId: document.getElementById('slot-select').value,
    vehicleNumber: document.getElementById('vehicle-input').value.trim().toUpperCase(),
    durationMinutes: Number(document.getElementById('duration-select').value)
  };
  if (!payload.slotId) return ParkingAPI.showToast('Choose an available space first.', 'warning');
  submitButton.disabled = true;
  submitButton.textContent = 'Confirming…';
  try {
    const response = await ParkingAPI.createBooking(payload);
    const booking = response.data;
    document.getElementById('conf-id').textContent = booking.bookingId;
    document.getElementById('conf-slot').textContent = booking.slotId;
    document.getElementById('conf-vehicle').textContent = booking.vehicleNumber;
    document.getElementById('conf-duration').textContent = `${booking.durationMinutes} min`;
    document.getElementById('confirmation-card').hidden = false;
    form.reset();
    ParkingAPI.showToast(`Space ${booking.slotId} is reserved.`, 'success');
    await Promise.all([loadAvailableSlots(), loadUserBookings()]);
  } catch (error) {
    ParkingAPI.showToast(error.message || 'We could not complete the reservation.', 'error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Confirm reservation';
  }
}

async function cancelUserBooking(bookingId, slotId) {
  if (!window.confirm(`Cancel the reservation for space ${slotId}?`)) return;
  try {
    await ParkingAPI.cancelBooking(bookingId);
    document.getElementById('confirmation-card').hidden = true;
    ParkingAPI.showToast(`Reservation for ${slotId} cancelled.`, 'info');
    await Promise.all([loadAvailableSlots(), loadUserBookings()]);
  } catch (error) {
    ParkingAPI.showToast(error.message || 'We could not cancel the reservation.', 'error');
  }
}

async function deleteUserBooking(bookingId, slotId) {
  if (!window.confirm(`Delete the reservation for space ${slotId}? An active reservation will be cancelled and release its space first.`)) return;
  try {
    await ParkingAPI.deleteBooking(bookingId);
    document.getElementById('confirmation-card').hidden = true;
    ParkingAPI.showToast(`Reservation for ${slotId} deleted.`, 'success');
    await Promise.all([loadAvailableSlots(), loadUserBookings()]);
  } catch (error) {
    ParkingAPI.showToast(error.message || 'We could not delete this reservation.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const session = await ParkingAPI.getSession();
    document.getElementById('display-user-email').textContent = session.data.email || 'Signed in';
  } catch {
    const next = encodeURIComponent('booking.html');
    window.location.replace(`login.html?next=${next}`);
    return;
  }
  document.getElementById('booking-form').addEventListener('submit', handleBookingSubmit);
  const vehicleInput = document.getElementById('vehicle-input');
  vehicleInput.addEventListener('input', () => validateVehicleRegistration(vehicleInput));
  validateVehicleRegistration(vehicleInput);
  document.getElementById('sign-out-btn').addEventListener('click', async () => {
    await ParkingAPI.signOut();
    window.location.assign('index.html');
  });
  loadAvailableSlots();
  loadUserBookings();
});
