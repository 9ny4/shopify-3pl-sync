require('dotenv').config();
const { CronJob } = require('cron');
const { runSync } = require('./syncJob');
const logger = require('./logger');

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 15;

logger.info('shopify-3pl-sync starting', {
  pollIntervalMinutes: POLL_INTERVAL,
  tplUrl: process.env.TPL_API_URL || '(not set)',
  shopUrl: process.env.SHOP_API_URL || 'https://fakestoreapi.com',
});

// Run once immediately on startup
runSync().catch((err) => logger.error('Initial sync failed', { error: err.message }));

// Schedule recurring sync
const cronExpression = `*/${POLL_INTERVAL} * * * *`;
logger.info(`Scheduling cron: ${cronExpression}`);

const job = new CronJob(
  cronExpression,
  () => {
    logger.info('Cron triggered sync');
    runSync().catch((err) => logger.error('Scheduled sync failed', { error: err.message }));
  },
  null,
  true,
  'UTC'
);

job.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, stopping cron job');
  job.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, stopping cron job');
  job.stop();
  process.exit(0);
});
