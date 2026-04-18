# shopify-3pl-sync

A Node.js service that polls Shopify (or a compatible order API) for new orders, transforms them into 3PL warehouse format, and pushes them to your fulfillment provider. Includes Slack alerting on failures and a configurable cron scheduler.

## Features

- 🔄 Polls Shopify REST API for new/updated orders on a configurable interval
- 📦 Transforms to standardized 3PL JSON format
- 🔁 Retry logic with exponential backoff on API timeouts
- 🚨 Slack webhook alerts on failed syncs
- 📋 Structured JSON logging via Winston (includes `runId` to correlate syncs)
- ⏰ Cron scheduler (configurable interval)

## Prerequisites

- Node.js >= 18.0.0
- A Shopify store access token (or uses `fakestoreapi.com` in demo mode)
- A 3PL API endpoint
- (Optional) Slack webhook URL for alerts

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your credentials
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SHOP_API_URL` | `https://fakestoreapi.com` | Shopify/order source URL |
| `SHOP_ACCESS_TOKEN` | — | Shopify Admin API access token |
| `TPL_API_URL` | — | 3PL endpoint URL |
| `TPL_API_KEY` | — | 3PL API authentication key |
| `SLACK_WEBHOOK_URL` | — | Slack incoming webhook (optional) |
| `POLL_INTERVAL_MINUTES` | `15` | How often to poll for new orders |
| `ORDERS_LOOKBACK_MINUTES` | `20` | Initial lookback window on first run |

## Usage

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

## Tests

```bash
npm test
```

## Order Flow

```
Shopify API → normalizeOrder() → transformTo3PL() → 3PL Endpoint
                                                    ↓ (on failure)
                                             Slack Alert
```

## Deployment

Designed to run as a long-lived process or Docker container. For Docker:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
CMD ["node", "src/index.js"]
```
