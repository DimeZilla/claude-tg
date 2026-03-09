package setup

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"claude-tg/internal/config"
)

var tokenRegex = regexp.MustCompile(`^\d+:[A-Za-z0-9_-]{35,}$`)

func InstallHooksOnly() {
	if err := installHooks(); err != nil {
		fmt.Printf("Failed to install hooks: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Hooks updated to use Go binary.")
}

func Run() {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println("=== Claude TG Setup ===")
	fmt.Println()
	fmt.Println("This will configure claude-tg to bridge Claude Code with Telegram.")
	fmt.Println()

	// Get bot token
	fmt.Print("Enter your Telegram bot token (from @BotFather): ")
	token, _ := reader.ReadString('\n')
	token = strings.TrimSpace(token)

	if !tokenRegex.MatchString(token) {
		fmt.Println("Invalid token format. Expected: <numbers>:<alphanumeric string>")
		os.Exit(1)
	}

	// Write .env
	os.MkdirAll(filepath.Dir(config.EnvPath()), 0755)
	envContent := fmt.Sprintf(`BOT_TOKEN=%s
CHAT_ID=
TMUX_SESSION=claude
TMUX_TARGET_PANE=
NOTIFY_ON_STOP=true
NOTIFY_ON_IDLE=true
NOTIFY_ON_PERMISSION=true
IDLE_COOLDOWN=180
`, token)

	if err := os.WriteFile(config.EnvPath(), []byte(envContent), 0644); err != nil {
		fmt.Printf("Failed to write .env: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Created .env file.")

	// Install hooks
	if err := installHooks(); err != nil {
		fmt.Printf("Warning: could not install hooks: %v\n", err)
	} else {
		fmt.Println("Installed Claude Code hooks.")
	}

	fmt.Println()
	fmt.Println("Setup complete! Next steps:")
	fmt.Println("  1. Run: claude-tg")
	fmt.Println("  2. Send any message to your bot in Telegram")
	fmt.Println("  3. Your chat ID will be saved automatically")
}

func installHooks() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	settingsDir := filepath.Join(homeDir, ".claude")
	os.MkdirAll(settingsDir, 0755)

	settingsPath := filepath.Join(settingsDir, "settings.json")

	// Load existing settings
	var settings map[string]interface{}
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		settings = make(map[string]interface{})
	} else {
		if err := json.Unmarshal(data, &settings); err != nil {
			settings = make(map[string]interface{})
		}
	}

	// Ensure hooks object
	hooks, ok := settings["hooks"].(map[string]interface{})
	if !ok {
		hooks = make(map[string]interface{})
		settings["hooks"] = hooks
	}

	// Get executable path for hook command
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	hookCmd := exe + " notify"

	// Install Notification hook
	installHookType(hooks, "Notification", hookCmd, "idle_prompt|permission_prompt|elicitation_dialog")

	// Install Stop hook
	installHookType(hooks, "Stop", hookCmd, "")

	// Write settings
	out, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(settingsPath, append(out, '\n'), 0644)
}

func installHookType(hooks map[string]interface{}, hookType, command, matcher string) {
	// Check if already installed
	existing, ok := hooks[hookType].([]interface{})
	if ok {
		for _, entry := range existing {
			entryMap, ok := entry.(map[string]interface{})
			if !ok {
				continue
			}
			hooksList, ok := entryMap["hooks"].([]interface{})
			if !ok {
				continue
			}
			for _, h := range hooksList {
				hMap, ok := h.(map[string]interface{})
				if !ok {
					continue
				}
				if cmd, ok := hMap["command"].(string); ok && strings.Contains(cmd, "claude-tg") {
					// Update existing hook command
					hMap["command"] = command
					return
				}
			}
		}
	}

	// Add new hook entry
	hookEntry := map[string]interface{}{
		"hooks": []interface{}{
			map[string]interface{}{
				"type":    "command",
				"command": command,
				"timeout": 10,
			},
		},
	}
	if matcher != "" {
		hookEntry["matcher"] = matcher
	}

	if existing == nil {
		existing = []interface{}{}
	}
	hooks[hookType] = append(existing, hookEntry)
}
