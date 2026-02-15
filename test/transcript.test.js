'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  getLastAssistantMessage,
  getLastQuestionMeta,
} = require('../src/lib/transcript');

function writeTmpJsonl(lines) {
  const tmpFile = path.join(
    os.tmpdir(),
    `transcript-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`
  );
  fs.writeFileSync(tmpFile, lines.map(JSON.stringify).join('\n'));
  return tmpFile;
}

var tmpFiles = [];

function tmpJsonl(lines) {
  var f = writeTmpJsonl(lines);
  tmpFiles.push(f);
  return f;
}

afterEach(() => {
  for (var f of tmpFiles) {
    try {
      fs.unlinkSync(f);
    } catch (_e) {}
  }
  tmpFiles = [];
});

describe('getLastAssistantMessage', () => {
  it('returns null for null/missing path', () => {
    expect(getLastAssistantMessage(null)).toBeNull();
    expect(getLastAssistantMessage('/nonexistent/path.jsonl')).toBeNull();
  });

  it('extracts text from simple assistant message', () => {
    var f = tmpJsonl([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello from Claude' }],
        },
      },
    ]);

    expect(getLastAssistantMessage(f)).toBe('Hello from Claude');
  });

  it('returns the last assistant message, not earlier ones', () => {
    var f = tmpJsonl([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'First message' }],
        },
      },
      {
        type: 'human',
        message: { content: [{ type: 'text', text: 'user reply' }] },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Second message' }],
        },
      },
    ]);

    expect(getLastAssistantMessage(f)).toBe('Second message');
  });

  it('extracts AskUserQuestion content', () => {
    var f = tmpJsonl([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'AskUserQuestion',
              input: {
                questions: [
                  {
                    question: 'Which option?',
                    options: [
                      { label: 'Option A' },
                      { label: 'Option B' },
                      { label: 'Option C' },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    ]);

    var result = getLastAssistantMessage(f);
    expect(result).toContain('Which option?');
    expect(result).toContain('1. Option A');
    expect(result).toContain('2. Option B');
    expect(result).toContain('3. Option C');
  });

  it('prefers question content when text + question are both present', () => {
    var f = tmpJsonl([
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Some preamble text before the question.' },
            {
              type: 'tool_use',
              name: 'AskUserQuestion',
              input: {
                questions: [
                  {
                    question: 'Which approach do you prefer?',
                    options: [{ label: 'Fast' }, { label: 'Safe' }],
                  },
                ],
              },
            },
          ],
        },
      },
    ]);

    var result = getLastAssistantMessage(f);
    expect(result).toContain('Which approach do you prefer?');
    expect(result).toContain('1. Fast');
    expect(result).toContain('2. Safe');
  });

  it('skips invalid JSON lines gracefully', () => {
    var tmpFile = path.join(
      os.tmpdir(),
      `transcript-test-${Date.now()}.jsonl`
    );
    tmpFiles.push(tmpFile);

    var lines = [
      'not valid json',
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Good message' }] },
      }),
    ];
    fs.writeFileSync(tmpFile, lines.join('\n'));

    expect(getLastAssistantMessage(tmpFile)).toBe('Good message');
  });

  it('returns null when no assistant messages exist', () => {
    var f = tmpJsonl([
      { type: 'human', message: { content: [{ type: 'text', text: 'hi' }] } },
    ]);
    expect(getLastAssistantMessage(f)).toBeNull();
  });

  it('returns null for assistant message with no text content', () => {
    var f = tmpJsonl([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'SomeOtherTool', input: {} }],
        },
      },
    ]);
    expect(getLastAssistantMessage(f)).toBeNull();
  });
});

describe('getLastQuestionMeta', () => {
  it('returns null for missing path', () => {
    expect(getLastQuestionMeta(null)).toBeNull();
    expect(getLastQuestionMeta('/nonexistent/path.jsonl')).toBeNull();
  });

  it('returns option count for AskUserQuestion', () => {
    var f = tmpJsonl([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'AskUserQuestion',
              input: {
                questions: [
                  {
                    question: 'Pick one?',
                    options: [
                      { label: 'A' },
                      { label: 'B' },
                      { label: 'C' },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    ]);

    expect(getLastQuestionMeta(f)).toEqual({ optionCount: 3 });
  });

  it('returns null when no question in last assistant message', () => {
    var f = tmpJsonl([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Just a statement' }],
        },
      },
    ]);

    expect(getLastQuestionMeta(f)).toBeNull();
  });

  it('returns null when no assistant messages exist', () => {
    var f = tmpJsonl([
      { type: 'human', message: { content: [{ type: 'text', text: 'hi' }] } },
    ]);
    expect(getLastQuestionMeta(f)).toBeNull();
  });
});
