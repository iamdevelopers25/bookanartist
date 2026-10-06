const { getDb } = require('../db/mongo');

async function findByUserIds(userIds) {
  if (userIds.length === 0) return [];
  const db = await getDb();
  return db.collection('artist_profiles').find({ userId: { $in: userIds } }).toArray();
}

module.exports = { findByUserIds };
