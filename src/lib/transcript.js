'use strict';

const fs = require('fs');

// Extract the last assistant text message from a Claude Code
// transcript JSONL file.
function getLastAssistantMessage(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.trim().split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch (_e) {
        continue;
      }

      if (entry.type !== 'assistant') continue;

      const msg = entry.message;
      if (!msg || !msg.content || !Array.isArray(msg.content)) {
        continue;
      }

      let texts = [];
      let hasQuestion = false;

      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          texts.push(block.text);
        } else if (
          block.type === 'tool_use' &&
          block.name === 'AskUserQuestion' &&
          block.input
        ) {
          hasQuestion = true;
          const questions = block.input.questions;
          if (Array.isArray(questions)) {
            for (const question of questions) {
              texts.push(question.question || '');
              if (Array.isArray(question.options)) {
                question.options.forEach((opt, idx) => {
                  texts.push(`${idx + 1}. ${opt.label}`);
                });
              }
            }
          }
        }
      }

      // If there's a question, prefer just the question content
      if (hasQuestion && texts.length > 1) {
        const questionStart = texts.findIndex(
          (t) => t.match(/\?($|\s)/) || t.match(/^\d+\./)
        );
        if (questionStart > 0) {
          texts = texts.slice(questionStart);
        }
      }

      if (texts.length > 0) {
        return texts.join('\n');
      }
    }
  } catch (_e) {
    // ignore read errors
  }

  return null;
}

// Returns { optionCount: N } if the last assistant message has
// an AskUserQuestion, or null if no question found.
function getLastQuestionMeta(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.trim().split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch (_e) {
        continue;
      }

      if (entry.type !== 'assistant') continue;
      const msg = entry.message;
      if (!msg || !msg.content || !Array.isArray(msg.content)) {
        continue;
      }

      for (const block of msg.content) {
        if (
          block.type === 'tool_use' &&
          block.name === 'AskUserQuestion' &&
          block.input
        ) {
          const questions = block.input.questions;
          if (
            Array.isArray(questions) &&
            questions.length > 0 &&
            Array.isArray(questions[0].options)
          ) {
            return { optionCount: questions[0].options.length };
          }
        }
      }
      // Only check the last assistant message
      return null;
    }
  } catch (_e) {
    // ignore
  }
  return null;
}

module.exports = { getLastAssistantMessage, getLastQuestionMeta };
