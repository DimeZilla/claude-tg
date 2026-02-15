'use strict';

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

function loadConfig() {
  require('dotenv').config({ path: ENV_PATH });

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    throw new Error('BOT_TOKEN is not set. Run "npm run setup" first.');
  }
  if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(botToken)) {
    throw new Error('BOT_TOKEN format is invalid. Should look like: 123456:ABC-DEF...');
  }

  return {
    botToken,
    chatId: process.env.CHAT_ID || null,
    tmuxSession: process.env.TMUX_SESSION || 'claude',
    tmuxTargetPane: process.env.TMUX_TARGET_PANE || null,
    notifyOn: {
      stop: process.env.NOTIFY_ON_STOP !== 'false',
      idle: process.env.NOTIFY_ON_IDLE !== 'false',
      permission: process.env.NOTIFY_ON_PERMISSION !== 'false',
    },
    idleCooldown: parseInt(process.env.IDLE_COOLDOWN, 10) || 180,
  };
}

function saveChatId(chatId) {
  const id = String(chatId);

  if (!fs.existsSync(ENV_PATH)) {
    fs.writeFileSync(ENV_PATH, 'CHAT_ID=' + id + '\n');
    return;
  }

  const contents = fs.readFileSync(ENV_PATH, 'utf8');
  const lines = contents.split('\n');
  let found = false;

  const updated = lines.map(function (line) {
    if (line.startsWith('CHAT_ID=')) {
      found = true;
      return 'CHAT_ID=' + id;
    }
    return line;
  });

  if (!found) {
    updated.push('CHAT_ID=' + id);
  }

  fs.writeFileSync(ENV_PATH, updated.join('\n'));
}

module.exports = { loadConfig, saveChatId, ENV_PATH, PROJECT_ROOT };
