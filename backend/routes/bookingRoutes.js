/**
 * Booking Routes
 */
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.post('/', bookingController.createBooking);
router.get('/', bookingController.getBookings);
router.get('/:bookingId', bookingController.getBookingById);
router.put('/:bookingId/cancel', bookingController.cancelBooking);
router.delete('/:bookingId', bookingController.deleteBooking);

module.exports = router;
