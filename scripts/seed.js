const bcrypt = require('bcrypt');
const { getPool } = require('../src/db/mysql');
const { getDb } = require('../src/db/mongo');

const PASSWORD = 'Password123!';
const DAY_MS = 24 * 60 * 60 * 1000;

const SEED_EMAILS = [
  'client@bookanartist.test',
  'ava@bookanartist.test',
  'noah@bookanartist.test',
  'leo@bookanartist.test',
];

function daysAgo(days) {
  return new Date(Date.now() - days * DAY_MS);
}

function daysAhead(days) {
  return new Date(Date.now() + days * DAY_MS);
}

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

async function removeExistingSeed(connection, db) {
  const [users] = await connection.query(
    `SELECT id FROM users WHERE email IN (${placeholders(SEED_EMAILS)})`,
    SEED_EMAILS
  );
  const userIds = users.map((row) => row.id);
  if (userIds.length === 0) return;

  const [bookings] = await connection.query(
    `SELECT id FROM bookings
     WHERE artist_id IN (${placeholders(userIds)})
        OR client_id IN (${placeholders(userIds)})`,
    [...userIds, ...userIds]
  );
  const bookingIds = bookings.map((row) => row.id);

  if (bookingIds.length > 0) {
    await connection.query(
      `DELETE FROM payments WHERE booking_id IN (${placeholders(bookingIds)})`,
      bookingIds
    );
    await connection.query(
      `DELETE FROM bookings WHERE id IN (${placeholders(bookingIds)})`,
      bookingIds
    );
  }

  await db.collection('reviews').deleteMany({
    $or: [
      { artistId: { $in: userIds } },
      { bookingId: { $in: bookingIds } },
    ],
  });
  await db.collection('artist_profiles').deleteMany({ userId: { $in: userIds } });
  await connection.query(
    `DELETE FROM users WHERE id IN (${placeholders(userIds)})`,
    userIds
  );
}

async function insertUser(connection, user, passwordHash) {
  const [result] = await connection.query(
    'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)',
    [user.email, passwordHash, user.role, user.name]
  );
  return result.insertId;
}

async function insertBooking(connection, booking) {
  const [result] = await connection.query(
    `INSERT INTO bookings (artist_id, client_id, status, event_start, event_end, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      booking.artistId,
      booking.clientId,
      booking.status,
      booking.eventStart,
      booking.eventEnd,
      booking.notes,
    ]
  );
  return result.insertId;
}

async function seed() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const db = await getDb();
  const connection = await getPool().getConnection();
  const reviews = [];
  let committed = false;

  try {
    await connection.beginTransaction();
    await removeExistingSeed(connection, db);

    const clientId = await insertUser(connection, {
      email: 'client@bookanartist.test',
      role: 'client',
      name: 'Maya Chen',
    }, passwordHash);
    const avaId = await insertUser(connection, {
      email: 'ava@bookanartist.test',
      role: 'artist',
      name: 'Ava Lane',
    }, passwordHash);
    const noahId = await insertUser(connection, {
      email: 'noah@bookanartist.test',
      role: 'artist',
      name: 'Noah Patel',
    }, passwordHash);
    const leoId = await insertUser(connection, {
      email: 'leo@bookanartist.test',
      role: 'artist',
      name: 'Leo Kim',
    }, passwordHash);

    const pendingStart = daysAhead(10);
    const pendingEnd = daysAhead(11);
    const pendingId = await insertBooking(connection, {
      artistId: avaId,
      clientId,
      status: 'pending',
      eventStart: pendingStart,
      eventEnd: pendingEnd,
      notes: 'Pending mural request for the status demo',
    });

    const confirmedStart = daysAhead(20);
    const confirmedEnd = daysAhead(21);
    await insertBooking(connection, {
      artistId: avaId,
      clientId,
      status: 'confirmed',
      eventStart: confirmedStart,
      eventEnd: confirmedEnd,
      notes: 'Confirmed booking used to demonstrate overlap rejection',
    });

    reviews.push({
      bookingId: pendingId,
      artistId: avaId,
      clientId,
      score: 2,
      bookingStatus: 'pending',
      comment: 'Left before the booking was completed, so this must stay hidden',
      createdAt: daysAgo(1),
    });

    const avaScores = [5, 5, 5, 4, 5, 4];
    for (let index = 0; index < avaScores.length; index += 1) {
      const bookingId = await insertBooking(connection, {
        artistId: avaId,
        clientId,
        status: 'completed',
        eventStart: daysAgo(40 + index),
        eventEnd: daysAgo(39 + index),
        notes: `Completed Ava booking ${index + 1}`,
      });
      reviews.push({
        bookingId,
        artistId: avaId,
        clientId,
        score: avaScores[index],
        bookingStatus: 'completed',
        comment: index === 0 ? 'Ava review 1 newest' : `Ava review ${index + 1}`,
        createdAt: daysAgo(index + 1),
      });
      if (index === 0) {
        await connection.query(
          `INSERT INTO payments (booking_id, amount, currency, status) VALUES (?, ?, 'USD', 'paid')`,
          [bookingId, '250.00']
        );
      }
    }

    const oldBookingId = await insertBooking(connection, {
      artistId: avaId,
      clientId,
      status: 'completed',
      eventStart: daysAgo(130),
      eventEnd: daysAgo(129),
      notes: 'Older completed booking outside the leaderboard window',
    });
    reviews.push({
      bookingId: oldBookingId,
      artistId: avaId,
      clientId,
      score: 1,
      bookingStatus: 'completed',
      comment: 'Ava old review',
      createdAt: daysAgo(120),
    });

    const noahScores = [5, 5, 4, 4, 4];
    for (let index = 0; index < noahScores.length; index += 1) {
      const bookingId = await insertBooking(connection, {
        artistId: noahId,
        clientId,
        status: 'completed',
        eventStart: daysAgo(50 + index),
        eventEnd: daysAgo(49 + index),
        notes: `Completed Noah booking ${index + 1}`,
      });
      reviews.push({
        bookingId,
        artistId: noahId,
        clientId,
        score: noahScores[index],
        bookingStatus: 'completed',
        comment: `Noah review ${index + 1}`,
        createdAt: daysAgo(index + 2),
      });
    }

    for (let index = 0; index < 4; index += 1) {
      const bookingId = await insertBooking(connection, {
        artistId: leoId,
        clientId,
        status: 'completed',
        eventStart: daysAgo(60 + index),
        eventEnd: daysAgo(59 + index),
        notes: `Completed Leo booking ${index + 1}`,
      });
      reviews.push({
        bookingId,
        artistId: leoId,
        clientId,
        score: 5,
        bookingStatus: 'completed',
        comment: `Leo review ${index + 1}`,
        createdAt: daysAgo(index + 3),
      });
    }

    await connection.commit();
    committed = true;

    await db.collection('artist_profiles').insertMany([
      {
        userId: avaId,
        name: 'Ava Lane',
        category: 'Murals',
        bio: 'Large-scale mural artist',
        hourlyRate: '150.00',
      },
      {
        userId: noahId,
        name: 'Noah Patel',
        category: 'Portrait',
        bio: 'Portrait painter',
        hourlyRate: '120.00',
      },
      {
        userId: leoId,
        name: 'Leo Kim',
        category: 'Illustration',
        bio: 'Editorial illustrator',
        hourlyRate: '90.00',
      },
    ]);
    await db.collection('reviews').insertMany(reviews);

    console.log('Seed complete. Password for every account: Password123!');
    console.log(`  client  client@bookanartist.test  id=${clientId}`);
    console.log(`  artist  ava@bookanartist.test     id=${avaId}  category=Murals`);
    console.log(`  artist  noah@bookanartist.test    id=${noahId}  category=Portrait`);
    console.log(`  artist  leo@bookanartist.test     id=${leoId}  category=Illustration`);
    console.log(`Ava pending booking id: ${pendingId}`);
    console.log(`Ava confirmed window (overlap this to get 409): ${confirmedStart.toISOString()} -> ${confirmedEnd.toISOString()}`);
    console.log('A free future window for a successful booking: 40 days from now, lasting one day.');
  } catch (error) {
    if (!committed) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { seed };
