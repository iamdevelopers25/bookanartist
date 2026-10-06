const { BOOKING_STATUS } = require('../constants');

const STATUSES = Object.values(BOOKING_STATUS);

const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
};

function isKnownStatus(status) {
  return STATUSES.includes(status);
}

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

module.exports = { STATUSES, TRANSITIONS, isKnownStatus, canTransition };
