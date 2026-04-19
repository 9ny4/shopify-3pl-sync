const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeOrder } = require('../shopifyClient');
const { transformTo3PL } = require('../tplClient');

function buildRawCart() {
  return {
    id: 11,
    userId: 4,
    date: '2024-01-15T10:00:00.000Z',
    products: [
      { productId: 9, quantity: 1 },
      { productId: 3, quantity: 2 },
    ],
  };
}

function buildShopifyOrder() {
  return {
    id: 5555,
    created_at: '2024-01-15T10:00:00-05:00',
    updated_at: '2024-01-15T10:05:00-05:00',
    financial_status: 'paid',
    customer: { id: 777 },
    line_items: [
      { product_id: 42, sku: 'WIDGET-RED', quantity: 3, price: '29.99' },
    ],
    shipping_address: {
      name: 'Jane Doe',
      address1: '456 Main St',
      city: 'Springfield',
      province: 'IL',
      zip: '62701',
      country_code: 'US',
    },
  };
}

describe('normalizeOrder', () => {
  it('normalizes a FakeStoreAPI cart to internal order format', () => {
    const rawCart = buildRawCart();

    const order = normalizeOrder(rawCart);

    assert.equal(order.id, '5');
    assert.equal(order.externalId, 'fakestore-5');
    assert.equal(order.customerId, '3');
    assert.equal(order.lineItems.length, 2);
    assert.equal(order.lineItems[0].sku, 'SKU-1');
    assert.equal(order.lineItems[0].quantity, 2);
    assert.equal(order.status, 'pending');
  });

  it('normalizes a native Shopify order', () => {
    const shopifyOrder = buildShopifyOrder();

    const order = normalizeOrder(shopifyOrder);

    assert.equal(order.id, '1234567890');
    assert.equal(order.externalId, 'shopify-1234567890');
    assert.equal(order.status, 'paid');
    assert.equal(order.lineItems[0].sku, 'WIDGET-RED');
    assert.equal(order.lineItems[0].unitPrice, 29.99);
    assert.equal(order.shippingAddress.city, 'Springfield');
  });
});

describe('transformTo3PL', () => {
  it('transforms an internal order to 3PL warehouse payload', () => {
    const order = {
      id: '5',
      externalId: 'fakestore-5',
      createdAt: '2024-01-15T10:00:00.000Z',
      customerId: '3',
      lineItems: [
        { sku: 'SKU-1', quantity: 2, unitPrice: 9.99 },
      ],
      shippingAddress: {
        name: 'John Smith',
        address1: '789 Oak Ave',
        city: 'Boston',
        province: 'MA',
        zip: '02101',
        country: 'US',
      },
    };

    const payload = transformTo3PL(order);

    assert.equal(payload.reference, 'fakestore-5');
    assert.equal(payload.warehouse_order.ship_to.name, 'John Smith');
    assert.equal(payload.warehouse_order.items.length, 1);
    assert.equal(payload.warehouse_order.items[0].sku, 'SKU-1');
    assert.equal(payload.warehouse_order.items[0].qty, 2);
    assert.equal(payload.metadata.source, 'shopify-3pl-sync');
  });

  it('runs normalize + transform end-to-end', () => {
    const normalized = normalizeOrder(buildRawCart());
    const payload = transformTo3PL(normalized);

    assert.equal(payload.reference, normalized.externalId);
    assert.equal(payload.warehouse_order.items.length, normalized.lineItems.length);
    assert.equal(payload.warehouse_order.items[0].sku, normalized.lineItems[0].sku);
    assert.equal(payload.warehouse_order.ship_to.name, 'Customer 4');
  });
});
