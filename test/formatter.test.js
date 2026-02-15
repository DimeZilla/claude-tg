'use strict';

const {
  escapeHtml,
  extractPermissionDialog,
  extractLastMessage,
  formatNotification,
} = require('../src/lib/formatter');

describe('escapeHtml', () => {
  it('escapes HTML entities', () => {
    expect(escapeHtml('<b>test & "stuff"</b>')).toBe(
      '&lt;b&gt;test &amp; "stuff"&lt;/b&gt;'
    );
  });

  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('extractPermissionDialog', () => {
  it('extracts content below separator line', () => {
    const screen = [
      'Some earlier output',
      '● Working on something',
      '──────────────────────',
      'Allow this action?',
      'Tool: Bash(rm -rf /)',
    ].join('\n');

    expect(extractPermissionDialog(screen)).toBe(
      'Allow this action?\nTool: Bash(rm -rf /)'
    );
  });

  it('finds the last separator when multiple exist', () => {
    const screen = [
      '──────────────────────',
      'Old dialog',
      '──────────────────────',
      'New dialog',
    ].join('\n');

    expect(extractPermissionDialog(screen)).toBe('New dialog');
  });

  it('falls back to last 15 non-empty lines when no separator', () => {
    const lines = [];
    for (let i = 0; i < 20; i++) {
      lines.push(`line ${i}`);
    }
    const result = extractPermissionDialog(lines.join('\n'));
    const resultLines = result.split('\n');
    expect(resultLines).toHaveLength(15);
    expect(resultLines[0]).toBe('line 5');
    expect(resultLines[14]).toBe('line 19');
  });

  it('skips empty lines in fallback', () => {
    const screen = ['a', '', 'b', '', 'c'].join('\n');
    expect(extractPermissionDialog(screen)).toBe('a\nb\nc');
  });

  it('uses fallback when content below separator is empty', () => {
    const screen = ['some content', '──────────────────────', '', ''].join(
      '\n'
    );
    // Separator content is empty, falls back
    const result = extractPermissionDialog(screen);
    expect(result).toContain('some content');
  });
});

describe('extractLastMessage', () => {
  it('extracts last bullet block', () => {
    const screen = [
      '● First response',
      'some text',
      '',
      '● Second response',
      'more text here',
      'and more',
    ].join('\n');

    expect(extractLastMessage(screen)).toBe(
      '● Second response\nmore text here\nand more'
    );
  });

  it('stops at prompt marker', () => {
    const screen = [
      '● Response text',
      'details here',
      '  ❯ waiting for input',
    ].join('\n');

    expect(extractLastMessage(screen)).toBe('● Response text\ndetails here');
  });

  it('stops at separator line', () => {
    const screen = [
      '● Response text',
      'details',
      '──────────────────────',
      'permission dialog',
    ].join('\n');

    expect(extractLastMessage(screen)).toBe('● Response text\ndetails');
  });

  it('falls back to last 10 non-empty lines when no bullet found', () => {
    const lines = [];
    for (let i = 0; i < 15; i++) {
      lines.push(`line ${i}`);
    }
    const result = extractLastMessage(lines.join('\n'));
    const resultLines = result.split('\n');
    expect(resultLines).toHaveLength(10);
    expect(resultLines[0]).toBe('line 5');
  });
});

describe('formatNotification', () => {
  it('formats permission prompt with correct icon and header', () => {
    const hookData = { notification_type: 'permission_prompt' };
    const result = formatNotification(hookData, 'my-session');

    expect(result).toContain('\uD83D\uDD10');
    expect(result).toContain('<b>Permission needed</b>');
    expect(result).toContain('[my-session]');
    expect(result).toContain('/allow to approve');
  });

  it('formats elicitation dialog with question icon', () => {
    const hookData = { notification_type: 'elicitation_dialog' };
    const result = formatNotification(hookData, 'sess');

    expect(result).toContain('\u2753');
    expect(result).toContain('<b>Question for you</b>');
    expect(result).toContain('Reply here to send input');
  });

  it('formats idle prompt with hourglass', () => {
    const hookData = { notification_type: 'idle_prompt' };
    const result = formatNotification(hookData, null);

    expect(result).toContain('\u23F3');
    expect(result).toContain('<b>Waiting for input</b>');
  });

  it('includes title and message when present', () => {
    const hookData = {
      notification_type: 'idle_prompt',
      title: 'My Title',
      message: 'My message',
    };
    const result = formatNotification(hookData, null);

    expect(result).toContain('<b>My Title</b>');
    expect(result).toContain('My message');
  });

  it('escapes HTML in session name and content', () => {
    const hookData = {
      notification_type: 'idle_prompt',
      title: '<script>alert(1)</script>',
    };
    const result = formatNotification(hookData, '<b>bad</b>');

    expect(result).toContain('[&lt;b&gt;bad&lt;/b&gt;]');
    expect(result).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('shows hint tip when showHint is true', () => {
    const hookData = { notification_type: 'idle_prompt' };
    const result = formatNotification(hookData, null, null, true);

    expect(result).toContain('/stop to interrupt');
  });

  it('truncates long screen content', () => {
    const hookData = { notification_type: 'idle_prompt' };
    const longContent = 'x'.repeat(4000);
    const result = formatNotification(hookData, null, longContent, false, true);

    expect(result).toContain('<pre>');
    expect(result).toContain('...\n');
  });

  it('uses transcript content directly when isTranscript is true', () => {
    const hookData = { notification_type: 'idle_prompt' };
    const transcript = 'Direct transcript text';
    const result = formatNotification(
      hookData,
      null,
      transcript,
      false,
      true
    );

    expect(result).toContain('Direct transcript text');
  });
});
