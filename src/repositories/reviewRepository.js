const { getDb } = require('../db/mongo');
const { BOOKING_STATUS, LIMITS } = require('../constants');

async function collection() {
  const db = await getDb();
  return db.collection('reviews');
}

function completedMatch(extra) {
  return { bookingStatus: BOOKING_STATUS.COMPLETED, ...extra };
}

async function summarizeCompleted(artistId) {
  const reviews = await collection();
  const [summary] = await reviews.aggregate([
    { $match: completedMatch({ artistId }) },
    {
      $group: {
        _id: null,
        average: { $avg: '$score' },
        total: { $sum: 1 },
        s1: { $sum: { $cond: [{ $eq: ['$score', 1] }, 1, 0] } },
        s2: { $sum: { $cond: [{ $eq: ['$score', 2] }, 1, 0] } },
        s3: { $sum: { $cond: [{ $eq: ['$score', 3] }, 1, 0] } },
        s4: { $sum: { $cond: [{ $eq: ['$score', 4] }, 1, 0] } },
        s5: { $sum: { $cond: [{ $eq: ['$score', 5] }, 1, 0] } },
      },
    },
  ]).toArray();
  return summary || null;
}

async function pageCompleted(artistId, page, limit) {
  const reviews = await collection();
  return reviews
    .find(completedMatch({ artistId }))
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();
}

async function aggregateLeaderboard(since) {
  const reviews = await collection();
  return reviews.aggregate([
    {
      $match: completedMatch({
        createdAt: { $gte: since },
      }),
    },
    {
      $group: {
        _id: '$artistId',
        averageScore: { $avg: '$score' },
        totalReviewCount: { $sum: 1 },
      },
    },
    { $match: { totalReviewCount: { $gte: LIMITS.LEADERBOARD_MIN_REVIEWS } } },
  ]).toArray();
}

async function setBookingStatus(bookingId, bookingStatus) {
  const reviews = await collection();
  await reviews.updateMany({ bookingId }, { $set: { bookingStatus } });
}

module.exports = {
  summarizeCompleted,
  pageCompleted,
  aggregateLeaderboard,
  setBookingStatus,
};
