const axios = require('axios');
const logger = require('./logger');

const TPL_URL = process.env.TPL_API_URL || 'https://3pl-api.example.com/orders';
const TPL_KEY = process.env.TPL_API_KEY || 'mock-key';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Transform internal order format to 3PL warehouse JSON payload.
 */
function transformTo3PL(order) {
  return {
    reference: order.externalId,
    warehouse_order: {
      order_date: order.createdAt,
      ship_to: {
        name: order.shippingAddress?.name || 'Unknown',
        street1: order.shippingAddress?.address1 || '',
        city: order.shippingAddress?.city || '',
        state: order.shippingAddress?.province || '',
        postal_code: order.shippingAddress?.zip || '',
        country: order.shippingAddress?.country || 'US',
      },
      items: order.lineItems.map((li) => ({
        sku: li.sku,
        qty: li.quantity,
        unit_price: li.unitPrice,
      })),
    },
    metadata: {
      source: 'shopify-3pl-sync',
      customer_id: order.customerId,
      synced_at: new Date().toISOString(),
    },
  };
}

/**
 * Push a single order to the 3PL API with retry logic.
 */
async function pushOrder(order) {
  const payload = transformTo3PL(order);
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(TPL_URL, payload, {
        headers: {
          'Authorization': `Bearer ${TPL_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      logger.info('Order pushed to 3PL', {
        orderId: order.id,
        tplRef: response.data?.reference || 'N/A',
        attempt,
      });

      return { success: true, orderId: order.id, attempt };
    } catch (err) {
      lastError = err;
      const status = err.response?.status;

      // Don't retry on 4xx client errors (except 429)
      if (status && status >= 400 && status < 500 && status !== 429) {
        logger.error('3PL push rejected (non-retryable)', { orderId: order.id, status, error: err.message });
        throw err;
      }

      logger.warn(`3PL push attempt ${attempt}/${MAX_RETRIES} failed`, {
        orderId: order.id,
        error: err.message,
        status,
      });

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        await sleep(delay);
      }
    }
  }

  throw new Error(`Failed to push order ${order.id} after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

/**
 * Push multiple orders to 3PL, collecting results.
 * Returns { succeeded, failed } counts with details.
 */
async function pushOrders(orders) {
  const results = { succeeded: [], failed: [] };

  for (const order of orders) {
    try {
      const result = await pushOrder(order);
      results.succeeded.push(result);
    } catch (err) {
      results.failed.push({ orderId: order.id, error: err.message });
    }
  }

  return results;
}

module.exports = { pushOrder, pushOrders, transformTo3PL };
