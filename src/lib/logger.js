'use strict';

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

function ensureLogsDir() {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (_e) {
    // ignore
  }
}

function append(file, session, message) {
  try {
    ensureLogsDir();
    var timestamp = new Date().toISOString();
    var label = session || '-';
    var line = `${timestamp} [${label}] ${message}\n`;
    fs.appendFileSync(path.join(LOGS_DIR, file), line);
  } catch (_e) {
    // logger must never crash the app
  }
}

function logEvent(session, message) {
  append('events.log', session, message);
}

function logError(session, message) {
  append('errors.log', session, message);
}

module.exports = { logEvent, logError };
