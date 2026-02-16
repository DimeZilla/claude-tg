#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');
const BOT_SCRIPT = path.join(__dirname, 'bot.js');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');
const LOG_PATH = path.join(LOGS_DIR, 'bot.log');
const PID_PATH = path.join(PROJECT_ROOT, '.bot.pid');

const ENV_PATH = path.join(PROJECT_ROOT, '.env');
if (!fs.existsSync(ENV_PATH)) {
  console.error(
    `No .env file found. Run "npm run setup" in ${PROJECT_ROOT} first.`
  );
  process.exit(1);
}

require('dotenv').config({ path: ENV_PATH });

const sessions = require('./lib/sessions');
const { logEvent } = require('./lib/logger');

// Parse --name from args, pass the rest through to claude
const allArgs = process.argv.slice(2);
let customName = null;
const claudeArgs = [];

for (let i = 0; i < allArgs.length; i++) {
  if (allArgs[i] === '--name' && i + 1 < allArgs.length) {
    customName = allArgs[i + 1];
    i++;
  } else {
    claudeArgs.push(allArgs[i]);
  }
}

if (customName) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(customName)) {
    console.error(
      `Invalid session name: "${customName}". ` +
        'Use only letters, numbers, and hyphens.'
    );
    process.exit(1);
  }
  const existing = sessions.load();
  if (existing.sessions[customName] && tmuxSessionExists(customName)) {
    console.error(
      `Session "${customName}" already exists. ` +
        'Pick a different name or use /rename from Telegram.'
    );
    process.exit(1);
  }
}

function tmuxSessionExists(name) {
  try {
    childProcess.execFileSync('tmux', ['has-session', '-t', name], {
      stdio: 'ignore',
    });
    return true;
  } catch (_e) {
    return false;
  }
}

function startBot() {
  if (fs.existsSync(PID_PATH)) {
    const existingPid = parseInt(fs.readFileSync(PID_PATH, 'utf8').trim(), 10);
    try {
      process.kill(existingPid, 0);
      return existingPid;
    } catch (_e) {
      fs.unlinkSync(PID_PATH);
    }
  }

  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (_e) {
    // ignore
  }
  const logFd = fs.openSync(LOG_PATH, 'a');
  const child = childProcess.spawn('node', [BOT_SCRIPT], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
  });

  child.unref();
  fs.writeFileSync(PID_PATH, String(child.pid));
  logEvent(null, `bot started (pid ${child.pid})`);
  console.log(`Bot started (pid ${child.pid})`);
  return child.pid;
}

function stopBotIfNoSessions() {
  const state = sessions.prune();
  if (Object.keys(state.sessions).length > 0) return;

  if (!fs.existsSync(PID_PATH)) return;
  const pid = parseInt(fs.readFileSync(PID_PATH, 'utf8').trim(), 10);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (_e) {
    // already dead
  }
  try {
    fs.unlinkSync(PID_PATH);
  } catch (_e) {
    // ignore
  }
  logEvent(null, 'bot stopped (no active sessions)');
  console.log('Bot stopped (no active sessions).');
}

function main() {
  try {
    childProcess.execFileSync('which', ['tmux'], {
      stdio: 'ignore',
    });
  } catch (_e) {
    if (process.platform === 'darwin') {
      console.error(
        'tmux is required but not installed. ' +
          'Install it with: brew install tmux'
      );
    } else {
      console.error(
        'tmux is required but not installed. ' +
          'Install it with: sudo apt install tmux'
      );
    }
    process.exit(1);
  }

  try {
    childProcess.execFileSync('which', ['claude'], {
      stdio: 'ignore',
    });
  } catch (_e) {
    console.error('claude CLI is required but not found in PATH.');
    process.exit(1);
  }

  startBot();

  const sessionName = customName || sessions.nextName();

  let claudeCmd = 'claude';
  if (claudeArgs.length > 0) {
    claudeCmd +=
      ' ' +
      claudeArgs.map((arg) => `'${arg.replace(/'/g, "'\\''")}'`).join(' ');
  }

  sessions.register(sessionName, process.cwd());
  logEvent(sessionName, 'session started');
  console.log(`Starting Claude Code in session: ${sessionName}`);

  try {
    childProcess.execFileSync(
      'tmux',
      ['new-session', '-s', sessionName, claudeCmd],
      { stdio: 'inherit' }
    );
  } catch (_e) {
    // user detached or claude exited
  }

  logEvent(sessionName, 'session stopped');
  sessions.unregister(sessionName);
  stopBotIfNoSessions();
}

main();
