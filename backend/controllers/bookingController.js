/**
 * Booking Controller
 */
const bookingService = require('../services/bookingService');

async function createBooking(req, res) {
  try {
    const { slotId, vehicleNumber, durationMinutes } = req.body;

    if (!slotId) {
      return res.status(400).json({ success: false, error: 'slotId is required' });
    }

    const booking = await bookingService.createBooking({
      slotId,
      userId: req.user.sub,
      vehicleNumber,
      durationMinutes
    });

    res.status(201).json({
      success: true,
      message: `Slot ${booking.slotId} reserved successfully`,
      data: booking
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

async function getBookings(req, res) {
  try {
    const bookings = await bookingService.getAllBookings(req.user.sub);
    res.set('Cache-Control', 'private, no-store');
    res.json({ success: true, count: bookings.length, data: bookings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getBookingById(req, res) {
  try {
    const { bookingId } = req.params;
    const booking = await bookingService.getBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: `Booking ${bookingId} not found` });
    }
    if (booking.userId !== req.user.sub) {
      return res.status(404).json({ success: false, error: `Booking ${bookingId} not found` });
    }
    res.set('Cache-Control', 'private, no-store');
    res.json({ success: true, data: booking });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function cancelBooking(req, res) {
  try {
    const { bookingId } = req.params;
    const booking = await bookingService.getBookingById(bookingId);
    if (!booking || booking.userId !== req.user.sub) {
      return res.status(404).json({ success: false, error: `Booking ${bookingId} not found` });
    }
    const result = await bookingService.cancelBooking(bookingId);
    res.json({
      success: true,
      message: `Booking ${bookingId} cancelled successfully`,
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

async function deleteBooking(req, res) {
  try {
    const booking = await bookingService.getBookingById(req.params.bookingId);
    if (!booking || booking.userId !== req.user.sub) {
      return res.status(404).json({ success: false, error: 'Reservation not found.' });
    }
    const result = await bookingService.deleteBooking(booking.bookingId);
    res.json({ success: true, message: 'Reservation deleted.', data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

module.exports = {
  createBooking,
  getBookings,
  getBookingById,
  cancelBooking,
  deleteBooking
};
