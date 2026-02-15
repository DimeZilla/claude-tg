#!/usr/bin/env node
'use strict';

const readline = require('readline');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function main() {
  console.log('\nclaude-tg Setup');
  console.log('================\n');

  let token = await ask('1. Telegram Bot Token (from @BotFather):\n> ');
  token = token.trim();
  if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(token)) {
    console.error(
      '\nInvalid token format. Should look like: ' +
        '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'
    );
    process.exit(1);
  }
  console.log('\n   Token format valid.\n');

  const envLines = [
    `BOT_TOKEN=${token}`,
    'CHAT_ID=',
    'TMUX_SESSION=claude',
    'TMUX_TARGET_PANE=',
    'NOTIFY_ON_STOP=true',
    'NOTIFY_ON_IDLE=true',
    'NOTIFY_ON_PERMISSION=true',
  ];
  fs.writeFileSync(ENV_PATH, `${envLines.join('\n')}\n`);
  console.log('   .env saved.\n');

  installHooks();

  console.log(
    '\n3. Message your bot on Telegram to register ' + 'your chat ID.'
  );
  console.log('   The bot will save it automatically when you run it.\n');
  console.log('   To start the bot: npm start\n');

  console.log('Setup complete!\n');
  console.log('Usage:');
  console.log(
    '  1. Run: npm link     ' + '(one-time, makes claude-tg available globally)'
  );
  console.log(
    '  2. Run: claude-tg    ' + '(starts everything automatically)\n'
  );
  console.log(
    'All claude flags work: claude-tg --resume, ' +
      'claude-tg -p "fix bug", etc.\n'
  );

  rl.close();
}

function installHooks() {
  const settingsDir = path.join(process.env.HOME, '.claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  let settings = {};

  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (_e) {
      console.error(
        '   Warning: Could not parse existing ' +
          'settings.json, creating new one.'
      );
      settings = {};
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const notifyCommand = `node ${path.resolve(__dirname, 'notify.js')}`;

  if (!settings.hooks.Notification) {
    settings.hooks.Notification = [];
  }

  const hasNotifHook = settings.hooks.Notification.some(
    (group) =>
      group.hooks &&
      group.hooks.some((h) => h.command && h.command.includes('claude-tg'))
  );

  if (!hasNotifHook) {
    settings.hooks.Notification.push({
      matcher: 'idle_prompt|permission_prompt|elicitation_dialog',
      hooks: [
        {
          type: 'command',
          command: notifyCommand,
          timeout: 10,
        },
      ],
    });
  }

  if (!settings.hooks.Stop) {
    settings.hooks.Stop = [];
  }

  const hasStopHook = settings.hooks.Stop.some(
    (group) =>
      group.hooks &&
      group.hooks.some((h) => h.command && h.command.includes('claude-tg'))
  );

  if (!hasStopHook) {
    settings.hooks.Stop.push({
      hooks: [
        {
          type: 'command',
          command: notifyCommand,
          timeout: 10,
        },
      ],
    });
  }

  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  console.log('3. Hooks installed in ~/.claude/settings.json');
}

main().catch((err) => {
  console.error(`Setup failed: ${err.message}`);
  rl.close();
  process.exit(1);
});
