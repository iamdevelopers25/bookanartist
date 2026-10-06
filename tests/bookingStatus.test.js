require('dotenv').config();

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { ensureSchema } = require('../src/db/schema');
const { getPool, closePool } = require('../src/db/mysql');
const { closeMongo } = require('../src/db/mongo');

describe('PATCH /bookings/:id/status', () => {
  const password = 'Password123!';
  const userIds = [];
  const bookingIds = [];
  let artistToken;
  let invalidBookingId;
  let validBookingId;

  beforeAll(async () => {
    await ensureSchema();
    const passwordHash = await bcrypt.hash(password, 10);
    const pool = getPool();
    const stamp = Date.now();

    const [artist] = await pool.query(
      'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)',
      [`status-artist-${stamp}@example.com`, passwordHash, 'artist', 'Status Artist']
    );
    const [client] = await pool.query(
      'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)',
      [`status-client-${stamp}@example.com`, passwordHash, 'client', 'Status Client']
    );
    userIds.push(artist.insertId, client.insertId);

    const eventStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const eventEnd = new Date(eventStart.getTime() + 2 * 60 * 60 * 1000);
    const [booking] = await pool.query(
      `INSERT INTO bookings (artist_id, client_id, status, event_start, event_end, notes)
       VALUES (?, ?, 'pending', ?, ?, ?)`,
      [artist.insertId, client.insertId, eventStart, eventEnd, 'Integration test booking']
    );
    invalidBookingId = booking.insertId;
    bookingIds.push(booking.insertId);

    const laterStart = new Date(eventEnd.getTime() + 24 * 60 * 60 * 1000);
    const laterEnd = new Date(laterStart.getTime() + 2 * 60 * 60 * 1000);
    const [validBooking] = await pool.query(
      `INSERT INTO bookings (artist_id, client_id, status, event_start, event_end, notes)
       VALUES (?, ?, 'pending', ?, ?, ?)`,
      [artist.insertId, client.insertId, laterStart, laterEnd, 'Legal transition booking']
    );
    validBookingId = validBooking.insertId;
    bookingIds.push(validBooking.insertId);

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({ email: `status-artist-${stamp}@example.com`, password });

    if (loginResponse.status !== 200) {
      throw new Error(`Login failed with HTTP ${loginResponse.status}`);
    }
    artistToken = loginResponse.body.data.token;
  });

  afterAll(async () => {
    const pool = getPool();
    if (bookingIds.length > 0) {
      await pool.query(
        `DELETE FROM bookings WHERE id IN (${bookingIds.map(() => '?').join(', ')})`,
        bookingIds
      );
    }
    if (userIds.length > 0) {
      await pool.query(
        `DELETE FROM users WHERE id IN (${userIds.map(() => '?').join(', ')})`,
        userIds
      );
    }
    await closePool();
    await closeMongo();
  });

  test('returns HTTP 422 and an error message for an invalid transition', async () => {
    const response = await request(app)
      .patch(`/bookings/${invalidBookingId}/status`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ status: 'completed' });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.data).toBeNull();
    expect(response.body.error).toBe("Invalid status transition from 'pending' to 'completed'");
  });

  test('lets the assigned artist confirm a pending booking', async () => {
    const response = await request(app)
      .patch(`/bookings/${validBookingId}/status`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ status: 'confirmed' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.error).toBeNull();
    expect(response.body.data.status).toBe('confirmed');
  });
});
