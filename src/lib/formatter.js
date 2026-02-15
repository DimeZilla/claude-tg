'use strict';

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatNotification(hookData, sessionName, screenContent, showHint, isTranscript) {
  var notificationType = hookData.notification_type;
  var message = hookData.message;
  var title = hookData.title;

  var sessionTag = sessionName ? '[' + escapeHtml(sessionName) + '] ' : '';

  var icon, header;
  if (notificationType === 'permission_prompt') {
    icon = '\uD83D\uDD10';
    header = 'Permission needed';
  } else if (notificationType === 'elicitation_dialog') {
    icon = '\u2753';
    header = 'Question for you';
  } else {
    icon = '\u23F3';
    header = 'Waiting for input';
  }

  var parts = [
    icon + ' ' + sessionTag + '<b>' + escapeHtml(header) + '</b>',
  ];

  if (title) parts.push('<b>' + escapeHtml(title) + '</b>');
  if (message) parts.push(escapeHtml(message));

  // Show the last Claude message
  if (screenContent) {
    var displayText;
    if (isTranscript) {
      displayText = screenContent;
    } else if (notificationType === 'permission_prompt') {
      displayText = extractPermissionDialog(screenContent);
    } else {
      displayText = extractLastMessage(screenContent);
    }
    if (displayText) {
      var truncated = displayText.length > 3200
        ? '...\n' + displayText.slice(-3200)
        : displayText;
      parts.push('');
      parts.push('<pre>' + escapeHtml(truncated) + '</pre>');
    }
  }

  parts.push('');
  if (showHint) {
    parts.push('<i>Tip: /stop to interrupt, /help for commands</i>');
  } else if (notificationType === 'permission_prompt') {
    parts.push('<i>/allow to approve, /deny to reject</i>');
  } else {
    parts.push('<i>Reply here to send input</i>');
  }

  return parts.join('\n');
}

// Extract the permission dialog from the bottom of the terminal
function extractPermissionDialog(screen) {
  var lines = screen.split('\n');

  // Work backwards from the bottom to find the permission dialog.
  // The dialog sits below the last horizontal rule separator (─ or ━).
  var separatorIndex = -1;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (/^[─━╌╍┄┅┈┉]{5,}/.test(lines[i].trim())) {
      separatorIndex = i;
      break;
    }
  }

  if (separatorIndex >= 0) {
    // Take everything below the separator
    var dialogLines = lines.slice(separatorIndex + 1);
    var text = dialogLines.join('\n').trim();
    if (text) return text;
  }

  // Fallback: grab last 15 non-empty lines from bottom
  var tail = [];
  for (var j = lines.length - 1; j >= 0 && tail.length < 15; j--) {
    if (lines[j].trim()) tail.unshift(lines[j]);
  }
  return tail.join('\n');
}

// Extract the last Claude response (● block) from terminal output
function extractLastMessage(screen) {
  var lines = screen.split('\n');

  // Find the last line starting with ● (Claude's response marker)
  var lastResponseStart = -1;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (/^\s*●/.test(lines[i])) {
      lastResponseStart = i;
      break;
    }
  }

  if (lastResponseStart === -1) {
    // No ● found — just return the last few non-empty lines
    var tail = [];
    for (var j = lines.length - 1; j >= 0 && tail.length < 10; j--) {
      if (lines[j].trim()) tail.unshift(lines[j]);
    }
    return tail.join('\n');
  }

  // Collect from ● until the next ❯ prompt or end of output
  var result = [];
  for (var k = lastResponseStart; k < lines.length; k++) {
    // Stop if we hit a user prompt line (but not on the first line)
    if (k > lastResponseStart && /^\s*❯/.test(lines[k])) break;
    // Stop if we hit the horizontal rule separator
    if (/^[─━]{10,}/.test(lines[k].trim())) break;
    result.push(lines[k]);
  }

  return result.join('\n').trim();
}

module.exports = { formatNotification, escapeHtml };
