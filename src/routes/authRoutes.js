const express = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { sendSuccess } = require('../lib/response');
const { login } = require('../services/authService');

const router = express.Router();

router.post('/auth/login', asyncHandler(async (req, res) => {
  const result = await login(req.body?.email, req.body?.password);
  sendSuccess(res, result);
}));

module.exports = router;
