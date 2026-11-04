package server

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const WorkspaceHeader = "X-Workspace-Id"

const (
	kindLibrary = "library"
	kindProject = "project"
	kindOpened  = "opened"
)

// File requests hold the read lock, so a switch waits for them before closing the previous root.
type workspace struct {
	mu      sync.RWMutex
	root    *os.Root
	id      string
	kind    string
	path    string
	library string
}

func (w *workspace) borrow(id string) (root *os.Root, release func(), stale bool) {
	w.mu.RLock()
	if id == "" || id != w.id {
		w.mu.RUnlock()
		return nil, nil, true
	}
	if w.root == nil {
		w.mu.RUnlock()
		return nil, nil, false
	}
	return w.root, w.mu.RUnlock, false
}

func (w *workspace) snapshot() (id, kind, path string) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.id, w.kind, w.path
}

func (w *workspace) open(root *os.Root, path, kind string) string {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.root != nil && w.root != root {
		_ = w.root.Close()
	}
	w.root = root
	w.path = path
	w.kind = kind
	w.id = newWorkspaceID()
	return w.id
}

func newWorkspaceID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func kindOf(folder, library string) string {
	if folder == "" {
		return ""
	}
	folder = resolvePath(folder)
	library = resolvePath(library)
	if library == "" {
		return kindOpened
	}
	if folder == library {
		return kindLibrary
	}
	rel, err := filepath.Rel(library, folder)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return kindOpened
	}
	return kindProject
}

func resolvePath(p string) string {
	if p == "" {
		return ""
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return filepath.Clean(p)
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return filepath.Clean(abs)
	}
	return filepath.Clean(resolved)
}
