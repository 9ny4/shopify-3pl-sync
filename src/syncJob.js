const { fetchOrders } = require('./shopifyClient');
const { pushOrders } = require('./tplClient');
const { sendAlert } = require('./slack');
const logger = require('./logger');

// Track the last successful sync time to avoid re-processing orders
let lastSyncTime = null;

/**
 * Main sync job — fetches new orders and pushes them to 3PL.
 * Called by the cron scheduler.
 */
async function runSync() {
  const syncStart = new Date();
  const lookbackMs = (parseInt(process.env.ORDERS_LOOKBACK_MINUTES, 10) || 20) * 60 * 1000;
  const since = lastSyncTime || new Date(Date.now() - lookbackMs);

  logger.info('Starting sync job', { since: since.toISOString(), runId: syncStart.getTime() });

  let orders = [];

  try {
    orders = await fetchOrders(since);
    logger.info('Orders fetched', { count: orders.length, since: since.toISOString(), runId: syncStart.getTime() });
  } catch (err) {
    logger.error('Fatal: failed to fetch orders', { error: err.message });
    await sendAlert({
      title: '❌ Order fetch failed',
      message: err.message,
      level: 'error',
      details: { since: since.toISOString(), error: err.message },
    });
    return;
  }

  if (orders.length === 0) {
    logger.info('No new orders to sync');
    lastSyncTime = syncStart;
    return;
  }

  const results = await pushOrders(orders);

  const duration = Date.now() - syncStart.getTime();
  logger.info('Sync complete', {
    total: orders.length,
    succeeded: results.succeeded.length,
    failed: results.failed.length,
    durationMs: duration,
    runId: syncStart.getTime(),
  });

  if (results.failed.length > 0) {
    logger.warn('Some orders failed to sync', { failures: results.failed });
    await sendAlert({
      title: `⚠️ ${results.failed.length} order(s) failed to push`,
      message: `${results.failed.length} of ${orders.length} orders failed to sync to 3PL.`,
      level: 'warning',
      details: {
        failed_count: results.failed.length,
        succeeded_count: results.succeeded.length,
        failed_ids: results.failed.map((f) => f.orderId).join(', '),
        duration_ms: duration,
      },
    });
  }

  // Only advance cursor if at least some succeeded
  if (results.succeeded.length > 0) {
    lastSyncTime = syncStart;
  }
}

module.exports = { runSync };
