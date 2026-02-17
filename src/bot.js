#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./lib/config');
const tmux = require('./lib/tmux');
const formatter = require('./lib/formatter');
const sessions = require('./lib/sessions');
const { logEvent, logError } = require('./lib/logger');

const cfg = config.loadConfig();
const bot = new TelegramBot(cfg.botToken, { polling: true });
const botStartTime = Math.floor(Date.now() / 1000);

bot.on('message', (msg) => {
  if (msg.date < botStartTime) return;

  const chatId = msg.chat.id;

  if (!cfg.chatId) {
    cfg.chatId = String(chatId);
    config.saveChatId(chatId);
    bot.sendMessage(
      chatId,
      '\u2705 Chat ID saved. You will now receive ' +
        'Claude Code notifications here.\n\n' +
        'Send /help to see available commands.'
    );
    return;
  }

  if (String(chatId) !== String(cfg.chatId)) {
    bot.sendMessage(
      chatId,
      '\u26D4 Unauthorized. This bot is configured ' + 'for a different chat.'
    );
    return;
  }

  if (msg.photo && msg.photo.length > 0) {
    handlePhoto(chatId, msg);
    return;
  }

  const text = msg.text;
  if (!text) return;

  const active = getActiveSession();
  if (text.startsWith('/')) {
    const cmd = text.split(/\s+/)[0];
    logEvent(active, `command: ${cmd}`);
  }

  if (text === '/stop') {
    handleStop(chatId);
  } else if (text === '/allow') {
    handleAllow(chatId);
  } else if (text === '/deny') {
    handleDeny(chatId);
  } else if (text === '/escape') {
    handleEscape(chatId);
  } else if (text === '/status') {
    handleStatus(chatId);
  } else if (text === '/screen') {
    handleScreen(chatId);
  } else if (text === '/plan') {
    handlePlan(chatId);
  } else if (text === '/sessions') {
    handleSessions(chatId);
  } else if (text.startsWith('/switch')) {
    handleSwitch(chatId, text);
  } else if (text.startsWith('/rename')) {
    handleRename(chatId, text);
  } else if (text === '/help') {
    handleHelp(chatId);
  } else if (/^\/\d+$/.test(text)) {
    handleSelectOption(chatId, parseInt(text.slice(1), 10));
  } else {
    handleInput(chatId, text);
  }
});

function getActiveSession() {
  return sessions.getActive();
}

function handleInput(chatId, text) {
  const active = getActiveSession();
  if (!active) {
    bot.sendMessage(
      chatId,
      '\u26A0\uFE0F No active sessions. Start one with: ' +
        '<code>claude-tg</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (!tmux.sessionExists(active)) {
    sessions.unregister(active);
    bot.sendMessage(
      chatId,
      `\u26A0\uFE0F Session <code>${formatter.escapeHtml(active)}</code> is no longer running.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  try {
    tmux.sendKeys(active, text);
    logEvent(active, 'input sent to tmux');
    bot.sendMessage(
      chatId,
      `\uD83D\uDCE4 [${formatter.escapeHtml(active)}] Sent:\n<code>${formatter.escapeHtml(text)}</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logError(active, `sendKeys failed: ${err.message}`);
    bot.sendMessage(chatId, `\u274C Failed to send: ${err.message}`);
  }
}

function handlePhoto(chatId, msg) {
  const active = getActiveSession();
  if (!active) {
    bot.sendMessage(
      chatId,
      '\u26A0\uFE0F No active sessions. Start one with: ' +
        '<code>claude-tg</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (!tmux.sessionExists(active)) {
    sessions.unregister(active);
    bot.sendMessage(
      chatId,
      `\u26A0\uFE0F Session <code>${formatter.escapeHtml(active)}</code> is no longer running.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const photo = msg.photo[msg.photo.length - 1];
  const caption = msg.caption || '';

  const uploadsDir = path.join(
    process.env.HOME,
    '.claude',
    'claude-tg',
    'uploads'
  );
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  bot
    .getFile(photo.file_id)
    .then((fileInfo) => {
      const ext = path.extname(fileInfo.file_path || '') || '.jpg';
      const filename = `telegram-${Date.now()}${ext}`;
      const savePath = path.join(uploadsDir, filename);

      return bot
        .downloadFile(photo.file_id, uploadsDir)
        .then((downloadedPath) => {
          if (downloadedPath !== savePath) {
            fs.renameSync(downloadedPath, savePath);
          }

          const input = caption
            ? `${caption} (see image: ${savePath})`
            : `Please look at this image: ${savePath}`;

          tmux.sendKeys(active, input);
          bot.sendMessage(
            chatId,
            `\uD83D\uDCF7 [${formatter.escapeHtml(active)}] Saved photo to <code>${formatter.escapeHtml(filename)}</code> and sent to Claude.`,
            { parse_mode: 'HTML' }
          );
        });
    })
    .catch((err) => {
      logError(active, `photo download failed: ${err.message}`);
      bot.sendMessage(
        chatId,
        `\u274C Failed to download photo: ${err.message}`
      );
    });
}

function handleStatus(chatId) {
  const info = sessions.list();
  const names = Object.keys(info.sessions);

  if (names.length === 0) {
    bot.sendMessage(chatId, '\uD83D\uDD34 No active sessions.');
    return;
  }

  const lines = [`\uD83D\uDFE2 <b>${names.length} active session(s):</b>`, ''];
  for (const name of names) {
    const alive = tmux.sessionExists(name);
    const icon = alive ? '\uD83D\uDFE2' : '\uD83D\uDD34';
    if (name === info.active) {
      lines.push(`${icon} <code>${formatter.escapeHtml(name)}</code> \u25C0 active`);
    } else {
      lines.push(`${icon} <code>/switch ${formatter.escapeHtml(name)}</code>`);
    }
  }

  bot.sendMessage(chatId, lines.join('\n'), {
    parse_mode: 'HTML',
  });
}

function handleSessions(chatId) {
  handleStatus(chatId);
}

function handleSwitch(chatId, text) {
  const parts = text.split(/\s+/);
  const target = parts[1];

  if (!target) {
    bot.sendMessage(chatId, 'Usage: <code>/switch claude-0214-1352</code>', {
      parse_mode: 'HTML',
    });
    return;
  }

  const info = sessions.list();
  if (!info.sessions[target]) {
    const available = Object.keys(info.sessions)
      .map((n) => `<code>${formatter.escapeHtml(n)}</code>`)
      .join(', ');
    bot.sendMessage(
      chatId,
      `\u26A0\uFE0F Session <code>${formatter.escapeHtml(target)}</code> not found.\n\nAvailable: ${available}`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  sessions.setActive(target);
  bot.sendMessage(
    chatId,
    `\u2705 Switched to <code>${formatter.escapeHtml(target)}</code>`,
    { parse_mode: 'HTML' }
  );
}

function handleScreen(chatId) {
  const active = getActiveSession();
  if (!active) {
    bot.sendMessage(chatId, '\u26A0\uFE0F No active sessions.');
    return;
  }

  if (!tmux.sessionExists(active)) {
    bot.sendMessage(
      chatId,
      `\u26A0\uFE0F Session <code>${formatter.escapeHtml(active)}</code> is no longer running.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  try {
    const output = tmux.capturePane(active, 40);
    const trimmed = output.trim();
    if (!trimmed) {
      bot.sendMessage(
        chatId,
        `<i>[${formatter.escapeHtml(active)}] Screen is empty</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }
    const truncated =
      trimmed.length > 3800 ? `...\n${trimmed.slice(-3800)}` : trimmed;
    bot.sendMessage(
      chatId,
      `<b>[${formatter.escapeHtml(active)}]</b>\n<pre>${formatter.escapeHtml(truncated)}</pre>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logError(active, `screen capture failed: ${err.message}`);
    bot.sendMessage(chatId, `\u274C Failed to capture screen: ${err.message}`);
  }
}

function handlePlan(chatId) {
  const active = getActiveSession();
  if (!active) {
    bot.sendMessage(chatId, '\u26A0\uFE0F No active sessions.');
    return;
  }

  if (!tmux.sessionExists(active)) {
    bot.sendMessage(chatId, '\u26A0\uFE0F Session not found.');
    return;
  }

  try {
    const output = tmux.capturePane(active, 50);
    const match = output.match(/~\/\.claude\/plans\/[^\s]+\.md/);
    if (!match) {
      bot.sendMessage(
        chatId,
        '\u26A0\uFE0F No plan file found in terminal. Is there a plan approval prompt visible?'
      );
      return;
    }

    const planPath = match[0].replace(/^~/, process.env.HOME);
    const content = fs.readFileSync(planPath, 'utf8').trim();
    if (!content) {
      bot.sendMessage(chatId, '<i>Plan file is empty.</i>', {
        parse_mode: 'HTML',
      });
      return;
    }

    logEvent(active, `viewed plan: ${match[0]}`);
    sendLongMessage(
      chatId,
      `\uD83D\uDCCB [${formatter.escapeHtml(active)}] Plan`,
      content
    );
  } catch (err) {
    logError(active, `plan read failed: ${err.message}`);
    bot.sendMessage(chatId, `\u274C Failed to read plan: ${err.message}`);
  }
}

function sendLongMessage(chatId, title, content) {
  const escaped = formatter.escapeHtml(content);
  const maxChunk = 3800;

  // Try single message first
  const single = `<b>${title}</b>\n<pre>${escaped}</pre>`;
  if (single.length <= 4096) {
    bot.sendMessage(chatId, single, { parse_mode: 'HTML' });
    return;
  }

  // Split on line boundaries
  const lines = escaped.split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if (current.length + line.length + 1 > maxChunk && current.length > 0) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current) chunks.push(current);

  // Send first chunk with title
  bot.sendMessage(
    chatId,
    `<b>${title}</b>\n<pre>${chunks[0]}</pre>`,
    { parse_mode: 'HTML' }
  );

  // Send remaining chunks
  for (let i = 1; i < chunks.length; i++) {
    bot.sendMessage(chatId, `<pre>${chunks[i]}</pre>`, {
      parse_mode: 'HTML',
    });
  }
}

function handleRename(chatId, text) {
  const parts = text.split(/\s+/);
  const newName = parts[1];

  if (!newName) {
    bot.sendMessage(chatId, 'Usage: <code>/rename my-project</code>', {
      parse_mode: 'HTML',
    });
    return;
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(newName)) {
    bot.sendMessage(
      chatId,
      '\u26A0\uFE0F Invalid name. Use only letters, ' + 'numbers, and hyphens.'
    );
    return;
  }

  const active = getActiveSession();
  if (!active) {
    bot.sendMessage(chatId, '\u26A0\uFE0F No active sessions.');
    return;
  }

  const info = sessions.list();
  if (info.sessions[newName]) {
    bot.sendMessage(
      chatId,
      `\u26A0\uFE0F Name <code>${formatter.escapeHtml(newName)}</code> is already in use.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  try {
    tmux.renameSession(active, newName);
    sessions.rename(active, newName);
    bot.sendMessage(
      chatId,
      `\u2705 Renamed <code>${formatter.escapeHtml(active)}</code> \u2192 <code>${formatter.escapeHtml(newName)}</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logError(active, `rename failed: ${err.message}`);
    bot.sendMessage(chatId, `\u274C Failed to rename: ${err.message}`);
  }
}

function handleStop(chatId) {
  const active = getActiveSession();
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
    bot.sendMessage(
      chatId,
      `\u23F9 [${formatter.escapeHtml(active)}] Sent Ctrl+C`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    bot.sendMessage(chatId, `\u274C Failed: ${err.message}`);
  }
}

function handleAllow(chatId) {
  const active = getActiveSession();
  if (!active) {
    bot.sendMessage(chatId, '\u26A0\uFE0F No active sessions.');
    return;
  }

  if (!tmux.sessionExists(active)) {
    bot.sendMessage(chatId, '\u26A0\uFE0F Session not found.');
    return;
  }

  try {
    tmux.sendEnter(active);
    bot.sendMessage(
      chatId,
      `\u2705 [${formatter.escapeHtml(active)}] Approved permission`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    bot.sendMessage(chatId, `\u274C Failed: ${err.message}`);
  }
}

function handleDeny(chatId) {
  const active = getActiveSession();
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
    bot.sendMessage(
      chatId,
      `\u274C [${formatter.escapeHtml(active)}] Denied permission`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    bot.sendMessage(chatId, `\u274C Failed: ${err.message}`);
  }
}

function handleSelectOption(chatId, optionNum) {
  const active = getActiveSession();
  if (!active) {
    bot.sendMessage(chatId, '\u26A0\uFE0F No active sessions.');
    return;
  }

  if (!tmux.sessionExists(active)) {
    bot.sendMessage(chatId, '\u26A0\uFE0F Session not found.');
    return;
  }

  try {
    // Navigate to top (10 Ups is enough for any menu), then down to target
    tmux.sendArrowUp(active, 10);
    if (optionNum > 1) {
      tmux.sendArrowDown(active, optionNum - 1);
    }
    tmux.sendEnter(active);
    logEvent(active, `selected option ${optionNum}`);
    bot.sendMessage(
      chatId,
      `\u2705 [${formatter.escapeHtml(active)}] Selected option ${optionNum}`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logError(active, `select option failed: ${err.message}`);
    bot.sendMessage(chatId, `\u274C Failed: ${err.message}`);
  }
}

function handleEscape(chatId) {
  const active = getActiveSession();
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
    bot.sendMessage(
      chatId,
      `\u23F9 [${formatter.escapeHtml(active)}] Sent Escape`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    bot.sendMessage(chatId, `\u274C Failed: ${err.message}`);
  }
}

function handleHelp(chatId) {
  bot.sendMessage(
    chatId,
    [
      '<b>claude-tg commands:</b>',
      '',
      '/allow - Approve a permission prompt',
      '/deny - Deny a permission prompt',
      '/1, /2, ... - Select a numbered option',
      '/stop - Send Ctrl+C to interrupt Claude',
      '/escape - Send Escape key',
      '/status - Show all active sessions',
      '/sessions - Same as /status',
      '/switch &lt;name&gt; - Switch active session',
      '/rename &lt;name&gt; - Rename the active session',
      '/screen - Show recent terminal output',
      '/plan - View the current plan',
      '/help - Show this message',
      '',
      'Any other text is sent as input to the ' + 'active Claude session.',
    ].join('\n'),
    { parse_mode: 'HTML' }
  );
}

function shutdown() {
  logEvent(null, 'bot shutting down');
  console.log('Shutting down...');
  bot.stopPolling();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bot.on('polling_error', (err) => {
  if (
    err.code === 'ETELEGRAM' &&
    err.response &&
    err.response.statusCode === 409
  ) {
    logError(null, 'duplicate bot instance detected, exiting');
    console.error(
      'ERROR: Another bot instance is running ' +
        'with the same token. Exiting.'
    );
    process.exit(1);
  }
  logError(null, `polling error: ${err.message}`);
  console.error('Polling error:', err.message);
});

logEvent(null, 'bot started');
console.log('claude-tg bot is running. Waiting for messages...');
