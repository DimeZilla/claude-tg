#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./lib/config');
const telegram = require('./lib/telegram');
const formatter = require('./lib/formatter');
const sessions = require('./lib/sessions');
const tmux = require('./lib/tmux');
const transcript = require('./lib/transcript');
const { logEvent, logError } = require('./lib/logger');

const NOTIFY_LOG_PATH = path.join(__dirname, '..', '.notify-log.json');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    setTimeout(() => {
      resolve(data);
    }, 5000);
  });
}

async function main() {
  const input = await readStdin();

  let hookData;
  try {
    hookData = JSON.parse(input);
  } catch (_e) {
    logError(null, 'failed to parse stdin JSON');
    process.exit(0);
  }

  let cfg;
  try {
    cfg = config.loadConfig();
  } catch (_e) {
    logError(null, 'failed to load config');
    process.exit(0);
  }

  if (!cfg.chatId) {
    process.exit(0);
  }

  const { hook_event_name: eventName, notification_type: notificationType } =
    hookData;
  const sessionName = findSessionForCwd(hookData.cwd);

  if (eventName !== 'Notification') {
    process.exit(0);
  }
  if (notificationType === 'idle_prompt' && !cfg.notifyOn.idle) {
    logEvent(sessionName, 'idle notification filtered (disabled)');
    process.exit(0);
  }
  if (notificationType === 'permission_prompt' && !cfg.notifyOn.permission) {
    logEvent(sessionName, 'permission notification filtered (disabled)');
    process.exit(0);
  }

  if (notificationType === 'idle_prompt' && !cooldownExpired(cfg, 'lastIdle')) {
    logEvent(sessionName, 'idle notification filtered (cooldown)');
    process.exit(0);
  }

  if (notificationType === 'idle_prompt' && isUserTyping(hookData.cwd)) {
    logEvent(sessionName, 'idle notification filtered (user typing)');
    process.exit(0);
  }

  if (
    notificationType === 'permission_prompt' &&
    !cooldownExpired(cfg, 'lastPermission')
  ) {
    logEvent(sessionName, 'permission notification filtered (cooldown)');
    process.exit(0);
  }

  if (sessionName) {
    sessions.setActive(sessionName);
  }

  let screenContent = '';
  let isTranscriptContent = false;

  if (notificationType === 'permission_prompt' || notificationType === 'elicitation_dialog') {
    if (sessionName) {
      try {
        screenContent = tmux.capturePane(sessionName, 50).trim();
      } catch (_e) {
        // ignore capture failures
      }
    }
  } else {
    if (hookData.transcript_path) {
      try {
        const lastMsg = transcript.getLastAssistantMessage(
          hookData.transcript_path
        );
        if (lastMsg) {
          screenContent = lastMsg;
          isTranscriptContent = true;
        }
      } catch (_e) {
        // ignore
      }
    }

    if (!screenContent && sessionName) {
      try {
        screenContent = tmux.capturePane(sessionName, 50).trim();
      } catch (_e) {
        // ignore capture failures
      }
    }
  }

  const showHint = shouldShowHint();

  const message = formatter.formatNotification(
    hookData,
    sessionName,
    screenContent,
    showHint,
    isTranscriptContent
  );
  try {
    await telegram.sendMessageWithRetry(cfg.botToken, cfg.chatId, message);
    logEvent(sessionName, `${notificationType} notification sent`);
  } catch (err) {
    logError(sessionName, `telegram send failed: ${err.message}`);
    process.exit(0);
  }

  const log = loadLog();
  if (notificationType === 'idle_prompt') {
    log.lastIdle = Date.now();
  } else if (notificationType === 'permission_prompt') {
    log.lastPermission = Date.now();
  }
  saveLog(log);
}

function cooldownExpired(cfg, key) {
  const cooldownMs = (cfg.idleCooldown || 180) * 1000;
  const now = Date.now();
  const log = loadLog();
  const last = log[key] || 0;
  return now - last >= cooldownMs;
}

function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(NOTIFY_LOG_PATH, 'utf8'));
  } catch (_e) {
    return { timestamps: [], lastIdle: 0, lastPermission: 0 };
  }
}

function saveLog(log) {
  try {
    fs.writeFileSync(NOTIFY_LOG_PATH, JSON.stringify(log));
  } catch (_e) {
    // ignore
  }
}

function shouldShowHint() {
  const now = Date.now();
  const window = 60000;
  const threshold = 3;

  const log = loadLog();
  if (!Array.isArray(log.timestamps)) log.timestamps = [];

  log.timestamps.push(now);
  log.timestamps = log.timestamps.filter((ts) => now - ts < window);
  saveLog(log);

  return log.timestamps.length >= threshold;
}

function isUserTyping(cwd) {
  try {
    const sessionName = findSessionForCwd(cwd);
    if (!sessionName) return false;
    const lastLine = tmux.capturePane(sessionName, 1).trim();
    // Check if there's text after the ❯ prompt (user is drafting input)
    const match = lastLine.match(/❯\s?(.+)/);
    return match !== null && match[1].trim().length > 0;
  } catch (_e) {
    return false;
  }
}

function findSessionForCwd(cwd) {
  if (!cwd) return null;
  const state = sessions.list();
  const names = Object.keys(state.sessions);
  for (const name of names) {
    if (state.sessions[name].cwd === cwd) {
      return name;
    }
  }
  return state.active;
}

main().catch((err) => {
  logError(null, `uncaught error: ${err.message}`);
  process.exit(0);
});
