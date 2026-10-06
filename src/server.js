const app = require('./app');
const config = require('./config');
const { ensureSchema } = require('./db/schema');
const { closePool } = require('./db/mysql');
const { closeMongo } = require('./db/mongo');
const logger = require('./lib/logger');

const SHUTDOWN_TIMEOUT_MS = 10000;

async function main() {
  await ensureSchema();
  const server = app.listen(config.port, () => {
    logger.info(`API listening on http://localhost:${config.port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${config.port} is already in use`);
    } else {
      logger.error('Server failed to start', err);
    }
    process.exit(1);
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const timer = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
    timer.unref();
    server.close(async () => {
      await closePool();
      await closeMongo();
      clearTimeout(timer);
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error(err.message || 'Startup failed', err);
  process.exit(1);
});
