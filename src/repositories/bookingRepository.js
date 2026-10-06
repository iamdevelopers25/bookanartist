const { getPool } = require('../db/mysql');
const { BOOKING_STATUS } = require('../constants');

const BOOKING_COLUMNS = `id, artist_id, client_id, status, event_start, event_end, notes, created_at, updated_at`;

async function findConfirmedOverlap(connection, artistId, eventStart, eventEnd) {
  const [rows] = await connection.query(
    `SELECT id
     FROM bookings
     WHERE artist_id = ?
       AND status = ?
       AND event_start < ?
       AND event_end > ?
     LIMIT 1
     FOR UPDATE`,
    [artistId, BOOKING_STATUS.CONFIRMED, eventEnd, eventStart]
  );
  return rows[0] || null;
}

async function insert(connection, booking) {
  const [result] = await connection.query(
    `INSERT INTO bookings (artist_id, client_id, status, event_start, event_end, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      booking.artistId,
      booking.clientId,
      BOOKING_STATUS.PENDING,
      booking.eventStart,
      booking.eventEnd,
      booking.notes,
    ]
  );
  return findById(connection, result.insertId);
}

async function findById(connection, id, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(
    `SELECT ${BOOKING_COLUMNS} FROM bookings WHERE id = ? LIMIT 1${lock}`,
    [id]
  );
  return rows[0] || null;
}

async function updateStatus(connection, id, status) {
  await connection.query('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
  return findById(connection, id);
}

async function countCompletedByArtistIds(artistIds) {
  if (artistIds.length === 0) return [];
  const [rows] = await getPool().query(
    `SELECT artist_id, COUNT(*) AS total_completed_booking_count
     FROM bookings
     WHERE status = ?
       AND artist_id IN (${artistIds.map(() => '?').join(',')})
     GROUP BY artist_id`,
    [BOOKING_STATUS.COMPLETED, ...artistIds]
  );
  return rows;
}

module.exports = {
  findConfirmedOverlap,
  insert,
  findById,
  updateStatus,
  countCompletedByArtistIds,
};
