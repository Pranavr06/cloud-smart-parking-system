/**
 * Smart Parking Frontend - Unified API Client
 */

const API_BASE_URL = '/api';

/**
 * Core Fetch Wrapper
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin'
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = (data && data.error) ? data.error : `HTTP error: ${response.status} ${response.statusText}`;
      const error = new Error(errorMsg);
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (err) {
    console.error(`[API Error] ${options.method || 'GET'} ${endpoint}:`, err.message);
    throw err;
  }
}

/**
 * Toast Notification Utility
 */
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
  const mark = document.createElement('span');
  mark.style.fontWeight = 'bold';
  mark.textContent = icon;
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(mark, text);

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Exported API Functions
 */
window.ParkingAPI = {
  showToast,

  // Account sessions use an HTTP-only cookie set by the same-origin API.
  async signUp(email, password) {
    return await request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
  },

  async confirmSignUp(email, code) {
    return await request('/auth/confirm', { method: 'POST', body: JSON.stringify({ email, code }) });
  },

  async signIn(email, password) {
    return await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  },

  async signOut() {
    return await request('/auth/logout', { method: 'POST' });
  },

  async getSession() {
    return await request('/auth/me');
  },

  // Health
  async getHealth() {
    return await request('/health');
  },

  // Parking Slots & Availability
  async getSlots() {
    return await request('/parking/slots');
  },

  async getAvailability() {
    return await request('/parking/availability');
  },

  async getSlot(slotId) {
    return await request(`/parking/slots/${encodeURIComponent(slotId)}`);
  },

  // Bookings
  async createBooking(bookingData) {
    return await request('/bookings', {
      method: 'POST',
      body: JSON.stringify(bookingData)
    });
  },

  async getBookings() {
    return await request('/bookings');
  },

  async getBooking(bookingId) {
    return await request(`/bookings/${encodeURIComponent(bookingId)}`);
  },

  async cancelBooking(bookingId) {
    return await request(`/bookings/${encodeURIComponent(bookingId)}/cancel`, {
      method: 'PUT'
    });
  },

  async deleteBooking(bookingId) {
    return await request(`/bookings/${encodeURIComponent(bookingId)}`, {
      method: 'DELETE'
    });
  },

  // Admin APIs
  async getAdminDashboard() {
    return await request('/admin/dashboard');
  },

  async addSlot(slotData) {
    return await request('/admin/slots', {
      method: 'POST',
      body: JSON.stringify(slotData)
    });
  },

  async removeSlot(slotId) {
    return await request(`/admin/slots/${encodeURIComponent(slotId)}`, {
      method: 'DELETE',
    });
  },

  async updateSlotStatusManual(slotId, status, note = '') {
    return await request(`/admin/slots/${encodeURIComponent(slotId)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, note })
    });
  },

  async getDetectionHistory(limit = 25) {
    return await request(`/detection/history?limit=${limit}`);
  }
};
