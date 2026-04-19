const axios = require('axios');
const axiosRetry = require('axios-retry');
const logger = require('./logger');

const BASE_URL = process.env.SHOP_API_URL || 'https://fakestoreapi.com';
const ACCESS_TOKEN = process.env.SHOP_ACCESS_TOKEN;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Use a dedicated instance so retry interceptors don't bleed into other modules
// that also import axios (e.g. tplClient).
const httpClient = axios.create();

axiosRetry(httpClient, {
  retries: MAX_RETRIES,
  retryDelay: (retryCount) => RETRY_DELAY_MS * retryCount,
  retryCondition: (error) => {
    const status = error.response?.status;
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || status === 429;
  },
  onRetry: (count, error) => {
    logger.warn(`Retrying order fetch (${count}/${MAX_RETRIES})`, { error: error.message });
  },
});

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

  try {
    // FakeStoreAPI: GET /carts — stands in for Shopify orders endpoint
    const response = await httpClient.get(`${BASE_URL}/carts`, {
      headers: ACCESS_TOKEN ? { 'X-Shopify-Access-Token': ACCESS_TOKEN } : {},
      params: sinceIso ? { startdate: sinceIso } : {},
      timeout: 10000,
    });

    const rawOrders = Array.isArray(response.data) ? response.data : [response.data];
    logger.info(`Fetched ${rawOrders.length} orders`);
    return rawOrders.map(normalizeOrder);
  } catch (err) {
    throw new Error(`Failed to fetch orders after ${MAX_RETRIES} attempts: ${err.message}`);
  }
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
