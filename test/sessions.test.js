'use strict';

var fs = require('fs');
var childProcess = require('child_process');
var sessions = require('../src/lib/sessions');

var state = null;

beforeEach(() => {
  state = null;

  vi.spyOn(fs, 'existsSync').mockImplementation(() => state !== null);
  vi.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify(state));
  vi.spyOn(fs, 'writeFileSync').mockImplementation((_, data) => {
    state = JSON.parse(data);
  });
  vi.spyOn(childProcess, 'execFileSync').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('nextName', () => {
  it('generates name in claude-MMDD-HHMM format', () => {
    state = { active: null, sessions: {} };
    var name = sessions.nextName();
    expect(name).toMatch(/^claude-\d{4}-\d{4}$/);
  });

  it('appends seconds on collision', () => {
    var now = new Date();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    var hour = String(now.getHours()).padStart(2, '0');
    var min = String(now.getMinutes()).padStart(2, '0');
    var baseName = `claude-${month}${day}-${hour}${min}`;

    var existingSessions = {};
    existingSessions[baseName] = { cwd: '/tmp', startedAt: new Date().toISOString() };

    state = { active: baseName, sessions: existingSessions };

    var name = sessions.nextName();
    expect(name).toMatch(/^claude-\d{4}-\d{6}$/);
    expect(name.length).toBe(baseName.length + 2);
  });
});

describe('rename', () => {
  it('swaps session key and updates active', () => {
    state = {
      active: 'old-name',
      sessions: {
        'old-name': { cwd: '/tmp', startedAt: '2024-01-01T00:00:00Z' },
      },
    };

    var result = sessions.rename('old-name', 'new-name');
    expect(result).toBe(true);
    expect(state.sessions['new-name']).toBeDefined();
    expect(state.sessions['old-name']).toBeUndefined();
    expect(state.active).toBe('new-name');
  });

  it('does not update active if renamed session is not active', () => {
    state = {
      active: 'other',
      sessions: {
        'old-name': { cwd: '/tmp', startedAt: '2024-01-01T00:00:00Z' },
        other: { cwd: '/tmp', startedAt: '2024-01-01T00:00:00Z' },
      },
    };

    sessions.rename('old-name', 'new-name');
    expect(state.active).toBe('other');
  });

  it('rejects rename when source does not exist', () => {
    state = { active: null, sessions: {} };
    expect(sessions.rename('nonexistent', 'new')).toBe(false);
  });

  it('rejects rename when target already exists', () => {
    state = {
      active: 'a',
      sessions: {
        a: { cwd: '/tmp', startedAt: '2024-01-01T00:00:00Z' },
        b: { cwd: '/tmp', startedAt: '2024-01-01T00:00:00Z' },
      },
    };

    expect(sessions.rename('a', 'b')).toBe(false);
  });
});

describe('register and unregister', () => {
  it('register adds session and sets active', () => {
    state = { active: null, sessions: {} };

    sessions.register('test-session', '/home/user');

    expect(state.active).toBe('test-session');
    expect(state.sessions['test-session'].cwd).toBe('/home/user');
  });

  it('unregister removes session and updates active', () => {
    state = {
      active: 'sess-a',
      sessions: {
        'sess-a': { cwd: '/tmp', startedAt: '2024-01-01T00:00:00Z' },
        'sess-b': { cwd: '/tmp', startedAt: '2024-01-01T00:00:00Z' },
      },
    };

    sessions.unregister('sess-a');

    expect(state.sessions['sess-a']).toBeUndefined();
    expect(state.active).toBe('sess-b');
  });

  it('unregister sets active to null when last session removed', () => {
    state = {
      active: 'only',
      sessions: {
        only: { cwd: '/tmp', startedAt: '2024-01-01T00:00:00Z' },
      },
    };

    sessions.unregister('only');
    expect(state.active).toBeNull();
  });
});

describe('prune', () => {
  it('removes sessions whose tmux session is gone', () => {
    childProcess.execFileSync.mockImplementation(() => {
      throw new Error('no session');
    });

    state = {
      active: 'dead',
      sessions: {
        dead: { cwd: '/tmp', startedAt: '2024-01-01T00:00:00Z' },
      },
    };

    var result = sessions.prune();
    expect(result.sessions).toEqual({});
    expect(result.active).toBeNull();
  });

  it('keeps sessions whose tmux session exists', () => {
    childProcess.execFileSync.mockImplementation(() => {});

    state = {
      active: 'alive',
      sessions: {
        alive: { cwd: '/tmp', startedAt: '2024-01-01T00:00:00Z' },
      },
    };

    var result = sessions.prune();
    expect(result.sessions.alive).toBeDefined();
    expect(result.active).toBe('alive');
  });
});
