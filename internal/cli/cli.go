package cli

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"

	"claude-tg/internal/config"
	"claude-tg/internal/sessions"
	"claude-tg/internal/tmux"
)

var nameRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9-]*$`)

func Run(args []string) {
	// Check .env exists
	if _, err := os.Stat(config.EnvPath()); os.IsNotExist(err) {
		fmt.Println("No .env file found. Run 'claude-tg setup' first.")
		os.Exit(1)
	}

	// Check dependencies
	if _, err := exec.LookPath("tmux"); err != nil {
		fmt.Println("tmux is required but not found. Install it first.")
		os.Exit(1)
	}
	if _, err := exec.LookPath("claude"); err != nil {
		fmt.Println("claude CLI is required but not found. Install it first.")
		os.Exit(1)
	}

	// Parse arguments
	var customName string
	var claudeArgs []string
	for i := 0; i < len(args); i++ {
		if args[i] == "--name" && i+1 < len(args) {
			customName = args[i+1]
			i++
		} else {
			claudeArgs = append(claudeArgs, args[i])
		}
	}

	// Validate custom name
	if customName != "" {
		if !nameRegex.MatchString(customName) {
			fmt.Println("Invalid session name. Use alphanumeric characters and hyphens, starting with alphanumeric.")
			os.Exit(1)
		}
		state := sessions.Load()
		if _, exists := state.Sessions[customName]; exists {
			fmt.Printf("Session '%s' already exists.\n", customName)
			os.Exit(1)
		}
	}

	// Start bot
	startBot()

	// Generate session name
	sessionName := customName
	if sessionName == "" {
		sessionName = sessions.NextName()
	}

	// Register session
	cwd, _ := os.Getwd()
	sessions.Register(sessionName, cwd)

	// Build claude command
	claudeCmd := "claude"
	if len(claudeArgs) > 0 {
		claudeCmd = "claude " + strings.Join(claudeArgs, " ")
	}

	fmt.Printf("Starting Claude Code in session: %s\n", sessionName)

	// Launch tmux session and attach
	cmd := exec.Command("tmux", "new-session", "-s", sessionName, claudeCmd)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Run()

	// Cleanup after tmux exits
	sessions.Unregister(sessionName)
	stopBotIfNoSessions()
}

func startBot() {
	pidPath := filepath.Join(config.ProjectRoot(), ".bot.pid")

	// Check if already running
	if data, err := os.ReadFile(pidPath); err == nil {
		var pid int
		if _, err := fmt.Sscanf(strings.TrimSpace(string(data)), "%d", &pid); err == nil {
			if syscall.Kill(pid, 0) == nil {
				return // Already running
			}
		}
	}

	// Create logs directory
	logsDir := filepath.Join(config.ProjectRoot(), "logs")
	os.MkdirAll(logsDir, 0755)

	// Open log file
	logFile, err := os.OpenFile(
		filepath.Join(logsDir, "bot.log"),
		os.O_APPEND|os.O_CREATE|os.O_WRONLY,
		0644,
	)
	if err != nil {
		log.Printf("Warning: could not open bot.log: %v", err)
	}

	// Spawn bot process
	exe, _ := os.Executable()
	cmd := exec.Command(exe, "bot")
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	if err := cmd.Start(); err != nil {
		log.Fatalf("Failed to start bot: %v", err)
	}

	if logFile != nil {
		logFile.Close()
	}

	// Write PID
	os.WriteFile(pidPath, []byte(strconv.Itoa(cmd.Process.Pid)), 0644)
	fmt.Printf("Bot started (PID %d)\n", cmd.Process.Pid)
}

func stopBotIfNoSessions() {
	state := sessions.Prune()
	if len(state.Sessions) > 0 {
		return
	}

	pidPath := filepath.Join(config.ProjectRoot(), ".bot.pid")
	data, err := os.ReadFile(pidPath)
	if err != nil {
		return
	}

	var pid int
	if _, err := fmt.Sscanf(strings.TrimSpace(string(data)), "%d", &pid); err != nil {
		return
	}

	process, err := os.FindProcess(pid)
	if err == nil {
		process.Signal(syscall.SIGTERM)
	}

	os.Remove(pidPath)
	fmt.Println("Bot stopped (no remaining sessions).")
}

// tmux is imported for future use but currently sessions.Prune handles checks
var _ = tmux.SessionExists
