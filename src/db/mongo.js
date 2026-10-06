const { MongoClient } = require('mongodb');
const config = require('../config');

let client;
let database;

async function getDb() {
  if (!database) {
    client = new MongoClient(config.mongoUri);
    await client.connect();
    database = client.db(config.mongoDb);
  }
  return database;
}

async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}

module.exports = { getDb, closeMongo };
