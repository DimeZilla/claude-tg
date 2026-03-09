package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

type Client struct {
	Token  string
	client *http.Client
}

func NewClient(token string) *Client {
	return &Client{
		Token:  token,
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

type apiResponse struct {
	Ok          bool            `json:"ok"`
	Result      json.RawMessage `json:"result"`
	Description string          `json:"description"`
}

type Update struct {
	UpdateID int      `json:"update_id"`
	Message  *Message `json:"message"`
}

type Message struct {
	MessageID int         `json:"message_id"`
	Date      int         `json:"date"`
	Chat      Chat        `json:"chat"`
	Text      string      `json:"text"`
	Photo     []PhotoSize `json:"photo"`
	Caption   string      `json:"caption"`
}

type Chat struct {
	ID int64 `json:"id"`
}

type PhotoSize struct {
	FileID   string `json:"file_id"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	FileSize int    `json:"file_size"`
}

type File struct {
	FileID   string `json:"file_id"`
	FilePath string `json:"file_path"`
}

func (c *Client) apiURL(method string) string {
	return fmt.Sprintf("https://api.telegram.org/bot%s/%s", c.Token, method)
}

func (c *Client) call(method string, payload interface{}) (json.RawMessage, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	resp, err := c.client.Post(c.apiURL(method), "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var apiResp apiResponse
	if err := json.Unmarshal(data, &apiResp); err != nil {
		return nil, fmt.Errorf("invalid API response: %s", string(data))
	}
	if !apiResp.Ok {
		return nil, fmt.Errorf("telegram API error: %s", apiResp.Description)
	}
	return apiResp.Result, nil
}

type sendMessagePayload struct {
	ChatID                string `json:"chat_id"`
	Text                  string `json:"text"`
	ParseMode             string `json:"parse_mode,omitempty"`
	DisableWebPagePreview bool   `json:"disable_web_page_preview"`
}

func (c *Client) SendMessage(chatID, text, parseMode string) error {
	if parseMode == "" {
		parseMode = "HTML"
	}
	_, err := c.call("sendMessage", sendMessagePayload{
		ChatID:                chatID,
		Text:                  text,
		ParseMode:             parseMode,
		DisableWebPagePreview: true,
	})
	return err
}

func (c *Client) SendMessageWithRetry(chatID, text, parseMode string) error {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
		}
		lastErr = c.SendMessage(chatID, text, parseMode)
		if lastErr == nil {
			return nil
		}
	}
	return lastErr
}

type getUpdatesPayload struct {
	Offset  int `json:"offset"`
	Timeout int `json:"timeout"`
}

func (c *Client) GetUpdates(offset, timeout int) ([]Update, error) {
	result, err := c.call("getUpdates", getUpdatesPayload{
		Offset:  offset,
		Timeout: timeout,
	})
	if err != nil {
		return nil, err
	}
	var updates []Update
	if err := json.Unmarshal(result, &updates); err != nil {
		return nil, err
	}
	return updates, nil
}

func (c *Client) GetFile(fileID string) (*File, error) {
	result, err := c.call("getFile", map[string]string{"file_id": fileID})
	if err != nil {
		return nil, err
	}
	var file File
	if err := json.Unmarshal(result, &file); err != nil {
		return nil, err
	}
	return &file, nil
}

func (c *Client) DownloadFile(filePath, destDir string) (string, error) {
	url := fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", c.Token, filePath)
	resp, err := c.client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	os.MkdirAll(destDir, 0755)

	ext := filepath.Ext(filePath)
	destPath := filepath.Join(destDir, fmt.Sprintf("telegram-%d%s", time.Now().UnixMilli(), ext))
	f, err := os.Create(destPath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := io.Copy(f, resp.Body); err != nil {
		return "", err
	}
	return destPath, nil
}
