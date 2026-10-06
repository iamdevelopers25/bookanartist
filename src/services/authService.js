const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('../lib/errors');
const userRepository = require('../repositories/userRepository');

const DUMMY_HASH = bcrypt.hashSync('not-a-real-user', 10);

async function login(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string' || email.trim() === '' || password === '') {
    throw new AppError(400, 'Email and password are required');
  }

  const user = await userRepository.findByEmail(email.trim().toLowerCase());

  // Compare even when the email is unknown so the response time does not reveal which field failed.
  const matches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !matches) {
    throw new AppError(401, 'Invalid email or password');
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  return {
    token,
    user: { id: user.id, role: user.role },
  };
}

module.exports = { login };
