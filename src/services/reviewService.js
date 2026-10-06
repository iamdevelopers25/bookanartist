const { AppError } = require('../lib/errors');
const { parseId, roundTo2 } = require('../lib/parse');
const { LIMITS } = require('../constants');
const userRepository = require('../repositories/userRepository');
const reviewRepository = require('../repositories/reviewRepository');

const EMPTY_DISTRIBUTION = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

function parsePage(value) {
  if (value === undefined) return LIMITS.PAGE_DEFAULT;
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > LIMITS.PAGE_MAX) {
    throw new AppError(400, `page must be an integer from 1 to ${LIMITS.PAGE_MAX}`);
  }
  return page;
}

function parseLimit(value) {
  if (value === undefined) return LIMITS.LIMIT_DEFAULT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > LIMITS.LIMIT_MAX) {
    throw new AppError(400, `limit must be an integer between 1 and ${LIMITS.LIMIT_MAX}`);
  }
  return limit;
}

function toReview(doc) {
  return {
    id: String(doc._id),
    artist_id: doc.artistId,
    booking_id: doc.bookingId,
    score: doc.score,
    comment: doc.comment,
    created_at: new Date(doc.createdAt).toISOString(),
  };
}

function emptyResult(page, limit) {
  return {
    summary: {
      average_score: null,
      total_count: 0,
      distribution: { ...EMPTY_DISTRIBUTION },
    },
    reviews: [],
    pagination: { page, limit, total_count: 0, total_pages: 0 },
  };
}

async function listArtistReviews(artistIdValue, query) {
  const artistId = parseId(artistIdValue, 'id');
  const page = parsePage(query.page);
  const limit = parseLimit(query.limit);

  const artist = await userRepository.findArtist(artistId);
  if (!artist) {
    throw new AppError(404, 'Artist not found');
  }

  const summary = await reviewRepository.summarizeCompleted(artistId);
  if (!summary) return emptyResult(page, limit);

  const reviews = await reviewRepository.pageCompleted(artistId, page, limit);
  const total = summary.total;
  return {
    summary: {
      average_score: roundTo2(summary.average),
      total_count: total,
      distribution: {
        1: summary.s1,
        2: summary.s2,
        3: summary.s3,
        4: summary.s4,
        5: summary.s5,
      },
    },
    reviews: reviews.map(toReview),
    pagination: {
      page,
      limit,
      total_count: total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

module.exports = { listArtistReviews };
