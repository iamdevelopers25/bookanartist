const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');
const { getPool } = require('./mysql');
const { getDb } = require('./mongo');

function statementsFromSchema() {
  const file = path.join(__dirname, '../../sql/schema.sql');
  const stripped = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return stripped
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureSchema() {
  const connection = await mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    timezone: 'Z',
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.mysql.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }

  const pool = getPool();
  for (const statement of statementsFromSchema()) {
    await pool.query(statement);
  }

  const db = await getDb();
  const profiles = db.collection('artist_profiles');
  const reviews = db.collection('reviews');
  await profiles.createIndex({ userId: 1 }, { unique: true });
  await reviews.createIndex({ bookingId: 1 }, { unique: true });
  await reviews.createIndex({ artistId: 1, bookingStatus: 1, createdAt: -1 });
  await reviews.createIndex({ bookingStatus: 1, createdAt: 1, artistId: 1, score: 1 });
}

module.exports = { ensureSchema };
