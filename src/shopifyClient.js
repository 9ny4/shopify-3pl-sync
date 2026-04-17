const axios = require('axios');
const logger = require('./logger');

const BASE_URL = process.env.SHOP_API_URL || 'https://fakestoreapi.com';
const ACCESS_TOKEN = process.env.SHOP_ACCESS_TOKEN;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Sleep helper for retry backoff.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch orders from Shopify (or FakeStoreAPI as stand-in).
 * Maps FakeStoreAPI cart structure to a Shopify-compatible order shape.
 *
 * @param {Date} since - Fetch orders updated after this date
 * @returns {Promise<Array>} Normalized order objects
 */
async function fetchOrders(since) {
  const sinceIso = since ? since.toISOString() : null;
  logger.info('Fetching orders from source API', { since: sinceIso, url: BASE_URL });

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // FakeStoreAPI: GET /carts — stands in for Shopify orders endpoint
      const response = await axios.get(`${BASE_URL}/carts`, {
        headers: ACCESS_TOKEN ? { 'X-Shopify-Access-Token': ACCESS_TOKEN } : {},
        params: sinceIso ? { startdate: sinceIso } : {},
        timeout: 10000,
      });

      const rawOrders = Array.isArray(response.data) ? response.data : [response.data];
      logger.info(`Fetched ${rawOrders.length} orders`, { attempt });
      return rawOrders.map(normalizeOrder);
    } catch (err) {
      lastError = err;
      logger.warn(`Order fetch attempt ${attempt}/${MAX_RETRIES} failed`, {
        error: err.message,
        status: err.response?.status,
      });

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        logger.info(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`Failed to fetch orders after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

/**
 * Normalize a FakeStoreAPI cart (or Shopify order) into a standard internal order shape.
 */
function normalizeOrder(raw) {
  // FakeStoreAPI cart format
  if (raw.products !== undefined) {
    return {
      id: String(raw.id),
      externalId: `fakestore-${raw.id}`,
      createdAt: raw.date || new Date().toISOString(),
      updatedAt: raw.date || new Date().toISOString(),
      customerId: String(raw.userId),
      lineItems: (raw.products || []).map((p) => ({
        productId: String(p.productId),
        sku: `SKU-${p.productId}`,
        quantity: p.quantity,
        unitPrice: null, // FakeStoreAPI doesn't include price in carts
      })),
      shippingAddress: {
        name: `Customer ${raw.userId}`,
        address1: '123 Placeholder St',
        city: 'Demo City',
        province: 'CA',
        zip: '90210',
        country: 'US',
      },
      status: 'pending',
    };
  }

  // Native Shopify order format
  return {
    id: String(raw.id),
    externalId: `shopify-${raw.id}`,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    customerId: String(raw.customer?.id || ''),
    lineItems: (raw.line_items || []).map((li) => ({
      productId: String(li.product_id),
      sku: li.sku,
      quantity: li.quantity,
      unitPrice: parseFloat(li.price),
    })),
    shippingAddress: raw.shipping_address
      ? {
          name: raw.shipping_address.name,
          address1: raw.shipping_address.address1,
          city: raw.shipping_address.city,
          province: raw.shipping_address.province,
          zip: raw.shipping_address.zip,
          country: raw.shipping_address.country_code,
        }
      : null,
    status: raw.financial_status || 'pending',
  };
}

module.exports = { fetchOrders, normalizeOrder };
