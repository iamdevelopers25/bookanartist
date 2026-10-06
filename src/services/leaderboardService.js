const { roundTo2 } = require('../lib/parse');
const { LIMITS } = require('../constants');
const bookingRepository = require('../repositories/bookingRepository');
const reviewRepository = require('../repositories/reviewRepository');
const profileRepository = require('../repositories/profileRepository');
const userRepository = require('../repositories/userRepository');

const WINDOW_MS = LIMITS.LEADERBOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000;

async function getLeaderboard() {
  const since = new Date(Date.now() - WINDOW_MS);
  const grouped = await reviewRepository.aggregateLeaderboard(since);
  const artistIds = grouped
    .map((row) => Number(row._id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (artistIds.length === 0) return { artists: [] };

  const [counts, profiles, users] = await Promise.all([
    bookingRepository.countCompletedByArtistIds(artistIds),
    profileRepository.findByUserIds(artistIds),
    userRepository.findNamesByIds(artistIds),
  ]);

  const completedCountByArtist = new Map(
    counts.map((row) => [row.artist_id, Number(row.total_completed_booking_count)])
  );
  const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
  const nameById = new Map(users.map((user) => [user.id, user.name]));

  const artists = grouped
    .map((row) => {
      const artistId = Number(row._id);
      const profile = profileByUser.get(artistId);
      return {
        artist_id: artistId,
        artist_name: profile?.name || nameById.get(artistId) || 'Unknown',
        category: profile?.category || null,
        average_score: roundTo2(row.averageScore),
        total_review_count: row.totalReviewCount,
        total_completed_booking_count: completedCountByArtist.get(artistId) || 0,
      };
    })
    .sort((left, right) => {
      if (right.average_score !== left.average_score) {
        return right.average_score - left.average_score;
      }
      return right.total_completed_booking_count - left.total_completed_booking_count;
    })
    .slice(0, LIMITS.LEADERBOARD_SIZE);

  return { artists };
}

module.exports = { getLeaderboard };
