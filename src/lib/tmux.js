'use strict';

const childProcess = require('child_process');

function sessionExists(sessionName) {
  try {
    childProcess.execFileSync('tmux', ['has-session', '-t', sessionName], {
      stdio: 'ignore',
    });
    return true;
  } catch (_e) {
    return false;
  }
}

function sendKeys(sessionName, text, targetPane) {
  const target = targetPane || sessionName;

  // Clear any existing unsubmitted text on the line first
  childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'C-u']);

  // -l sends literal text (no tmux key interpretation)
  // -- prevents text starting with - from being parsed as flags
  childProcess.execFileSync('tmux', [
    'send-keys',
    '-t',
    target,
    '-l',
    '--',
    text,
  ]);

  // Send Enter as a separate keystroke
  childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'Enter']);
}

function capturePane(sessionName, lines = 50, targetPane) {
  const target = targetPane || sessionName;

  return childProcess.execFileSync(
    'tmux',
    ['capture-pane', '-t', target, '-p', '-S', `-${lines}`],
    { encoding: 'utf8' }
  );
}

function sendInterrupt(sessionName, targetPane) {
  const target = targetPane || sessionName;
  childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'C-c']);
}

function sendEscape(sessionName, targetPane) {
  const target = targetPane || sessionName;
  childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'Escape']);
}

function sendArrowDown(sessionName, count, targetPane) {
  const target = targetPane || sessionName;
  for (let i = 0; i < count; i++) {
    childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'Down']);
  }
}

function sendEnter(sessionName, targetPane) {
  const target = targetPane || sessionName;
  childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'Enter']);
}

function renameSession(oldName, newName) {
  childProcess.execFileSync('tmux', ['rename-session', '-t', oldName, newName]);
}

module.exports = {
  sessionExists,
  sendKeys,
  capturePane,
  sendInterrupt,
  sendEscape,
  sendArrowDown,
  sendEnter,
  renameSession,
};
