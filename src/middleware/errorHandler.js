const { AppError } = require('../lib/errors');
const { sendError } = require('../lib/response');
const logger = require('../lib/logger');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err.type === 'entity.too.large') {
    return sendError(res, 413, 'Request body is too large');
  }

  if (err instanceof SyntaxError && err.status === 400) {
    return sendError(res, 400, 'Request body must be valid JSON');
  }

  if (err instanceof AppError) {
    return sendError(res, err.status, err.message);
  }

  logger.error('Unhandled request error', err);
  return sendError(res, 500, 'Internal server error');
}

module.exports = errorHandler;
