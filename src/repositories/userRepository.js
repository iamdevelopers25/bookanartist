const { getPool } = require('../db/mysql');

const USER_COLUMNS = 'id, email, password_hash, role, name';

async function findByEmail(email) {
  const [rows] = await getPool().query(
    `SELECT ${USER_COLUMNS} FROM users WHERE email = ? LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findArtist(id) {
  const [rows] = await getPool().query(
    "SELECT id, name FROM users WHERE id = ? AND role = 'artist' LIMIT 1",
    [id]
  );
  return rows[0] || null;
}

async function lockArtist(connection, id) {
  const [rows] = await connection.query(
    "SELECT id FROM users WHERE id = ? AND role = 'artist' LIMIT 1 FOR UPDATE",
    [id]
  );
  return rows[0] || null;
}

async function findNamesByIds(ids) {
  if (ids.length === 0) return [];
  const [rows] = await getPool().query(
    `SELECT id, name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  return rows;
}

module.exports = {
  findByEmail,
  findArtist,
  lockArtist,
  findNamesByIds,
};
