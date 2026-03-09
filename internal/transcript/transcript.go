package transcript

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
)

var questionLineRegex = regexp.MustCompile(`(?:^\?($|\s)|^\d+\.)`)

type transcriptEntry struct {
	Type    string          `json:"type"`
	Message json.RawMessage `json:"message"`
}

type assistantMessage struct {
	Content []contentBlock `json:"content"`
}

type contentBlock struct {
	Type  string          `json:"type"`
	Text  string          `json:"text"`
	Name  string          `json:"name"`
	Input json.RawMessage `json:"input"`
}

type askUserInput struct {
	Questions []questionItem `json:"questions"`
}

type questionItem struct {
	Question string       `json:"question"`
	Options  []optionItem `json:"options"`
}

type optionItem struct {
	Label string `json:"label"`
}

type QuestionMeta struct {
	OptionCount int
}

func GetLastAssistantMessage(transcriptPath string) string {
	if transcriptPath == "" {
		return ""
	}
	data, err := os.ReadFile(transcriptPath)
	if err != nil {
		return ""
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		var entry transcriptEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		if entry.Type != "assistant" {
			continue
		}
		var msg assistantMessage
		if err := json.Unmarshal(entry.Message, &msg); err != nil {
			continue
		}

		var texts []string
		hasQuestion := false
		for _, block := range msg.Content {
			if block.Type == "text" && block.Text != "" {
				texts = append(texts, block.Text)
			}
			if block.Type == "tool_use" && block.Name == "AskUserQuestion" {
				var input askUserInput
				if err := json.Unmarshal(block.Input, &input); err == nil {
					for _, q := range input.Questions {
						if q.Question != "" {
							texts = append(texts, q.Question)
						}
						for idx, opt := range q.Options {
							texts = append(texts, fmt.Sprintf("%d. %s", idx+1, opt.Label))
						}
						if len(q.Options) > 0 {
							hasQuestion = true
						}
					}
				}
			}
		}

		if len(texts) == 0 {
			return ""
		}

		result := strings.Join(texts, "\n")
		if hasQuestion {
			resultLines := strings.Split(result, "\n")
			for i, line := range resultLines {
				if questionLineRegex.MatchString(line) {
					return strings.Join(resultLines[i:], "\n")
				}
			}
		}
		return result
	}
	return ""
}

func GetLastQuestionMeta(transcriptPath string) *QuestionMeta {
	if transcriptPath == "" {
		return nil
	}
	data, err := os.ReadFile(transcriptPath)
	if err != nil {
		return nil
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		var entry transcriptEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		if entry.Type != "assistant" {
			continue
		}
		var msg assistantMessage
		if err := json.Unmarshal(entry.Message, &msg); err != nil {
			continue
		}

		for _, block := range msg.Content {
			if block.Type == "tool_use" && block.Name == "AskUserQuestion" {
				var input askUserInput
				if err := json.Unmarshal(block.Input, &input); err == nil {
					for _, q := range input.Questions {
						if len(q.Options) > 0 {
							return &QuestionMeta{OptionCount: len(q.Options)}
						}
					}
				}
			}
		}
		return nil
	}
	return nil
}
