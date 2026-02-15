'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SESSIONS_PATH = path.join(PROJECT_ROOT, '.sessions.json');

function load() {
  if (!fs.existsSync(SESSIONS_PATH)) {
    return { active: null, sessions: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
  } catch (_e) {
    return { active: null, sessions: {} };
  }
}

function save(state) {
  fs.writeFileSync(SESSIONS_PATH, `${JSON.stringify(state, null, 2)}\n`);
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

// Remove sessions whose tmux sessions no longer exist
function prune() {
  const state = load();
  let changed = false;
  const names = Object.keys(state.sessions);

  for (const name of names) {
    if (!tmuxSessionExists(name)) {
      delete state.sessions[name];
      changed = true;
    }
  }

  if (state.active && !state.sessions[state.active]) {
    const remaining = Object.keys(state.sessions);
    state.active =
      remaining.length > 0 ? remaining[remaining.length - 1] : null;
    changed = true;
  }

  if (changed) save(state);
  return state;
}

// Generate a unique session name: claude-0214-1352
function nextName() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  let name = `claude-${month}${day}-${hour}${min}`;

  const state = load();
  if (state.sessions[name]) {
    const sec = String(now.getSeconds()).padStart(2, '0');
    name = `${name}${sec}`;
  }
  return name;
}

function register(name, cwd) {
  const state = load();
  state.sessions[name] = {
    cwd: cwd || process.cwd(),
    startedAt: new Date().toISOString(),
  };
  state.active = name;
  save(state);
}

function unregister(name) {
  const state = load();
  delete state.sessions[name];
  if (state.active === name) {
    const remaining = Object.keys(state.sessions);
    state.active =
      remaining.length > 0 ? remaining[remaining.length - 1] : null;
  }
  save(state);
}

function setActive(name) {
  const state = load();
  if (state.sessions[name]) {
    state.active = name;
    save(state);
  }
}

function getActive() {
  const state = prune();
  return state.active;
}

function list() {
  const state = prune();
  return {
    active: state.active,
    sessions: state.sessions,
  };
}

function rename(oldName, newName) {
  const state = load();
  if (!state.sessions[oldName]) return false;
  if (state.sessions[newName]) return false;

  state.sessions[newName] = state.sessions[oldName];
  delete state.sessions[oldName];
  if (state.active === oldName) {
    state.active = newName;
  }
  save(state);
  return true;
}

module.exports = {
  load,
  save,
  prune,
  nextName,
  register,
  unregister,
  setActive,
  getActive,
  list,
  rename,
  SESSIONS_PATH,
};
