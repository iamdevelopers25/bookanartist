const ROLES = {
  ARTIST: 'artist',
  CLIENT: 'client',
};

const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const LIMITS = {
  NOTES_MAX_LENGTH: 5000,
  PAGE_DEFAULT: 1,
  PAGE_MAX: 1000,
  LIMIT_DEFAULT: 10,
  LIMIT_MAX: 50,
  LEADERBOARD_SIZE: 10,
  LEADERBOARD_MIN_REVIEWS: 5,
  LEADERBOARD_WINDOW_DAYS: 90,
};

module.exports = { ROLES, BOOKING_STATUS, LIMITS };
