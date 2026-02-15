'use strict';

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatNotification(
  hookData,
  sessionName,
  screenContent,
  showHint,
  isTranscript
) {
  const { notification_type: notificationType, message, title } = hookData;

  const sessionTag = sessionName ? `[${escapeHtml(sessionName)}] ` : '';

  let icon, header;
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

  const parts = [`${icon} ${sessionTag}<b>${escapeHtml(header)}</b>`];

  if (title) parts.push(`<b>${escapeHtml(title)}</b>`);
  if (message) parts.push(escapeHtml(message));

  if (screenContent) {
    let displayText;
    if (isTranscript) {
      displayText = screenContent;
    } else if (notificationType === 'permission_prompt') {
      displayText = extractPermissionDialog(screenContent);
    } else {
      displayText = extractLastMessage(screenContent);
    }
    if (displayText) {
      const truncated =
        displayText.length > 3200
          ? `...\n${displayText.slice(-3200)}`
          : displayText;
      parts.push('');
      parts.push(`<pre>${escapeHtml(truncated)}</pre>`);
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
  const lines = screen.split('\n');

  // Work backwards to find the last horizontal rule separator
  let separatorIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^[─━╌╍┄┅┈┉]{5,}/.test(lines[i].trim())) {
      separatorIndex = i;
      break;
    }
  }

  if (separatorIndex >= 0) {
    const text = lines
      .slice(separatorIndex + 1)
      .join('\n')
      .trim();
    if (text) return text;
  }

  // Fallback: grab last 15 non-empty lines from bottom
  const tail = [];
  for (let j = lines.length - 1; j >= 0 && tail.length < 15; j--) {
    if (lines[j].trim()) tail.unshift(lines[j]);
  }
  return tail.join('\n');
}

// Extract the last Claude response (● block) from terminal output
function extractLastMessage(screen) {
  const lines = screen.split('\n');

  let lastResponseStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*●/.test(lines[i])) {
      lastResponseStart = i;
      break;
    }
  }

  if (lastResponseStart === -1) {
    const tail = [];
    for (let j = lines.length - 1; j >= 0 && tail.length < 10; j--) {
      if (lines[j].trim()) tail.unshift(lines[j]);
    }
    return tail.join('\n');
  }

  const result = [];
  for (let k = lastResponseStart; k < lines.length; k++) {
    if (k > lastResponseStart && /^\s*❯/.test(lines[k])) break;
    if (/^[─━]{10,}/.test(lines[k].trim())) break;
    result.push(lines[k]);
  }

  return result.join('\n').trim();
}

module.exports = {
  formatNotification,
  escapeHtml,
  extractPermissionDialog,
  extractLastMessage,
};
