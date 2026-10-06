const { AppError } = require('./errors');

function parseId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, `${field} must be a positive integer`);
  }
  return id;
}

function parseDate(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(400, `${field} must be a valid ISO date`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, `${field} must be a valid ISO date`);
  }
  return date;
}

function toIso(value) {
  return new Date(value).toISOString();
}

function roundTo2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = { parseId, parseDate, toIso, roundTo2 };
