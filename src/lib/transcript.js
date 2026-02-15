'use strict';

var fs = require('fs');

// Extract the last assistant text message from a Claude Code transcript JSONL file.
// Reads the file backwards efficiently to avoid loading the entire file.
function getLastAssistantMessage(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;

  try {
    var content = fs.readFileSync(transcriptPath, 'utf8');
    var lines = content.trim().split('\n');

    // Walk backwards to find the last assistant message
    for (var i = lines.length - 1; i >= 0; i--) {
      var entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch (e) {
        continue;
      }

      if (entry.type !== 'assistant') continue;

      var msg = entry.message;
      if (!msg || !msg.content || !Array.isArray(msg.content)) continue;

      // Collect text blocks and AskUserQuestion tool calls
      var texts = [];
      var hasQuestion = false;
      for (var j = 0; j < msg.content.length; j++) {
        var block = msg.content[j];
        if (block.type === 'text' && block.text) {
          texts.push(block.text);
        } else if (block.type === 'tool_use' && block.name === 'AskUserQuestion' && block.input) {
          hasQuestion = true;
          var questions = block.input.questions;
          if (Array.isArray(questions)) {
            for (var q = 0; q < questions.length; q++) {
              var question = questions[q];
              texts.push(question.question || '');
              if (Array.isArray(question.options)) {
                for (var k = 0; k < question.options.length; k++) {
                  texts.push((k + 1) + '. ' + question.options[k].label);
                }
              }
            }
          }
        }
      }

      // If there's a question, prefer just the question content (skip preamble text)
      if (hasQuestion && texts.length > 1) {
        // Remove any pre-question text like "Sure, let's test..."
        var questionStart = -1;
        for (var t = 0; t < texts.length; t++) {
          if (texts[t].match(/\?($|\s)/) || texts[t].match(/^\d+\./)) {
            questionStart = t;
            break;
          }
        }
        if (questionStart > 0) {
          texts = texts.slice(questionStart);
        }
      }

      if (texts.length > 0) {
        return texts.join('\n');
      }
    }
  } catch (e) {
    // ignore read errors
  }

  return null;
}

// Returns { optionCount: N } if the last assistant message has an AskUserQuestion,
// or null if no question found.
function getLastQuestionMeta(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;

  try {
    var content = fs.readFileSync(transcriptPath, 'utf8');
    var lines = content.trim().split('\n');

    for (var i = lines.length - 1; i >= 0; i--) {
      var entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch (e) {
        continue;
      }

      if (entry.type !== 'assistant') continue;
      var msg = entry.message;
      if (!msg || !msg.content || !Array.isArray(msg.content)) continue;

      for (var j = 0; j < msg.content.length; j++) {
        var block = msg.content[j];
        if (block.type === 'tool_use' && block.name === 'AskUserQuestion' && block.input) {
          var questions = block.input.questions;
          if (Array.isArray(questions) && questions.length > 0 && Array.isArray(questions[0].options)) {
            return { optionCount: questions[0].options.length };
          }
        }
      }
      // Only check the last assistant message
      return null;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

module.exports = { getLastAssistantMessage, getLastQuestionMeta };
