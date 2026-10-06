const express = require('express');
const authRoutes = require('./routes/authRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const artistRoutes = require('./routes/artistRoutes');
const errorHandler = require('./middleware/errorHandler');
const { sendError } = require('./lib/response');

const app = express();

app.use(express.json({ limit: '100kb' }));
app.use(authRoutes);
app.use(bookingRoutes);
app.use(artistRoutes);

app.use((req, res) => {
  sendError(res, 404, 'Route not found');
});

app.use(errorHandler);

module.exports = app;
