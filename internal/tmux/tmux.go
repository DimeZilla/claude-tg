package tmux

import (
	"fmt"
	"os/exec"
	"time"
)

func SessionExists(name string) bool {
	cmd := exec.Command("tmux", "has-session", "-t", name)
	return cmd.Run() == nil
}

func SendKeys(sessionName, text, targetPane string) error {
	target := sessionName
	if targetPane != "" {
		target = targetPane
	}
	// Clear line first
	exec.Command("tmux", "send-keys", "-t", target, "C-u").Run()
	// Send text literally
	if err := exec.Command("tmux", "send-keys", "-t", target, "-l", "--", text).Run(); err != nil {
		return err
	}
	// Send Enter
	return exec.Command("tmux", "send-keys", "-t", target, "Enter").Run()
}

func CapturePane(sessionName string, lines int, targetPane string) (string, error) {
	target := sessionName
	if targetPane != "" {
		target = targetPane
	}
	out, err := exec.Command("tmux", "capture-pane", "-t", target, "-p", "-S", fmt.Sprintf("-%d", lines)).Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func SendInterrupt(sessionName, targetPane string) error {
	target := sessionName
	if targetPane != "" {
		target = targetPane
	}
	return exec.Command("tmux", "send-keys", "-t", target, "C-c").Run()
}

func SendEscape(sessionName, targetPane string) error {
	target := sessionName
	if targetPane != "" {
		target = targetPane
	}
	return exec.Command("tmux", "send-keys", "-t", target, "Escape").Run()
}

func SendArrowDown(sessionName string, count int, targetPane string) error {
	target := sessionName
	if targetPane != "" {
		target = targetPane
	}
	for i := 0; i < count; i++ {
		if err := exec.Command("tmux", "send-keys", "-t", target, "Down").Run(); err != nil {
			return err
		}
		time.Sleep(50 * time.Millisecond)
	}
	return nil
}

func SendEnter(sessionName, targetPane string) error {
	target := sessionName
	if targetPane != "" {
		target = targetPane
	}
	return exec.Command("tmux", "send-keys", "-t", target, "Enter").Run()
}

func RenameSession(oldName, newName string) error {
	return exec.Command("tmux", "rename-session", "-t", oldName, newName).Run()
}
