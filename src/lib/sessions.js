'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

var PROJECT_ROOT = path.join(__dirname, '..', '..');
var SESSIONS_PATH = path.join(PROJECT_ROOT, '.sessions.json');

function load() {
  if (!fs.existsSync(SESSIONS_PATH)) {
    return { active: null, sessions: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
  } catch (e) {
    return { active: null, sessions: {} };
  }
}

function save(state) {
  fs.writeFileSync(SESSIONS_PATH, JSON.stringify(state, null, 2) + '\n');
}

function tmuxSessionExists(name) {
  try {
    childProcess.execFileSync('tmux', ['has-session', '-t', name], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// Remove sessions whose tmux sessions no longer exist
function prune() {
  var state = load();
  var changed = false;
  var names = Object.keys(state.sessions);

  for (var i = 0; i < names.length; i++) {
    if (!tmuxSessionExists(names[i])) {
      delete state.sessions[names[i]];
      changed = true;
    }
  }

  if (state.active && !state.sessions[state.active]) {
    // Active session was pruned — pick the most recent remaining
    var remaining = Object.keys(state.sessions);
    state.active = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    changed = true;
  }

  if (changed) save(state);
  return state;
}

// Generate a unique session name based on timestamp: claude-0214-1352
function nextName() {
  var now = new Date();
  var month = String(now.getMonth() + 1).padStart(2, '0');
  var day = String(now.getDate()).padStart(2, '0');
  var hour = String(now.getHours()).padStart(2, '0');
  var min = String(now.getMinutes()).padStart(2, '0');
  var name = 'claude-' + month + day + '-' + hour + min;

  // If somehow two sessions start in the same minute, append seconds
  var state = load();
  if (state.sessions[name]) {
    var sec = String(now.getSeconds()).padStart(2, '0');
    name = name + sec;
  }
  return name;
}

// Register a new session
function register(name, cwd) {
  var state = load();
  state.sessions[name] = {
    cwd: cwd || process.cwd(),
    startedAt: new Date().toISOString(),
  };
  state.active = name;
  save(state);
}

// Remove a session
function unregister(name) {
  var state = load();
  delete state.sessions[name];
  if (state.active === name) {
    var remaining = Object.keys(state.sessions);
    state.active = remaining.length > 0 ? remaining[remaining.length - 1] : null;
  }
  save(state);
}

// Set the active session (for bot targeting)
function setActive(name) {
  var state = load();
  if (state.sessions[name]) {
    state.active = name;
    save(state);
  }
}

// Get current active session name
function getActive() {
  var state = prune();
  return state.active;
}

// List all live sessions
function list() {
  var state = prune();
  return {
    active: state.active,
    sessions: state.sessions,
  };
}

module.exports = {
  load: load,
  save: save,
  prune: prune,
  nextName: nextName,
  register: register,
  unregister: unregister,
  setActive: setActive,
  getActive: getActive,
  list: list,
  SESSIONS_PATH: SESSIONS_PATH,
};
