'use strict';

const https = require('https');

function sendMessage(botToken, chatId, text, options = {}) {
  const payload = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: options.parseMode || 'HTML',
    disable_web_page_preview: true,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.ok) {
              resolve(parsed);
            } else {
              reject(
                new Error(`Telegram API error: ${parsed.description || body}`)
              );
            }
          } catch (_e) {
            reject(new Error(`Invalid JSON from Telegram: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sendMessageWithRetry(
  botToken,
  chatId,
  text,
  options = {},
  retries = 2
) {
  return sendMessage(botToken, chatId, text, options).catch((err) => {
    if (retries > 0) {
      const delay = (3 - retries) * 500;
      return new Promise((resolve) => {
        setTimeout(resolve, delay);
      }).then(() =>
        sendMessageWithRetry(botToken, chatId, text, options, retries - 1)
      );
    }
    throw err;
  });
}

module.exports = { sendMessage, sendMessageWithRetry };
