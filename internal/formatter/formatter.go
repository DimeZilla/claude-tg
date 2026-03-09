package formatter

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	separatorRegex = regexp.MustCompile(`^[─━╌╍┄┅┈┉]{5,}`)
	bulletRegex    = regexp.MustCompile(`^\s*●`)
	promptRegex    = regexp.MustCompile(`^\s*❯`)
	longSepRegex   = regexp.MustCompile(`^[─━]{10,}`)
	optionRegex    = regexp.MustCompile(`(?:❯\s*)?(\d+)\.\s+(.+)`)
)

func EscapeHTML(text string) string {
	if text == "" {
		return ""
	}
	text = strings.ReplaceAll(text, "&", "&amp;")
	text = strings.ReplaceAll(text, "<", "&lt;")
	text = strings.ReplaceAll(text, ">", "&gt;")
	return text
}

type Option struct {
	Number int
	Label  string
}

func ExtractOptions(text string) []Option {
	var options []Option
	for _, line := range strings.Split(text, "\n") {
		matches := optionRegex.FindStringSubmatch(line)
		if matches != nil {
			num := 0
			fmt.Sscanf(matches[1], "%d", &num)
			options = append(options, Option{Number: num, Label: strings.TrimSpace(matches[2])})
		}
	}
	return options
}

func ExtractPermissionDialog(screen string) string {
	lines := strings.Split(screen, "\n")
	lastSep := -1
	for i := len(lines) - 1; i >= 0; i-- {
		if separatorRegex.MatchString(lines[i]) {
			lastSep = i
			break
		}
	}
	if lastSep >= 0 && lastSep < len(lines)-1 {
		content := strings.TrimSpace(strings.Join(lines[lastSep+1:], "\n"))
		if content != "" {
			return content
		}
	}
	// Fallback: last 15 non-empty lines
	var nonEmpty []string
	for i := len(lines) - 1; i >= 0 && len(nonEmpty) < 15; i-- {
		if strings.TrimSpace(lines[i]) != "" {
			nonEmpty = append([]string{lines[i]}, nonEmpty...)
		}
	}
	return strings.TrimSpace(strings.Join(nonEmpty, "\n"))
}

func ExtractLastMessage(screen string) string {
	lines := strings.Split(screen, "\n")
	lastBullet := -1
	for i := len(lines) - 1; i >= 0; i-- {
		if bulletRegex.MatchString(lines[i]) {
			lastBullet = i
			break
		}
	}
	if lastBullet >= 0 {
		var result []string
		for i := lastBullet; i < len(lines); i++ {
			if promptRegex.MatchString(lines[i]) || longSepRegex.MatchString(lines[i]) {
				break
			}
			result = append(result, lines[i])
		}
		return strings.TrimSpace(strings.Join(result, "\n"))
	}
	// Fallback: last 10 non-empty lines
	var nonEmpty []string
	for i := len(lines) - 1; i >= 0 && len(nonEmpty) < 10; i-- {
		if strings.TrimSpace(lines[i]) != "" {
			nonEmpty = append([]string{lines[i]}, nonEmpty...)
		}
	}
	return strings.TrimSpace(strings.Join(nonEmpty, "\n"))
}

func FormatNotification(notificationType, sessionName, title, message, screenContent string, showHint, isTranscript bool) string {
	var icon, header string
	switch notificationType {
	case "permission_prompt":
		icon = "🔐"
		header = "Permission needed"
	case "elicitation_dialog":
		icon = "❓"
		header = "Question for you"
	default:
		icon = "⏳"
		header = "Waiting for input"
	}

	var parts []string

	// Header
	if sessionName != "" {
		parts = append(parts, fmt.Sprintf("%s [%s] <b>%s</b>", icon, EscapeHTML(sessionName), header))
	} else {
		parts = append(parts, fmt.Sprintf("%s <b>%s</b>", icon, header))
	}

	// Title and message
	if title != "" {
		parts = append(parts, fmt.Sprintf("<b>%s</b>", EscapeHTML(title)))
	}
	if message != "" {
		parts = append(parts, EscapeHTML(message))
	}

	// Extract display text
	displayText := ""
	if screenContent != "" {
		if isTranscript {
			displayText = screenContent
		} else if notificationType == "permission_prompt" || notificationType == "elicitation_dialog" {
			displayText = ExtractPermissionDialog(screenContent)
		} else {
			displayText = ExtractLastMessage(screenContent)
		}
	}

	// Truncate
	if len(displayText) > 3200 {
		displayText = displayText[:3200] + "..."
	}

	if displayText != "" {
		parts = append(parts, fmt.Sprintf("<pre>%s</pre>", EscapeHTML(displayText)))
	}

	// Action hints
	options := ExtractOptions(displayText)
	if showHint {
		parts = append(parts, "<i>/stop to interrupt, /help for commands</i>")
	} else if len(options) > 0 {
		var optLines []string
		for _, opt := range options {
			optLines = append(optLines, fmt.Sprintf("/%d %s", opt.Number, EscapeHTML(opt.Label)))
		}
		optLines = append(optLines, "/escape to cancel")
		parts = append(parts, "<i>"+strings.Join(optLines, "\n")+"</i>")
	} else if notificationType == "permission_prompt" {
		parts = append(parts, "<i>/allow to approve, /deny to reject</i>")
	} else if notificationType == "elicitation_dialog" {
		parts = append(parts, "<i>Reply with your choice</i>")
	} else {
		parts = append(parts, "<i>Reply here to send input</i>")
	}

	return strings.Join(parts, "\n\n")
}
