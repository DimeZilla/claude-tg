package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"claude-tg/internal/config"
)

func ensureLogsDir() string {
	dir := filepath.Join(config.ProjectRoot(), "logs")
	os.MkdirAll(dir, 0755)
	return dir
}

func appendLog(file, session, message string) {
	dir := ensureLogsDir()
	path := filepath.Join(dir, file)
	sess := session
	if sess == "" {
		sess = "-"
	}
	line := fmt.Sprintf("%s [%s] %s\n", time.Now().Format(time.RFC3339), sess, message)
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	f.WriteString(line)
}

func LogEvent(session, message string) {
	appendLog("events.log", session, message)
}

func LogError(session, message string) {
	appendLog("errors.log", session, message)
}
