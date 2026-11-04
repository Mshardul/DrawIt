package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sync"
	"time"
)

const SessionHeader = "X-Session-Id"

const sessionIdle = 5 * time.Second

type browserSession struct {
	mu      sync.Mutex
	id      string
	touched time.Time
	now     func() time.Time
}

func newBrowserSession(now func() time.Time) *browserSession {
	if now == nil {
		now = time.Now
	}
	return &browserSession{now: now}
}

func (s *browserSession) claim(presented string, takeover bool) (id string, elsewhere bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if takeover || !s.live() {
		s.id = newWorkspaceID()
		s.touched = s.now()
		return s.id, false
	}
	if presented != "" && presented == s.id {
		s.touched = s.now()
		return s.id, false
	}
	return "", true
}

func (s *browserSession) allow(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id == "" || id != s.id || !s.live() {
		return false
	}
	s.touched = s.now()
	return true
}

func (s *browserSession) live() bool {
	return s.id != "" && s.now().Sub(s.touched) < sessionIdle
}

type claimBody struct {
	Takeover bool `json:"takeover"`
}

func (s *server) claimSession(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<16))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		http.Error(w, "request is larger than the limit", http.StatusRequestEntityTooLarge)
		return
	}
	if err != nil {
		http.Error(w, "cannot read request body", http.StatusBadRequest)
		return
	}
	var req claimBody
	if len(body) > 0 {
		if err := json.Unmarshal(body, &req); err != nil {
			http.Error(w, "claim must be empty or an object", http.StatusBadRequest)
			return
		}
	}
	id, elsewhere := s.hold.claim(r.Header.Get(SessionHeader), req.Takeover)
	if elsewhere {
		http.Error(w, "DrawIt is open elsewhere", http.StatusConflict)
		return
	}
	writeJSONValue(w, struct {
		ID string `json:"id"`
	}{ID: id})
}
