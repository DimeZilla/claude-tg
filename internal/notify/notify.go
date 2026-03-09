package notify

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	"claude-tg/internal/config"
	"claude-tg/internal/formatter"
	"claude-tg/internal/sessions"
	"claude-tg/internal/telegram"
	"claude-tg/internal/tmux"
	"claude-tg/internal/transcript"
)

var typingRegex = regexp.MustCompile(`❯\s?(.+)`)

type HookData struct {
	EventName        string `json:"hook_event_name"`
	NotificationType string `json:"notification_type"`
	Message          string `json:"message"`
	Title            string `json:"title"`
	Cwd              string `json:"cwd"`
	TranscriptPath   string `json:"transcript_path"`
}

type NotifyLog struct {
	LastIdle      int64   `json:"lastIdle"`
	LastPermission int64  `json:"lastPermission"`
	Timestamps    []int64 `json:"timestamps"`
}

func logPath() string {
	return filepath.Join(config.ProjectRoot(), ".notify-log.json")
}

func loadLog() *NotifyLog {
	data, err := os.ReadFile(logPath())
	if err != nil {
		return &NotifyLog{}
	}
	var log NotifyLog
	if err := json.Unmarshal(data, &log); err != nil {
		return &NotifyLog{}
	}
	return &log
}

func saveLog(log *NotifyLog) {
	data, _ := json.Marshal(log)
	os.WriteFile(logPath(), data, 0644)
}

func cooldownExpired(cfg *config.Config, key string) bool {
	log := loadLog()
	cooldownMs := int64(cfg.IdleCooldown) * 1000
	now := time.Now().UnixMilli()
	var last int64
	if key == "lastIdle" {
		last = log.LastIdle
	} else {
		last = log.LastPermission
	}
	return now-last >= cooldownMs
}

func shouldShowHint() bool {
	nlog := loadLog()
	now := time.Now().UnixMilli()
	window := int64(60000) // 60 seconds

	// Clean old timestamps
	var recent []int64
	for _, ts := range nlog.Timestamps {
		if now-ts < window {
			recent = append(recent, ts)
		}
	}
	recent = append(recent, now)
	nlog.Timestamps = recent
	saveLog(nlog)

	return len(recent) >= 3
}

func isUserTyping(cwd string) bool {
	sessionName := sessions.FindByCwd(cwd)
	if sessionName == "" {
		return false
	}
	content, err := tmux.CapturePane(sessionName, 1, "")
	if err != nil {
		return false
	}
	matches := typingRegex.FindStringSubmatch(content)
	if matches != nil && len(matches) > 1 {
		return len(matches[1]) > 0
	}
	return false
}

func isBotRunning() bool {
	pidPath := filepath.Join(config.ProjectRoot(), ".bot.pid")
	data, err := os.ReadFile(pidPath)
	if err != nil {
		return false
	}
	var pid int
	if _, err := fmt.Sscanf(strings.TrimSpace(string(data)), "%d", &pid); err != nil {
		return false
	}
	return syscall.Kill(pid, 0) == nil
}

func Run() {
	// Always exit 0 to never block Claude
	defer func() {
		if r := recover(); r != nil {
			debugLog("panic: %v", r)
			os.Exit(0)
		}
	}()

	if err := run(); err != nil {
		debugLog("notify error: %v", err)
		os.Exit(0)
	}
	os.Exit(0)
}

func debugLog(format string, args ...interface{}) {
	f, err := os.OpenFile(filepath.Join(config.ProjectRoot(), "notify-debug.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s %s\n", time.Now().Format(time.RFC3339), fmt.Sprintf(format, args...))
}

func run() error {
	// Read stdin with timeout
	stdinCh := make(chan []byte, 1)
	go func() {
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			stdinCh <- nil
			return
		}
		stdinCh <- data
	}()

	var stdinData []byte
	select {
	case stdinData = <-stdinCh:
	case <-time.After(5 * time.Second):
		return fmt.Errorf("stdin timeout")
	}

	if len(stdinData) == 0 {
		return fmt.Errorf("empty stdin")
	}

	var hookData HookData
	if err := json.Unmarshal(stdinData, &hookData); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		return err
	}

	if cfg.ChatID == "" {
		return fmt.Errorf("no chat ID configured")
	}

	if !isBotRunning() {
		return fmt.Errorf("bot not running")
	}

	// Only process Notification events
	if hookData.EventName != "Notification" {
		return nil
	}

	// Check notification type settings
	switch hookData.NotificationType {
	case "idle_prompt":
		if !cfg.NotifyOnIdle {
			return nil
		}
		if !cooldownExpired(cfg, "lastIdle") {
			return nil
		}
		if isUserTyping(hookData.Cwd) {
			return nil
		}
	case "permission_prompt", "elicitation_dialog":
		if !cfg.NotifyOnPermission {
			return nil
		}
		// No cooldown for permission prompts — each one requires user action
	default:
		return nil
	}

	// Find session and set active
	sessionName := sessions.FindByCwd(hookData.Cwd)
	if sessionName != "" {
		sessions.SetActive(sessionName)
	}

	// Capture content
	var screenContent string
	isTranscript := false
	if hookData.NotificationType == "permission_prompt" || hookData.NotificationType == "elicitation_dialog" {
		if sessionName != "" {
			screenContent, _ = tmux.CapturePane(sessionName, 200, "")
		}
	} else {
		// Idle: prefer transcript
		if hookData.TranscriptPath != "" {
			content := transcript.GetLastAssistantMessage(hookData.TranscriptPath)
			if content != "" {
				screenContent = content
				isTranscript = true
			}
		}
		if screenContent == "" && sessionName != "" {
			screenContent, _ = tmux.CapturePane(sessionName, 50, "")
		}
	}

	showHint := shouldShowHint()

	message := formatter.FormatNotification(
		hookData.NotificationType,
		sessionName,
		hookData.Title,
		hookData.Message,
		screenContent,
		showHint,
		isTranscript,
	)

	client := telegram.NewClient(cfg.BotToken)
	client.SendMessageWithRetry(cfg.ChatID, message, "HTML")

	// Update throttle log
	nlog := loadLog()
	now := time.Now().UnixMilli()
	if hookData.NotificationType == "idle_prompt" {
		nlog.LastIdle = now
	} else {
		nlog.LastPermission = now
	}
	saveLog(nlog)

	return nil
}
