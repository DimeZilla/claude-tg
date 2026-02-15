# CLAUDE.md

Technical reference for AI assistants working on claude-tg.

## What This Project Is

claude-tg bridges Telegram and Claude Code. It runs Claude Code inside tmux sessions and provides two-way communication via a Telegram bot. Users get push notifications when Claude needs input and can respond from Telegram.

## Architecture

There are three main processes:

- **cli.js** — User-facing entry point. Launches Claude in tmux, starts/stops the bot.
- **bot.js** — Long-running Telegram bot (singleton). Polls for messages, forwards input to tmux.
- **notify.js** — Stateless hook handler. Called by Claude Code via stdin JSON, sends Telegram notifications.

### Data flow

```
Claude Code ──(hook/stdin JSON)──▶ notify.js ──(HTTPS)──▶ Telegram
tmux ◀──(sendKeys/capturePane)── bot.js ◀──(long polling)── Telegram
```

### State files (all in project root, all gitignored)

- `.env` — Config (bot token, chat ID, notification settings)
- `.sessions.json` — `{ active: string, sessions: { [name]: { cwd, startedAt } } }`
- `.bot.pid` — PID of running bot process
- `.notify-log.json` — `{ lastIdle, lastPermission, timestamps[] }` for throttling
- `bot.log` — Append-only bot log

## Source Files

```
src/
  cli.js          — CLI entry point, tmux session lifecycle, bot start/stop
  bot.js          — Telegram bot: message routing, command handlers, photo download
  notify.js       — Hook handler: reads stdin JSON, formats and sends notification
  setup.js        — Interactive setup wizard, hook installation
  lib/
    config.js     — Loads .env, validates BOT_TOKEN format, provides saveChatId()
    telegram.js   — Raw HTTPS Telegram API client with retry logic (not the bot library)
    tmux.js       — Thin wrapper over tmux CLI commands (sendKeys, capturePane, etc.)
    sessions.js   — Session CRUD on .sessions.json, auto-pruning dead tmux sessions
    formatter.js  — HTML message formatting, terminal output extraction
    transcript.js — Reads Claude JSONL transcripts to extract last assistant message
```

## Key Patterns

### Session management
- Sessions auto-name as `claude-MMDD-HHMM` (with seconds appended on collision)
- `sessions.prune()` is called on every read to remove sessions whose tmux sessions died
- The "active" session is what Telegram commands target; auto-updates on prune
- Each session stores `cwd` so notify.js can match hook events to sessions by working directory

### Bot lifecycle
- cli.js starts bot.js as a detached child process, writes PID to `.bot.pid`
- Multiple cli.js invocations share one bot process
- When the last session exits, cli.js kills the bot

### Notification hook
- Claude Code passes JSON via stdin with `hook_event_name`, `notification_type`, `cwd`, `transcript_path`
- notify.js is stateless per invocation — throttling state lives in `.notify-log.json`
- For permission prompts: extracts the dialog from the bottom of the terminal (below `─` separator)
- For idle prompts: prefers transcript content (structured) over tmux capture (fragile)

### Terminal content extraction (`formatter.js`)
- `extractPermissionDialog()` — finds content below the last `─` separator line (permission dialog area)
- `extractLastMessage()` — finds the last `●`-prefixed block (Claude's response marker), stops at `❯` prompt or separator
- Both have fallbacks for when markers aren't found

### tmux interaction
- `sendKeys()` clears the line first (Ctrl+U) to avoid concatenating with existing text
- Text is sent with `-l` flag (literal) and `--` to prevent flag parsing
- Enter is sent as a separate keystroke after the text

## Conventions

- **No ES modules** — all files use `require()`/CommonJS and `var` declarations
- **No transpilation** — runs directly on Node.js 18+
- **Minimal dependencies** — only `dotenv` and `node-telegram-bot-api`
- **Telegram HTML** — messages use HTML parse mode (`<b>`, `<code>`, `<pre>`, `<i>`), escape with `escapeHtml()`
- **Error handling** — hook scripts (notify.js) swallow all errors and `process.exit(0)` to never block Claude

## Claude Code Hook Integration

Hooks are installed in `~/.claude/settings.json` by `setup.js`:

```json
{
  "hooks": {
    "Notification": [{
      "matcher": "idle_prompt|permission_prompt|elicitation_dialog",
      "hooks": [{ "type": "command", "command": "node <path>/src/notify.js", "timeout": 10 }]
    }],
    "Stop": [{
      "hooks": [{ "type": "command", "command": "node <path>/src/notify.js", "timeout": 10 }]
    }]
  }
}
```

Hook data format (stdin JSON):
```json
{
  "hook_event_name": "Notification",
  "notification_type": "permission_prompt",
  "message": "...",
  "title": "...",
  "cwd": "/path/to/project",
  "transcript_path": "/path/to/transcript.jsonl"
}
```

## Common Tasks

### Adding a new Telegram command
1. Add handler function in `bot.js` (follow existing pattern)
2. Add routing in the `bot.on('message')` if/else chain
3. Add to `/help` output in `handleHelp()`

### Changing notification format
- Edit `formatter.js` — `formatNotification()` builds the message
- Terminal parsing lives in `extractLastMessage()` and `extractPermissionDialog()`

### Adding a new notification type
1. Update the hook matcher in `setup.js` if needed
2. Add filtering logic in `notify.js`
3. Add formatting case in `formatter.js`

### Debugging notifications
- Set `IDLE_COOLDOWN=10` in `.env` for faster iteration
- Check `bot.log` for bot errors
- Run `node src/notify.js` manually with JSON piped to stdin to test formatting
