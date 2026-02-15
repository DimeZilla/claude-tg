#!/usr/bin/env node
'use strict';

var TelegramBot = require('node-telegram-bot-api');
var config = require('./lib/config');
var tmux = require('./lib/tmux');
var formatter = require('./lib/formatter');
var sessions = require('./lib/sessions');

var cfg = config.loadConfig();
var bot = new TelegramBot(cfg.botToken, { polling: true });
var botStartTime = Math.floor(Date.now() / 1000);

bot.on('message', function (msg) {
  // Ignore messages sent before the bot started (stale queue)
  if (msg.date < botStartTime) return;

  var chatId = msg.chat.id;

  if (!cfg.chatId) {
    cfg.chatId = String(chatId);
    config.saveChatId(chatId);
    bot.sendMessage(chatId, '\u2705 Chat ID saved. You will now receive Claude Code notifications here.\n\nSend /help to see available commands.');
    return;
  }

  if (String(chatId) !== String(cfg.chatId)) {
    bot.sendMessage(chatId, '\u26D4 Unauthorized. This bot is configured for a different chat.');
    return;
  }

  var text = msg.text;
  if (!text) return;

  if (text === '/stop') {
    handleStop(chatId);
  } else if (text === '/escape') {
    handleEscape(chatId);
  } else if (text === '/status') {
    handleStatus(chatId);
  } else if (text === '/screen') {
    handleScreen(chatId);
  } else if (text === '/sessions') {
    handleSessions(chatId);
  } else if (text.indexOf('/switch') === 0) {
    handleSwitch(chatId, text);
  } else if (text === '/help') {
    handleHelp(chatId);
  } else {
    handleInput(chatId, text);
  }
});

function getActiveSession() {
  return sessions.getActive();
}

function handleInput(chatId, text) {
  var active = getActiveSession();
  if (!active) {
    bot.sendMessage(chatId, '\u26A0\uFE0F No active sessions. Start one with: <code>claude-tg</code>', { parse_mode: 'HTML' });
    return;
  }

  if (!tmux.sessionExists(active)) {
    sessions.unregister(active);
    bot.sendMessage(chatId, '\u26A0\uFE0F Session <code>' + formatter.escapeHtml(active) + '</code> is no longer running.', { parse_mode: 'HTML' });
    return;
  }

  try {
    tmux.sendKeys(active, text);
    bot.sendMessage(chatId,
      '\uD83D\uDCE4 [' + formatter.escapeHtml(active) + '] Sent:\n<code>' + formatter.escapeHtml(text) + '</code>',
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    bot.sendMessage(chatId, '\u274C Failed to send: ' + err.message);
  }
}

function handleStatus(chatId) {
  var info = sessions.list();
  var names = Object.keys(info.sessions);

  if (names.length === 0) {
    bot.sendMessage(chatId, '\uD83D\uDD34 No active sessions.');
    return;
  }

  var lines = ['\uD83D\uDFE2 <b>' + names.length + ' active session(s):</b>', ''];
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var alive = tmux.sessionExists(name);
    var marker = name === info.active ? ' \u25C0 active' : '';
    var icon = alive ? '\uD83D\uDFE2' : '\uD83D\uDD34';
    lines.push(icon + ' <code>' + formatter.escapeHtml(name) + '</code>' + marker);
  }

  bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'HTML' });
}

function handleSessions(chatId) {
  handleStatus(chatId);
}

function handleSwitch(chatId, text) {
  var parts = text.split(/\s+/);
  var target = parts[1];

  if (!target) {
    bot.sendMessage(chatId, 'Usage: <code>/switch claude-0214-1352</code>', { parse_mode: 'HTML' });
    return;
  }

  var info = sessions.list();
  if (!info.sessions[target]) {
    bot.sendMessage(chatId,
      '\u26A0\uFE0F Session <code>' + formatter.escapeHtml(target) + '</code> not found.\n\nAvailable: ' +
      Object.keys(info.sessions).map(function (n) { return '<code>' + formatter.escapeHtml(n) + '</code>'; }).join(', '),
      { parse_mode: 'HTML' }
    );
    return;
  }

  sessions.setActive(target);
  bot.sendMessage(chatId,
    '\u2705 Switched to <code>' + formatter.escapeHtml(target) + '</code>',
    { parse_mode: 'HTML' }
  );
}

function handleScreen(chatId) {
  var active = getActiveSession();
  if (!active) {
    bot.sendMessage(chatId, '\u26A0\uFE0F No active sessions.');
    return;
  }

  if (!tmux.sessionExists(active)) {
    bot.sendMessage(chatId, '\u26A0\uFE0F Session <code>' + formatter.escapeHtml(active) + '</code> is no longer running.', { parse_mode: 'HTML' });
    return;
  }

  try {
    var output = tmux.capturePane(active, 40);
    var trimmed = output.trim();
    if (!trimmed) {
      bot.sendMessage(chatId, '<i>[' + formatter.escapeHtml(active) + '] Screen is empty</i>', { parse_mode: 'HTML' });
      return;
    }
    var truncated = trimmed.length > 3800
      ? '...\n' + trimmed.slice(-3800)
      : trimmed;
    bot.sendMessage(chatId,
      '<b>[' + formatter.escapeHtml(active) + ']</b>\n<pre>' + formatter.escapeHtml(truncated) + '</pre>',
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    bot.sendMessage(chatId, '\u274C Failed to capture screen: ' + err.message);
  }
}

function handleStop(chatId) {
  var active = getActiveSession();
  if (!active) {
    bot.sendMessage(chatId, '\u26A0\uFE0F No active sessions.');
    return;
  }

  if (!tmux.sessionExists(active)) {
    bot.sendMessage(chatId, '\u26A0\uFE0F Session not found.');
    return;
  }

  try {
    tmux.sendInterrupt(active);
    bot.sendMessage(chatId,
      '\u23F9 [' + formatter.escapeHtml(active) + '] Sent Ctrl+C',
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    bot.sendMessage(chatId, '\u274C Failed: ' + err.message);
  }
}

function handleEscape(chatId) {
  var active = getActiveSession();
  if (!active) {
    bot.sendMessage(chatId, '\u26A0\uFE0F No active sessions.');
    return;
  }

  if (!tmux.sessionExists(active)) {
    bot.sendMessage(chatId, '\u26A0\uFE0F Session not found.');
    return;
  }

  try {
    tmux.sendEscape(active);
    bot.sendMessage(chatId,
      '\u23F9 [' + formatter.escapeHtml(active) + '] Sent Escape',
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    bot.sendMessage(chatId, '\u274C Failed: ' + err.message);
  }
}

function handleHelp(chatId) {
  bot.sendMessage(chatId, [
    '<b>claude-tg commands:</b>',
    '',
    '/stop - Send Ctrl+C to interrupt Claude',
    '/escape - Send Escape key',
    '/status - Show all active sessions',
    '/sessions - Same as /status',
    '/switch &lt;name&gt; - Switch active session',
    '/screen - Show recent terminal output',
    '/help - Show this message',
    '',
    'Any other message is sent as input to the active Claude Code session.',
  ].join('\n'), { parse_mode: 'HTML' });
}

function shutdown() {
  console.log('Shutting down...');
  bot.stopPolling();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bot.on('polling_error', function (err) {
  if (err.code === 'ETELEGRAM' && err.response && err.response.statusCode === 409) {
    console.error('ERROR: Another bot instance is running with the same token. Exiting.');
    process.exit(1);
  }
  console.error('Polling error:', err.message);
});

console.log('claude-tg bot is running. Waiting for messages...');
