#!/usr/bin/env node
'use strict';

var childProcess = require('child_process');
var path = require('path');
var fs = require('fs');

var PROJECT_ROOT = path.join(__dirname, '..');
var BOT_SCRIPT = path.join(__dirname, 'bot.js');
var LOG_PATH = path.join(PROJECT_ROOT, 'bot.log');
var PID_PATH = path.join(PROJECT_ROOT, '.bot.pid');

var ENV_PATH = path.join(PROJECT_ROOT, '.env');
if (!fs.existsSync(ENV_PATH)) {
  console.error('No .env file found. Run "npm run setup" in ' + PROJECT_ROOT + ' first.');
  process.exit(1);
}

require('dotenv').config({ path: ENV_PATH });

var sessions = require('./lib/sessions');

// Parse --name from args, pass the rest through to claude
var allArgs = process.argv.slice(2);
var customName = null;
var claudeArgs = [];

for (var i = 0; i < allArgs.length; i++) {
  if (allArgs[i] === '--name' && i + 1 < allArgs.length) {
    customName = allArgs[i + 1];
    i++; // skip the value
  } else {
    claudeArgs.push(allArgs[i]);
  }
}

// Validate custom name if provided
if (customName) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(customName)) {
    console.error('Invalid session name: "' + customName + '". Use only letters, numbers, and hyphens.');
    process.exit(1);
  }
  var existing = sessions.load();
  if (existing.sessions[customName] && tmuxSessionExists(customName)) {
    console.error('Session "' + customName + '" already exists. Pick a different name or use /rename from Telegram.');
    process.exit(1);
  }
}

function tmuxSessionExists(name) {
  try {
    childProcess.execFileSync('tmux', ['has-session', '-t', name], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function startBot() {
  if (fs.existsSync(PID_PATH)) {
    var existingPid = parseInt(fs.readFileSync(PID_PATH, 'utf8').trim(), 10);
    try {
      process.kill(existingPid, 0);
      return existingPid;
    } catch (e) {
      fs.unlinkSync(PID_PATH);
    }
  }

  var logFd = fs.openSync(LOG_PATH, 'a');
  var child = childProcess.spawn('node', [BOT_SCRIPT], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: Object.assign({}, process.env),
  });

  child.unref();
  fs.writeFileSync(PID_PATH, String(child.pid));
  console.log('Bot started (pid ' + child.pid + ')');
  return child.pid;
}

function stopBotIfNoSessions() {
  var state = sessions.prune();
  if (Object.keys(state.sessions).length > 0) return;

  // No sessions left — stop the bot
  if (!fs.existsSync(PID_PATH)) return;
  var pid = parseInt(fs.readFileSync(PID_PATH, 'utf8').trim(), 10);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (e) {
    // already dead
  }
  try {
    fs.unlinkSync(PID_PATH);
  } catch (e) {
    // ignore
  }
  console.log('Bot stopped (no active sessions).');
}

function main() {
  // Check tmux is installed
  try {
    childProcess.execFileSync('which', ['tmux'], { stdio: 'ignore' });
  } catch (e) {
    if (process.platform === 'darwin') {
      console.error('tmux is required but not installed. Install it with: brew install tmux');
    } else {
      console.error('tmux is required but not installed. Install it with: sudo apt install tmux');
    }
    process.exit(1);
  }

  // Check claude is installed
  try {
    childProcess.execFileSync('which', ['claude'], { stdio: 'ignore' });
  } catch (e) {
    console.error('claude CLI is required but not found in PATH.');
    process.exit(1);
  }

  // Start the bot (shared across all sessions)
  startBot();

  // Use custom name or auto-assign
  var sessionName = customName || sessions.nextName();

  // Build the claude command
  var claudeCmd = 'claude';
  if (claudeArgs.length > 0) {
    claudeCmd += ' ' + claudeArgs.map(function (arg) {
      return "'" + arg.replace(/'/g, "'\\''") + "'";
    }).join(' ');
  }

  // Register this session
  sessions.register(sessionName, process.cwd());
  console.log('Starting Claude Code in session: ' + sessionName);

  try {
    childProcess.execFileSync('tmux', [
      'new-session', '-s', sessionName, claudeCmd,
    ], {
      stdio: 'inherit',
    });
  } catch (e) {
    // user detached or claude exited
  }

  // Clean up this session
  sessions.unregister(sessionName);

  // If no sessions left, stop the bot
  stopBotIfNoSessions();
}

main();
