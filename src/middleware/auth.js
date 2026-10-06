const jwt = require('jsonwebtoken');
const config = require('../config');
const { ROLES } = require('../constants');
const { sendError } = require('../lib/response');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return sendError(res, 401, 'Authentication required');
  }

  try {
    const payload = jwt.verify(match[1], config.jwtSecret);
    const id = Number(payload.id);
    if (!Number.isInteger(id) || (payload.role !== ROLES.ARTIST && payload.role !== ROLES.CLIENT)) {
      return sendError(res, 401, 'Invalid or expired token');
    }
    req.user = { id, role: payload.role, iat: payload.iat };
    return next();
  } catch {
    return sendError(res, 401, 'Invalid or expired token');
  }
}

module.exports = { requireAuth };
