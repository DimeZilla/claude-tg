package config

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var tokenRegex = regexp.MustCompile(`^\d+:[A-Za-z0-9_-]{35,}$`)

type Config struct {
	BotToken        string
	ChatID          string
	TmuxSession     string
	TmuxTargetPane  string
	NotifyOnStop    bool
	NotifyOnIdle    bool
	NotifyOnPermission bool
	IdleCooldown    int // seconds
}

func ProjectRoot() string {
	if root := os.Getenv("CLAUDE_TG_ROOT"); root != "" {
		return root
	}
	home, err := os.UserHomeDir()
	if err != nil {
		dir, _ := os.Getwd()
		return dir
	}
	return filepath.Join(home, ".config", "claude-tg")
}

func EnvPath() string {
	return filepath.Join(ProjectRoot(), ".env")
}

func parseDotEnv(path string) (map[string]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	result := make(map[string]string)
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			result[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}
	}
	return result, nil
}

func parseBool(val string, defaultVal bool) bool {
	if val == "" {
		return defaultVal
	}
	b, err := strconv.ParseBool(val)
	if err != nil {
		return defaultVal
	}
	return b
}

func LoadConfig() (*Config, error) {
	env, err := parseDotEnv(EnvPath())
	if err != nil {
		return nil, fmt.Errorf("failed to load .env: %w", err)
	}

	token := env["BOT_TOKEN"]
	if token == "" || !tokenRegex.MatchString(token) {
		return nil, fmt.Errorf("BOT_TOKEN missing or invalid in .env")
	}

	tmuxSession := env["TMUX_SESSION"]
	if tmuxSession == "" {
		tmuxSession = "claude"
	}

	idleCooldown := 180
	if val := env["IDLE_COOLDOWN"]; val != "" {
		if n, err := strconv.Atoi(val); err == nil {
			idleCooldown = n
		}
	}

	return &Config{
		BotToken:        token,
		ChatID:          env["CHAT_ID"],
		TmuxSession:     tmuxSession,
		TmuxTargetPane:  env["TMUX_TARGET_PANE"],
		NotifyOnStop:    parseBool(env["NOTIFY_ON_STOP"], true),
		NotifyOnIdle:    parseBool(env["NOTIFY_ON_IDLE"], true),
		NotifyOnPermission: parseBool(env["NOTIFY_ON_PERMISSION"], true),
		IdleCooldown:    idleCooldown,
	}, nil
}

func SaveChatID(chatID string) error {
	os.MkdirAll(ProjectRoot(), 0755)
	envPath := EnvPath()
	data, err := os.ReadFile(envPath)
	if err != nil {
		return os.WriteFile(envPath, []byte("CHAT_ID="+chatID+"\n"), 0644)
	}

	lines := strings.Split(string(data), "\n")
	found := false
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "CHAT_ID=") {
			lines[i] = "CHAT_ID=" + chatID
			found = true
			break
		}
	}
	if !found {
		lines = append(lines, "CHAT_ID="+chatID)
	}
	return os.WriteFile(envPath, []byte(strings.Join(lines, "\n")), 0644)
}
