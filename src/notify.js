#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var config = require('./lib/config');
var telegram = require('./lib/telegram');
var formatter = require('./lib/formatter');
var sessions = require('./lib/sessions');
var tmux = require('./lib/tmux');
var transcript = require('./lib/transcript');

var NOTIFY_LOG_PATH = path.join(__dirname, '..', '.notify-log.json');
// Default 180 seconds (3 minutes), configurable via IDLE_COOLDOWN in .env (in seconds)

function readStdin() {
  return new Promise(function (resolve) {
    var data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) {
      data += chunk;
    });
    process.stdin.on('end', function () {
      resolve(data);
    });
    setTimeout(function () {
      resolve(data);
    }, 5000);
  });
}

async function main() {
  var input = await readStdin();

  var hookData;
  try {
    hookData = JSON.parse(input);
  } catch (e) {
    process.exit(0);
  }

  var cfg;
  try {
    cfg = config.loadConfig();
  } catch (e) {
    process.exit(0);
  }

  if (!cfg.chatId) {
    process.exit(0);
  }

  var eventName = hookData.hook_event_name;
  var notificationType = hookData.notification_type;

  // Only notify on Notification events (idle/permission), not Stop
  if (eventName !== 'Notification') {
    process.exit(0);
  }
  if (notificationType === 'idle_prompt' && !cfg.notifyOn.idle) process.exit(0);
  if (notificationType === 'permission_prompt' && !cfg.notifyOn.permission) process.exit(0);

  // Throttle idle_prompt per IDLE_COOLDOWN setting
  if (notificationType === 'idle_prompt' && !idleCooldownExpired(cfg)) {
    process.exit(0);
  }

  // Figure out which session this notification is from
  var sessionName = findSessionForCwd(hookData.cwd);
  if (sessionName) {
    sessions.setActive(sessionName);
  }

  // Get the last Claude message to show what it's asking/saying.
  // Prefer transcript (structured, reliable) over tmux capture (fragile with UI elements).
  var screenContent = '';

  if (hookData.transcript_path) {
    try {
      var lastMsg = transcript.getLastAssistantMessage(hookData.transcript_path);
      if (lastMsg) {
        screenContent = lastMsg;
      }
    } catch (e) {
      // ignore
    }
  }

  // Fall back to tmux capture if no transcript available
  if (!screenContent && sessionName) {
    try {
      screenContent = tmux.capturePane(sessionName, 50).trim();
    } catch (e) {
      // ignore capture failures
    }
  }

  // Check if we should show a hint (3+ notifications in 60 seconds)
  var showHint = shouldShowHint();

  var isTranscript = !!screenContent && !!(hookData.transcript_path);
  var message = formatter.formatNotification(hookData, sessionName, screenContent, showHint, isTranscript);
  await telegram.sendMessageWithRetry(cfg.botToken, cfg.chatId, message);

  // Record that we sent an idle notification (for cooldown)
  if (notificationType === 'idle_prompt') {
    var log = loadLog();
    log.lastIdle = Date.now();
    saveLog(log);
  }
}

function idleCooldownExpired(cfg) {
  var cooldownMs = (cfg.idleCooldown || 180) * 1000;
  var now = Date.now();
  var log = loadLog();
  var lastIdle = log.lastIdle || 0;
  return (now - lastIdle) >= cooldownMs;
}

function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(NOTIFY_LOG_PATH, 'utf8'));
  } catch (e) {
    return { timestamps: [], lastIdle: 0 };
  }
}

function saveLog(log) {
  try {
    fs.writeFileSync(NOTIFY_LOG_PATH, JSON.stringify(log));
  } catch (e) {
    // ignore
  }
}

function shouldShowHint() {
  var now = Date.now();
  var window = 60000; // 60 seconds
  var threshold = 3;

  var log = loadLog();
  if (!Array.isArray(log.timestamps)) log.timestamps = [];

  log.timestamps.push(now);
  log.timestamps = log.timestamps.filter(function (ts) { return now - ts < window; });
  saveLog(log);

  return log.timestamps.length >= threshold;
}

function findSessionForCwd(cwd) {
  if (!cwd) return null;
  var state = sessions.list();
  var names = Object.keys(state.sessions);
  for (var i = 0; i < names.length; i++) {
    if (state.sessions[names[i]].cwd === cwd) {
      return names[i];
    }
  }
  // If no cwd match, return the active session
  return state.active;
}

main().catch(function () {
  process.exit(0);
});
