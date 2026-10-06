const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function read(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

const database = read('MYSQL_DATABASE', 'bookanartist');
if (!/^[A-Za-z0-9_]+$/.test(database)) {
  throw new Error('MYSQL_DATABASE may contain only letters, numbers, and underscores');
}

const mongoDb = read('MONGO_DB', 'bookanartist');
if (!/^[A-Za-z0-9_-]+$/.test(mongoDb)) {
  throw new Error('MONGO_DB may contain only letters, numbers, underscores, and hyphens');
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET is required. Copy .env.example to .env before starting.');
}

module.exports = {
  port: Number(read('PORT', '3000')),
  mysql: {
    host: read('MYSQL_HOST', '127.0.0.1'),
    port: Number(read('MYSQL_PORT', '3306')),
    user: read('MYSQL_USER', 'root'),
    password: process.env.MYSQL_PASSWORD ?? '',
    database,
    connectionLimit: Number(read('MYSQL_POOL_SIZE', '10')),
  },
  mongoUri: read('MONGO_URI', 'mongodb://127.0.0.1:27017'),
  mongoDb,
  jwtSecret,
  jwtExpiresIn: read('JWT_EXPIRES_IN', '8h'),
};
