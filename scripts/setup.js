const { ensureSchema } = require('../src/db/schema');
const { closePool } = require('../src/db/mysql');
const { closeMongo } = require('../src/db/mongo');
const { seed } = require('./seed');

async function main() {
  await ensureSchema();
  await seed();
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
    await closeMongo();
  });
