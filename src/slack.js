const axios = require('axios');
const logger = require('./logger');

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

/**
 * Send a Slack alert message.
 * Silently skips if no webhook URL is configured.
 */
async function sendAlert({ title, message, level = 'warning', details = {} }) {
  if (!WEBHOOK_URL) {
    logger.debug('Slack webhook not configured, skipping alert', { title });
    return;
  }

  const colorMap = { error: '#FF0000', warning: '#FFA500', info: '#36A64F' };
  const color = colorMap[level] || colorMap.warning;

  const payload = {
    attachments: [
      {
        color,
        title: `[shopify-3pl-sync] ${title}`,
        text: message,
        fields: Object.entries(details).map(([key, value]) => ({
          title: key,
          value: String(value),
          short: true,
        })),
        footer: 'shopify-3pl-sync',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  try {
    await axios.post(WEBHOOK_URL, payload, { timeout: 5000 });
    logger.debug('Slack alert sent', { title });
  } catch (err) {
    // Don't throw — alerting should never break the main flow
    logger.error('Failed to send Slack alert', { error: err.message, title });
  }
}

module.exports = { sendAlert };
