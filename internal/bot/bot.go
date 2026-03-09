package bot

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"claude-tg/internal/config"
	"claude-tg/internal/formatter"
	"claude-tg/internal/sessions"
	"claude-tg/internal/telegram"
	"claude-tg/internal/tmux"
)

var nameRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9-]*$`)
var optionRegex = regexp.MustCompile(`^/(\d+)$`)
var planPathRegex = regexp.MustCompile(`~/\.claude/plans/[^\s]+\.md`)

func Run() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Config error: %v", err)
	}

	client := telegram.NewClient(cfg.BotToken)
	botStartTime := time.Now().Unix()
	offset := 0

	log.Println("Bot started, polling for messages...")

	// Signal handling
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("Shutting down bot...")
		os.Exit(0)
	}()

	for {
		updates, err := client.GetUpdates(offset, 30)
		if err != nil {
			if strings.Contains(err.Error(), "409") {
				log.Fatal("Conflict: another bot instance is running")
			}
			log.Printf("Polling error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		for _, update := range updates {
			offset = update.UpdateID + 1
			if update.Message == nil {
				continue
			}

			msg := update.Message
			chatID := fmt.Sprintf("%d", msg.Chat.ID)

			// Ignore old messages
			if int64(msg.Date) < botStartTime {
				continue
			}

			// Chat ID registration
			if cfg.ChatID == "" {
				cfg.ChatID = chatID
				config.SaveChatID(chatID)
				client.SendMessage(chatID, fmt.Sprintf("Chat ID saved: <code>%s</code>\nYou're all set!", chatID), "HTML")
				log.Printf("Chat ID registered: %s", chatID)
				continue
			}

			// Authorization
			if chatID != cfg.ChatID {
				client.SendMessage(chatID, "Unauthorized.", "")
				continue
			}

			// Photo handling
			if len(msg.Photo) > 0 {
				handlePhoto(client, cfg, chatID, msg)
				continue
			}

			text := strings.TrimSpace(msg.Text)
			if text == "" {
				continue
			}

			// Command routing
			switch {
			case text == "/stop":
				handleStop(client, chatID)
			case text == "/allow":
				handleAllow(client, chatID)
			case text == "/1":
				handleAllow(client, chatID)
			case text == "/deny":
				handleDeny(client, chatID)
			case text == "/escape":
				handleEscape(client, chatID)
			case text == "/status" || text == "/sessions":
				handleStatus(client, chatID)
			case text == "/screen":
				handleScreen(client, chatID)
			case text == "/plan":
				handlePlan(client, chatID)
			case strings.HasPrefix(text, "/switch"):
				handleSwitch(client, chatID, text)
			case strings.HasPrefix(text, "/rename"):
				handleRename(client, chatID, text)
			case text == "/help" || text == "/start":
				handleHelp(client, chatID)
			case optionRegex.MatchString(text):
				handleSelectOption(client, chatID, text)
			default:
				handleInput(client, chatID, text)
			}
		}
	}
}

func handleInput(client *telegram.Client, chatID, text string) {
	active := sessions.GetActive()
	if active == "" {
		client.SendMessage(chatID, "No active session.", "")
		return
	}
	if !tmux.SessionExists(active) {
		client.SendMessage(chatID, fmt.Sprintf("Session <code>%s</code> not found in tmux.", formatter.EscapeHTML(active)), "HTML")
		return
	}
	if err := tmux.SendKeys(active, text, ""); err != nil {
		client.SendMessage(chatID, fmt.Sprintf("Error sending input: %v", err), "")
		return
	}
	client.SendMessage(chatID, fmt.Sprintf("Sent to <b>%s</b>", formatter.EscapeHTML(active)), "HTML")
}

func handlePhoto(client *telegram.Client, cfg *config.Config, chatID string, msg *telegram.Message) {
	active := sessions.GetActive()
	if active == "" {
		client.SendMessage(chatID, "No active session.", "")
		return
	}
	if !tmux.SessionExists(active) {
		client.SendMessage(chatID, "Session not found in tmux.", "")
		return
	}

	// Get largest photo
	photo := msg.Photo[len(msg.Photo)-1]
	file, err := client.GetFile(photo.FileID)
	if err != nil {
		client.SendMessage(chatID, fmt.Sprintf("Failed to get file: %v", err), "")
		return
	}

	uploadDir := filepath.Join(os.Getenv("HOME"), ".claude", "claude-tg", "uploads")
	localPath, err := client.DownloadFile(file.FilePath, uploadDir)
	if err != nil {
		client.SendMessage(chatID, fmt.Sprintf("Failed to download: %v", err), "")
		return
	}

	var text string
	if msg.Caption != "" {
		text = fmt.Sprintf("%s (see image: %s)", msg.Caption, localPath)
	} else {
		text = fmt.Sprintf("Please look at this image: %s", localPath)
	}

	if err := tmux.SendKeys(active, text, ""); err != nil {
		client.SendMessage(chatID, fmt.Sprintf("Error sending: %v", err), "")
		return
	}
	client.SendMessage(chatID, fmt.Sprintf("Photo sent to <b>%s</b>", formatter.EscapeHTML(active)), "HTML")
}

func handleStatus(client *telegram.Client, chatID string) {
	state := sessions.List()
	if len(state.Sessions) == 0 {
		client.SendMessage(chatID, "No active sessions.", "")
		return
	}

	var lines []string
	lines = append(lines, "<b>Sessions:</b>")
	for name := range state.Sessions {
		alive := tmux.SessionExists(name)
		dot := "🔴"
		if alive {
			dot = "🟢"
		}
		if name == state.Active {
			lines = append(lines, fmt.Sprintf("%s <code>%s</code> ◀ active", dot, formatter.EscapeHTML(name)))
		} else {
			lines = append(lines, fmt.Sprintf("%s /switch %s", dot, formatter.EscapeHTML(name)))
		}
	}
	client.SendMessage(chatID, strings.Join(lines, "\n"), "HTML")
}

func handleSwitch(client *telegram.Client, chatID, text string) {
	parts := strings.Fields(text)
	if len(parts) < 2 {
		client.SendMessage(chatID, "Usage: /switch &lt;session-name&gt;", "HTML")
		return
	}
	target := parts[1]
	if err := sessions.SetActive(target); err != nil {
		client.SendMessage(chatID, fmt.Sprintf("Error: %v", err), "")
		return
	}
	client.SendMessage(chatID, fmt.Sprintf("Switched to <b>%s</b>", formatter.EscapeHTML(target)), "HTML")
}

func handleScreen(client *telegram.Client, chatID string) {
	active := sessions.GetActive()
	if active == "" {
		client.SendMessage(chatID, "No active session.", "")
		return
	}
	content, err := tmux.CapturePane(active, 40, "")
	if err != nil {
		client.SendMessage(chatID, fmt.Sprintf("Error: %v", err), "")
		return
	}
	if len(content) > 3800 {
		content = content[:3800] + "..."
	}
	client.SendMessage(chatID, fmt.Sprintf("<pre>%s</pre>", formatter.EscapeHTML(content)), "HTML")
}

func handlePlan(client *telegram.Client, chatID string) {
	active := sessions.GetActive()
	if active == "" {
		client.SendMessage(chatID, "No active session.", "")
		return
	}
	content, err := tmux.CapturePane(active, 50, "")
	if err != nil {
		client.SendMessage(chatID, "Could not capture screen.", "")
		return
	}
	match := planPathRegex.FindString(content)
	if match == "" {
		client.SendMessage(chatID, "No plan file found in terminal output.", "")
		return
	}
	planPath := strings.Replace(match, "~", os.Getenv("HOME"), 1)
	data, err := os.ReadFile(planPath)
	if err != nil {
		client.SendMessage(chatID, fmt.Sprintf("Could not read plan: %v", err), "")
		return
	}
	sendLongMessage(client, chatID, "Plan", string(data))
}

func sendLongMessage(client *telegram.Client, chatID, title, content string) {
	escaped := formatter.EscapeHTML(content)
	full := fmt.Sprintf("<b>%s</b>\n\n<pre>%s</pre>", title, escaped)
	if len(full) <= 4096 {
		client.SendMessage(chatID, full, "HTML")
		return
	}

	// Split into chunks
	lines := strings.Split(escaped, "\n")
	chunk := fmt.Sprintf("<b>%s</b>\n\n<pre>", title)
	first := true
	for _, line := range lines {
		if len(chunk)+len(line)+10 > 3800 {
			chunk += "</pre>"
			client.SendMessage(chatID, chunk, "HTML")
			chunk = "<pre>"
			first = false
		}
		if first && len(chunk) > len(fmt.Sprintf("<b>%s</b>\n\n<pre>", title)) {
			chunk += "\n"
		}
		chunk += line + "\n"
	}
	if strings.TrimSpace(strings.TrimPrefix(chunk, "<pre>")) != "" {
		chunk += "</pre>"
		client.SendMessage(chatID, chunk, "HTML")
	}
}

func handleRename(client *telegram.Client, chatID, text string) {
	parts := strings.Fields(text)
	if len(parts) < 2 {
		client.SendMessage(chatID, "Usage: /rename &lt;new-name&gt;", "HTML")
		return
	}
	newName := parts[1]
	if !nameRegex.MatchString(newName) {
		client.SendMessage(chatID, "Invalid name. Use alphanumeric characters and hyphens.", "")
		return
	}
	active := sessions.GetActive()
	if active == "" {
		client.SendMessage(chatID, "No active session.", "")
		return
	}
	if err := tmux.RenameSession(active, newName); err != nil {
		client.SendMessage(chatID, fmt.Sprintf("tmux rename failed: %v", err), "")
		return
	}
	if err := sessions.Rename(active, newName); err != nil {
		client.SendMessage(chatID, fmt.Sprintf("Session rename failed: %v", err), "")
		return
	}
	client.SendMessage(chatID, fmt.Sprintf("Renamed to <b>%s</b>", formatter.EscapeHTML(newName)), "HTML")
}

func handleStop(client *telegram.Client, chatID string) {
	active := sessions.GetActive()
	if active == "" {
		client.SendMessage(chatID, "No active session.", "")
		return
	}
	tmux.SendInterrupt(active, "")
	client.SendMessage(chatID, fmt.Sprintf("Sent Ctrl+C to <b>%s</b>", formatter.EscapeHTML(active)), "HTML")
}

func handleAllow(client *telegram.Client, chatID string) {
	active := sessions.GetActive()
	if active == "" {
		client.SendMessage(chatID, "No active session.", "")
		return
	}
	tmux.SendEnter(active, "")
	client.SendMessage(chatID, "Approved ✓", "")
}

func handleDeny(client *telegram.Client, chatID string) {
	active := sessions.GetActive()
	if active == "" {
		client.SendMessage(chatID, "No active session.", "")
		return
	}
	tmux.SendEscape(active, "")
	client.SendMessage(chatID, "Denied ✗", "")
}

func handleSelectOption(client *telegram.Client, chatID, text string) {
	matches := optionRegex.FindStringSubmatch(text)
	if matches == nil {
		return
	}
	num, _ := strconv.Atoi(matches[1])
	active := sessions.GetActive()
	if active == "" {
		client.SendMessage(chatID, "No active session.", "")
		return
	}
	if num == 1 {
		handleAllow(client, chatID)
		return
	}
	tmux.SendArrowDown(active, num-1, "")
	time.Sleep(100 * time.Millisecond)
	tmux.SendEnter(active, "")
	client.SendMessage(chatID, fmt.Sprintf("Selected option %d ✓", num), "")
}

func handleEscape(client *telegram.Client, chatID string) {
	active := sessions.GetActive()
	if active == "" {
		client.SendMessage(chatID, "No active session.", "")
		return
	}
	tmux.SendEscape(active, "")
	client.SendMessage(chatID, "Sent Escape", "")
}

func handleHelp(client *telegram.Client, chatID string) {
	help := `<b>Claude TG Commands</b>

<b>Input</b>
Just type — sends text to active session
Send a photo — downloads and passes path to Claude

<b>Responses</b>
/allow — approve permission prompt
/deny — reject permission prompt
/1 /2 /3 — select numbered option
/escape — cancel/dismiss dialog
/stop — send Ctrl+C

<b>Session</b>
/status — list sessions
/switch &lt;name&gt; — switch active session
/rename &lt;name&gt; — rename active session
/screen — capture terminal
/plan — view current plan

/help — this message`
	client.SendMessage(chatID, help, "HTML")
}
