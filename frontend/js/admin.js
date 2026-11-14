/**
 * Admin Console Controller
 * Manages facility settings and locally rendered occupancy summaries.
 */


async function signOutAdmin() {
  await ParkingAPI.signOut();
  window.location.assign('index.html');
}

async function loadAdminDashboard() {
  try {
    const res = await ParkingAPI.getAdminDashboard();
    if (!res || !res.success) throw new Error('Failed to load admin telemetry');

    const data = res.data;
    const summary = data.summary;

    // Update KPIs
    document.getElementById('admin-total-slots').textContent = summary.totalCapacity;
    document.getElementById('admin-free-slots').textContent = summary.availableSlots;
    document.getElementById('admin-occupied-slots').textContent = summary.occupiedSlots;
    document.getElementById('admin-total-bookings').textContent = data.totalBookings;
    document.getElementById('admin-active-bookings-subtext').textContent = `${data.activeBookings} Active, ${data.cancelledBookings} Cancelled`;

    // Render Charts
    renderOccupancyChart(summary);
    renderSourceChart(summary.detectionSourceStats);

    // Render Tables
    renderSlotsTable(summary.slots);
    renderBookingsTable(data.recentBookings);
    renderHistoryTable(data.recentHistory);
  } catch (err) {
    console.error('Admin loading error:', err);
    if (err.status === 401 || err.status === 403) {
      window.location.replace('/admin-login.html?denied=1');
      return;
    }
    ParkingAPI.showToast(`Admin error: ${err.message}`, 'error');
  }
}

function renderOccupancyChart(summary) {
  const target = document.getElementById('occupancyChart');
  if (!target) return;
  const rows = [
    ['Available', Number(summary.availableSlots) || 0, 'free'],
    ['Occupied', Number(summary.occupiedSlots) || 0, 'occupied'],
    ['Reserved', Number(summary.reservedSlots) || 0, 'reserved'],
    ['Unverified', Number(summary.unknownSlots) || 0, 'unknown']
  ];
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  target.innerHTML = rows.map(([label, value, tone]) => {
    const width = total ? Math.round(value / total * 100) : 0;
    return `<div class="admin-chart-row"><div class="admin-chart-label"><span>${label}</span><strong>${value}</strong></div><div class="admin-chart-track"><span class="${tone}" style="width:${width}%"></span></div></div>`;
  }).join('') + `<p class="admin-chart-footnote">${total} registered ${total === 1 ? 'bay' : 'bays'}</p>`;
}

function renderSourceChart(stats = {}) {
  const target = document.getElementById('sourceChart');
  if (!target) return;
  const rows = [
    ['Simulator', Number(stats.JSON) || 0, 'simulator'],
    ['IoT sensors', Number(stats.IOT) || 0, 'iot'],
    ['Camera detection', Number(stats.CCTV) || 0, 'camera'],
    ['Staff override', Number(stats.ADMIN) || 0, 'staff']
  ];
  const max = Math.max(1, ...rows.map((row) => row[1]));
  target.innerHTML = rows.map(([label, value, tone]) => {
    const width = Math.round(value / max * 100);
    return `<div class="admin-chart-row"><div class="admin-chart-label"><span>${label}</span><strong>${value}</strong></div><div class="admin-chart-track"><span class="${tone}" style="width:${width}%"></span></div></div>`;
  }).join('') + '<p class="admin-chart-footnote">Current bay count by last detection source</p>';
}

function renderSlotsTable(slots = []) {
  const tbody = document.getElementById('admin-slots-table-body');
  if (!tbody) return;

  if (slots.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-dim);">No parking slots found.</td></tr>';
    return;
  }

  let html = '';
  slots.forEach(slot => {
    let badgeClass = 'badge-unknown';
    if (slot.status === 'FREE') badgeClass = 'badge-free';
    else if (slot.status === 'OCCUPIED') badgeClass = 'badge-occupied';
    else if (slot.status === 'RESERVED') badgeClass = 'badge-reserved';

    const confidence = slot.confidence !== undefined ? `${Math.round(slot.confidence * 100)}%` : '100%';
    const updated = slot.lastUpdated ? new Date(slot.lastUpdated).toLocaleTimeString() : '--';

    html += `
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
        <td style="padding: 0.75rem;"><strong style="color: #fff;">${slot.slotId}</strong></td>
        <td style="padding: 0.75rem; color: var(--text-muted);">${slot.parkingArea || 'Zone A'}</td>
        <td style="padding: 0.75rem;"><span class="badge ${badgeClass}">${slot.status}</span></td>
        <td style="padding: 0.75rem;"><span class="badge badge-source">${slot.source || 'SYS'}</span></td>
        <td style="padding: 0.75rem; color: var(--accent-cyan); font-weight: 600;">${confidence}</td>
        <td style="padding: 0.75rem; color: var(--text-dim); font-size: 0.8rem;">${updated}</td>
        <td style="padding: 0.75rem; text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="openOverrideModal('${slot.slotId}', '${slot.status}')" style="margin-right: 0.35rem;">Override</button>
          <button class="btn btn-danger btn-sm" onclick="handleDeleteSlot('${slot.slotId}')">Delete</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function renderBookingsTable(bookings = []) {
  const tbody = document.getElementById('admin-bookings-table-body');
  if (!tbody) return;

  if (bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No bookings recorded.</td></tr>';
    return;
  }

  let html = '';
  bookings.forEach(b => {
    const isActive = b.status === 'ACTIVE';
    html += `
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
        <td style="padding: 0.5rem;"><strong style="color: #fff;">${b.slotId}</strong></td>
        <td style="padding: 0.5rem; color: var(--text-muted);">${b.userId}</td>
        <td style="padding: 0.5rem; color: var(--accent-blue);">${b.vehicleNumber || 'N/A'}</td>
        <td style="padding: 0.5rem;">
          <span class="badge ${isActive ? 'badge-free' : 'badge-unknown'}" style="font-size: 0.65rem;">
            ${b.status}
          </span>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderHistoryTable(events = []) {
  const tbody = document.getElementById('admin-history-table-body');
  if (!tbody) return;

  if (events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No detection events logged.</td></tr>';
    return;
  }

  let html = '';
  events.forEach(e => {
    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '--';
    html += `
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
        <td style="padding: 0.5rem;"><strong style="color: #fff;">${e.slotId}</strong></td>
        <td style="padding: 0.5rem; font-size: 0.75rem;">
          <span style="color: var(--text-dim);">${e.previousStatus || 'N/A'}</span> → <strong style="color: #fff;">${e.newStatus}</strong>
        </td>
        <td style="padding: 0.5rem;"><span class="badge badge-source" style="font-size: 0.65rem;">${e.source}</span></td>
        <td style="padding: 0.5rem; color: var(--text-dim); font-size: 0.75rem;">${time}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// Modal Handlers
function openAddSlotModal() {
  document.getElementById('add-slot-modal').classList.add('active');
}

function closeAddSlotModal() {
  document.getElementById('add-slot-modal').classList.remove('active');
}

function openOverrideModal(slotId, currentStatus) {
  document.getElementById('override-slot-id').value = slotId;
  document.getElementById('override-slot-label').textContent = `Slot ${slotId} (Current: ${currentStatus})`;
  document.getElementById('override-status-select').value = currentStatus;
  document.getElementById('override-modal').classList.add('active');
}

function closeOverrideModal() {
  document.getElementById('override-modal').classList.remove('active');
}

async function handleAddSlotSubmit(e) {
  e.preventDefault();
  const slotId = document.getElementById('new-slot-id').value.trim().toUpperCase();
  const parkingArea = document.getElementById('new-slot-area').value.trim();
  const status = document.getElementById('new-slot-status').value;

  try {
    const res = await ParkingAPI.addSlot({ slotId, parkingArea, status });
    if (res && res.success) {
      ParkingAPI.showToast(`Slot ${slotId} added successfully!`, 'success');
      closeAddSlotModal();
      document.getElementById('add-slot-form').reset();
      loadAdminDashboard();
    }
  } catch (err) {
    ParkingAPI.showToast(`Failed to add slot: ${err.message}`, 'error');
  }
}

async function handleOverrideSubmit(e) {
  e.preventDefault();
  const slotId = document.getElementById('override-slot-id').value;
  const status = document.getElementById('override-status-select').value;
  const note = document.getElementById('override-note').value;

  try {
    const res = await ParkingAPI.updateSlotStatusManual(slotId, status, note);
    if (res && res.success) {
      ParkingAPI.showToast(`Slot ${slotId} overridden to ${status} (Source: ADMIN)`, 'success');
      closeOverrideModal();
      loadAdminDashboard();
    }
  } catch (err) {
    ParkingAPI.showToast(`Override failed: ${err.message}`, 'error');
  }
}

async function handleDeleteSlot(slotId) {
  if (!confirm(`Are you sure you want to delete Slot ${slotId}? This will remove it from the cloud database.`)) {
    return;
  }

  try {
    const res = await ParkingAPI.removeSlot(slotId);
    if (res && res.success) {
      ParkingAPI.showToast(`Slot ${slotId} deleted`, 'info');
      loadAdminDashboard();
    }
  } catch (err) {
    ParkingAPI.showToast(`Failed to delete slot: ${err.message}`, 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const session = await ParkingAPI.getSession();
    if (!(session.data.groups || []).includes('parking-admin')) {
      window.location.replace('/admin-login.html?denied=1');
      return;
    }
    document.getElementById('admin-auth-status').textContent = session.data.email || 'Staff access';
  } catch {
    window.location.replace('/admin-login.html');
    return;
  }
  loadAdminDashboard();

  const addForm = document.getElementById('add-slot-form');
  if (addForm) addForm.addEventListener('submit', handleAddSlotSubmit);

  const overrideForm = document.getElementById('override-form');
  if (overrideForm) overrideForm.addEventListener('submit', handleOverrideSubmit);
});
