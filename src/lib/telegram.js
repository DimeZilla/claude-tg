'use strict';

var https = require('https');

function sendMessage(botToken, chatId, text, options) {
  options = options || {};

  var payload = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: options.parseMode || 'HTML',
    disable_web_page_preview: true,
  });

  return new Promise(function (resolve, reject) {
    var req = https.request(
      {
        hostname: 'api.telegram.org',
        path: '/bot' + botToken + '/sendMessage',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      function (res) {
        var body = '';
        res.on('data', function (chunk) {
          body += chunk;
        });
        res.on('end', function () {
          try {
            var parsed = JSON.parse(body);
            if (parsed.ok) {
              resolve(parsed);
            } else {
              reject(new Error('Telegram API error: ' + (parsed.description || body)));
            }
          } catch (e) {
            reject(new Error('Invalid JSON from Telegram: ' + body));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sendMessageWithRetry(botToken, chatId, text, options, retries) {
  retries = retries === undefined ? 2 : retries;
  options = options || {};

  return sendMessage(botToken, chatId, text, options).catch(function (err) {
    if (retries > 0) {
      var delay = (3 - retries) * 500;
      return new Promise(function (resolve) {
        setTimeout(resolve, delay);
      }).then(function () {
        return sendMessageWithRetry(botToken, chatId, text, options, retries - 1);
      });
    }
    throw err;
  });
}

module.exports = { sendMessage, sendMessageWithRetry };
