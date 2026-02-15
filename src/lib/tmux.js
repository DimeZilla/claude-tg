'use strict';

var childProcess = require('child_process');

function sessionExists(sessionName) {
  try {
    childProcess.execFileSync('tmux', ['has-session', '-t', sessionName], {
      stdio: 'ignore',
    });
    return true;
  } catch (e) {
    return false;
  }
}

function sendKeys(sessionName, text, targetPane) {
  var target = targetPane || sessionName;

  // Clear any existing unsubmitted text on the line first
  childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'C-u']);

  // -l sends literal text (no tmux key interpretation)
  // -- prevents text starting with - from being parsed as flags
  childProcess.execFileSync('tmux', ['send-keys', '-t', target, '-l', '--', text]);

  // Send Enter as a separate keystroke
  childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'Enter']);
}

function capturePane(sessionName, lines, targetPane) {
  lines = lines || 50;
  var target = targetPane || sessionName;

  var output = childProcess.execFileSync('tmux', [
    'capture-pane', '-t', target, '-p', '-S', '-' + lines,
  ], { encoding: 'utf8' });

  return output;
}

function sendInterrupt(sessionName, targetPane) {
  var target = targetPane || sessionName;
  // C-c sends Ctrl+C to interrupt the running process
  childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'C-c']);
}

function sendEscape(sessionName, targetPane) {
  var target = targetPane || sessionName;
  childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'Escape']);
}

function sendArrowDown(sessionName, count, targetPane) {
  var target = targetPane || sessionName;
  for (var i = 0; i < count; i++) {
    childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'Down']);
  }
}

function sendEnter(sessionName, targetPane) {
  var target = targetPane || sessionName;
  childProcess.execFileSync('tmux', ['send-keys', '-t', target, 'Enter']);
}

function renameSession(oldName, newName) {
  childProcess.execFileSync('tmux', ['rename-session', '-t', oldName, newName]);
}

module.exports = { sessionExists, sendKeys, capturePane, sendInterrupt, sendEscape, sendArrowDown, sendEnter, renameSession };
