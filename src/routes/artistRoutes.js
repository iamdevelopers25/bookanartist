const express = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { sendSuccess } = require('../lib/response');
const { listArtistReviews } = require('../services/reviewService');
const { getLeaderboard } = require('../services/leaderboardService');

const router = express.Router();

router.get('/artists/leaderboard', asyncHandler(async (req, res) => {
  const data = await getLeaderboard();
  sendSuccess(res, data);
}));

router.get('/artists/:id/reviews', asyncHandler(async (req, res) => {
  const data = await listArtistReviews(req.params.id, req.query);
  sendSuccess(res, data);
}));

module.exports = router;
