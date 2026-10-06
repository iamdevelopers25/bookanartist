function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data, error: null });
}

function sendError(res, status, message) {
  return res.status(status).json({ success: false, data: null, error: message });
}

module.exports = { sendSuccess, sendError };
