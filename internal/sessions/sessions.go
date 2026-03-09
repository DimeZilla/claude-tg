package sessions

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"claude-tg/internal/config"
	"claude-tg/internal/tmux"
)

type SessionInfo struct {
	Cwd       string `json:"cwd"`
	StartedAt string `json:"startedAt"`
}

type State struct {
	Active   string                 `json:"active"`
	Sessions map[string]SessionInfo `json:"sessions"`
}

func sessionsPath() string {
	return filepath.Join(config.ProjectRoot(), ".sessions.json")
}

func Load() *State {
	data, err := os.ReadFile(sessionsPath())
	if err != nil {
		return &State{Sessions: make(map[string]SessionInfo)}
	}
	var state State
	if err := json.Unmarshal(data, &state); err != nil {
		return &State{Sessions: make(map[string]SessionInfo)}
	}
	if state.Sessions == nil {
		state.Sessions = make(map[string]SessionInfo)
	}
	return &state
}

func Save(state *State) error {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(sessionsPath(), append(data, '\n'), 0644)
}

func Prune() *State {
	state := Load()
	changed := false
	for name := range state.Sessions {
		if !tmux.SessionExists(name) {
			delete(state.Sessions, name)
			changed = true
		}
	}
	if state.Active != "" {
		if _, exists := state.Sessions[state.Active]; !exists {
			state.Active = ""
			for name := range state.Sessions {
				state.Active = name
			}
			changed = true
		}
	}
	if changed {
		Save(state)
	}
	return state
}

func NextName() string {
	now := time.Now()
	name := fmt.Sprintf("claude-%s", now.Format("0102-1504"))
	state := Load()
	if _, exists := state.Sessions[name]; exists {
		name = fmt.Sprintf("claude-%s", now.Format("0102-150405"))
	}
	return name
}

func Register(name, cwd string) error {
	state := Load()
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	state.Sessions[name] = SessionInfo{
		Cwd:       cwd,
		StartedAt: time.Now().Format(time.RFC3339),
	}
	state.Active = name
	return Save(state)
}

func Unregister(name string) error {
	state := Load()
	delete(state.Sessions, name)
	if state.Active == name {
		state.Active = ""
		for n := range state.Sessions {
			state.Active = n
		}
	}
	return Save(state)
}

func SetActive(name string) error {
	state := Load()
	if _, exists := state.Sessions[name]; !exists {
		return fmt.Errorf("session %s not found", name)
	}
	state.Active = name
	return Save(state)
}

func GetActive() string {
	state := Prune()
	return state.Active
}

func List() *State {
	return Prune()
}

func Rename(oldName, newName string) error {
	state := Load()
	info, exists := state.Sessions[oldName]
	if !exists {
		return fmt.Errorf("session %s not found", oldName)
	}
	if _, exists := state.Sessions[newName]; exists {
		return fmt.Errorf("session %s already exists", newName)
	}
	delete(state.Sessions, oldName)
	state.Sessions[newName] = info
	if state.Active == oldName {
		state.Active = newName
	}
	return Save(state)
}

func FindByCwd(cwd string) string {
	state := Load()
	for name, info := range state.Sessions {
		if info.Cwd == cwd {
			return name
		}
	}
	return ""
}
