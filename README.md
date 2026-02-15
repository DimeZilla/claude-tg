# claude-tg

A Telegram bridge for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that lets you monitor and control Claude Code sessions from your phone.

Get notified when Claude needs your attention, approve or deny permission prompts, send text input, and manage multiple sessions — all from Telegram.

## Why?

Claude Code runs in a terminal and frequently needs human input: permission approvals, clarifying questions, idle prompts. If you step away from your desk, you miss these and Claude sits waiting. claude-tg sends these prompts to Telegram so you can respond from anywhere.

## Features

- **Push notifications** when Claude needs input (permissions, questions, idle prompts)
- **Two-way communication** — send text and photos to Claude from Telegram
- **Permission management** — approve or deny tool use with `/allow` and `/deny`
- **Multiple sessions** — run several Claude instances and switch between them
- **Screen capture** — view recent terminal output with `/screen`
- **Photo support** — send screenshots to Claude for visual context
- **Notification throttling** — configurable cooldown to prevent spam

## Requirements

- Node.js >= 18
- [tmux](https://github.com/tmux/tmux)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))

## Installation

```bash
git clone https://github.com/yourusername/claude-tg.git
cd claude-tg
npm install
npm run setup
npm link
```

The setup wizard will:

1. Ask for your Telegram bot token
2. Create a `.env` configuration file
3. Install Claude Code hooks in `~/.claude/settings.json`

## Usage

### Starting a session

```bash
claude-tg
```

This will:
- Start the Telegram bot (if not already running)
- Create a new tmux session with Claude Code
- Register the session for Telegram notifications

The first time you message your bot on Telegram, it saves your chat ID automatically. After that, only you can interact with it.

### Passing arguments to Claude

Any arguments (except `--name`) are forwarded to the `claude` CLI:

```bash
claude-tg --resume                  # Resume last conversation
claude-tg -p "fix the login bug"    # Start with a prompt
claude-tg --allowedTools "Bash(git *)" # Restrict tools
```

### Naming sessions

```bash
claude-tg --name my-project
```

Session names auto-generate as `claude-MMDD-HHMM` if not specified.

### Multiple sessions

Start multiple sessions in separate terminals:

```bash
claude-tg --name frontend
claude-tg --name backend
```

Use `/switch` and `/sessions` in Telegram to manage them.

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/allow` | Approve a permission prompt |
| `/deny` | Deny a permission prompt |
| `/stop` | Send Ctrl+C to interrupt Claude |
| `/escape` | Send Escape key |
| `/screen` | Show recent terminal output |
| `/status` | List all active sessions |
| `/sessions` | Same as `/status` |
| `/switch <name>` | Switch active session |
| `/rename <name>` | Rename the active session |
| `/help` | Show command list |

Any other text you send is forwarded as input to the active Claude session.

You can also send photos — they're saved to the session's working directory and Claude is told to look at the file.

## Configuration

Settings live in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `BOT_TOKEN` | *(required)* | Telegram bot token from @BotFather |
| `CHAT_ID` | *(auto)* | Your Telegram chat ID (saved on first message) |
| `NOTIFY_ON_IDLE` | `true` | Notify when Claude is waiting for input |
| `NOTIFY_ON_PERMISSION` | `true` | Notify on permission prompts |
| `NOTIFY_ON_STOP` | `true` | Notify when a Claude session ends |
| `IDLE_COOLDOWN` | `180` | Seconds between repeated idle notifications |

## How It Works

```
┌─────────────┐     hooks (stdin JSON)     ┌────────────┐
│ Claude Code  │ ─────────────────────────▶ │  notify.js │
│  (in tmux)   │                            └─────┬──────┘
└──────▲───────┘                                  │
       │ sendKeys/capturePane                     │ HTTPS
       │                                          ▼
┌──────┴───────┐     long polling          ┌────────────┐
│   bot.js     │ ◀───────────────────────▶ │  Telegram   │
│ (background) │                            │    API      │
└──────────────┘                            └────────────┘
```

1. **`claude-tg` (cli.js)** launches Claude Code inside a tmux session and starts the bot process
2. **Claude Code hooks** fire `notify.js` when Claude needs attention, which sends a Telegram message
3. **`bot.js`** polls Telegram for your replies and forwards them to the tmux session via `sendKeys`
4. When the last session exits, the bot shuts itself down

## Security

- The bot only responds to the chat ID saved during initial setup
- Unauthorized users get a rejection message and nothing else
- The bot token and chat ID are stored in `.env` (gitignored)
- No data leaves your machine except through the Telegram Bot API

## Troubleshooting

**Bot not responding?**
- Check `bot.log` for errors
- Make sure only one bot instance is running (error 409 = duplicate)
- Verify your `.env` has the correct `BOT_TOKEN`

**Not getting notifications?**
- Confirm hooks are installed: check `~/.claude/settings.json` for claude-tg entries
- Re-run `npm run setup` to reinstall hooks
- Check that `NOTIFY_ON_*` settings are `true` in `.env`
- Lower `IDLE_COOLDOWN` if notifications feel too sparse

**Permission prompt shows wrong content?**
- This happens when Claude's response is long and pushes the permission dialog off the captured area
- Use `/screen` to see the full terminal state

**tmux not found?**
- macOS: `brew install tmux`
- Linux: `sudo apt install tmux`

## License

MIT
