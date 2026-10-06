const express = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { sendSuccess, sendError } = require('../lib/response');
const { requireAuth } = require('../middleware/auth');
const { ROLES } = require('../constants');
const { createBooking, updateBookingStatus } = require('../services/bookingService');

const router = express.Router();

router.post('/bookings', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.CLIENT) {
    return sendError(res, 403, 'Only clients can create bookings');
  }
  const booking = await createBooking(req.user.id, req.body || {});
  return sendSuccess(res, booking, 201);
}));

router.patch('/bookings/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const booking = await updateBookingStatus(req.user, req.params.id, req.body?.status);
  sendSuccess(res, booking);
}));

module.exports = router;
