const { AppError } = require('../lib/errors');
const { parseId, parseDate, toIso } = require('../lib/parse');
const { isKnownStatus, canTransition } = require('../domain/bookingState');
const { ROLES, BOOKING_STATUS, LIMITS } = require('../constants');
const { withTransaction } = require('../db/transaction');
const userRepository = require('../repositories/userRepository');
const bookingRepository = require('../repositories/bookingRepository');
const reviewRepository = require('../repositories/reviewRepository');

function toBooking(row) {
  return {
    id: row.id,
    artist_id: row.artist_id,
    client_id: row.client_id,
    status: row.status,
    event_start: toIso(row.event_start),
    event_end: toIso(row.event_end),
    notes: row.notes,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function readNotes(notes) {
  if (typeof notes !== 'string' || notes.trim() === '') {
    throw new AppError(400, 'notes is required');
  }
  const trimmed = notes.trim();
  if (trimmed.length > LIMITS.NOTES_MAX_LENGTH) {
    throw new AppError(400, `notes must be ${LIMITS.NOTES_MAX_LENGTH} characters or fewer`);
  }
  return trimmed;
}

async function createBooking(clientId, body) {
  const artistId = parseId(body.artist_id, 'artist_id');
  const eventStart = parseDate(body.event_start, 'event_start');
  const eventEnd = parseDate(body.event_end, 'event_end');
  const notes = readNotes(body.notes);

  if (eventEnd.getTime() <= eventStart.getTime()) {
    throw new AppError(400, 'event_end must be after event_start');
  }
  if (eventStart.getTime() < Date.now()) {
    throw new AppError(422, 'event_start must not be in the past');
  }

  return withTransaction(async (connection) => {
    const artist = await userRepository.lockArtist(connection, artistId);
    if (!artist) {
      throw new AppError(404, 'Artist not found');
    }

    const overlap = await bookingRepository.findConfirmedOverlap(
      connection,
      artistId,
      eventStart,
      eventEnd
    );
    if (overlap) {
      throw new AppError(409, 'Artist already has a confirmed booking in this time window');
    }

    const row = await bookingRepository.insert(connection, {
      artistId,
      clientId,
      eventStart,
      eventEnd,
      notes,
    });
    return toBooking(row);
  });
}

function assertCanApplyStatus(user, booking, nextStatus) {
  if (user.role === ROLES.ARTIST) {
    if (booking.artist_id !== user.id) {
      throw new AppError(403, 'Artists can only update bookings assigned to them');
    }
    return;
  }

  if (user.role === ROLES.CLIENT) {
    if (booking.client_id !== user.id) {
      throw new AppError(403, 'Clients can only cancel their own bookings');
    }
    if (nextStatus !== BOOKING_STATUS.CANCELLED) {
      throw new AppError(403, 'Clients can only cancel bookings');
    }
    return;
  }

  throw new AppError(403, 'You cannot update this booking');
}

async function updateBookingStatus(user, bookingId, nextStatus) {
  const id = parseId(bookingId, 'id');
  if (typeof nextStatus !== 'string' || nextStatus.trim() === '') {
    throw new AppError(400, 'status is required');
  }
  if (!isKnownStatus(nextStatus)) {
    throw new AppError(400, 'status must be pending, confirmed, in_progress, completed, or cancelled');
  }

  const booking = await withTransaction(async (connection) => {
    const row = await bookingRepository.findById(connection, id, { forUpdate: true });
    if (!row) {
      throw new AppError(404, 'Booking not found');
    }

    assertCanApplyStatus(user, row, nextStatus);
    if (!canTransition(row.status, nextStatus)) {
      throw new AppError(422, `Invalid status transition from '${row.status}' to '${nextStatus}'`);
    }

    const updated = await bookingRepository.updateStatus(connection, id, nextStatus);
    return toBooking(updated);
  });

  // Reviews live in MongoDB. Keep the copied status aligned so review reads
  // do not have to load every completed booking id from MySQL.
  await reviewRepository.setBookingStatus(booking.id, booking.status);
  return booking;
}

module.exports = { createBooking, updateBookingStatus };
