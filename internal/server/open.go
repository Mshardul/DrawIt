package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

type workspaceView struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	Path string `json:"path"`
}

type openBody struct {
	Library *bool  `json:"library"`
	Project string `json:"project"`
	Folder  string `json:"folder"`
	File    string `json:"file"`
}

func (b openBody) targets() int {
	n := 0
	if b.Library != nil && *b.Library {
		n++
	}
	if b.Project != "" {
		n++
	}
	if b.Folder != "" {
		n++
	}
	if b.File != "" {
		n++
	}
	return n
}

type statusError struct {
	code int
	text string
}

func (e *statusError) Error() string { return e.text }

func openError(code int, text string) error { return &statusError{code: code, text: text} }

func (s *server) currentWorkspace(w http.ResponseWriter, _ *http.Request) {
	id, kind, path := s.ws.snapshot()
	writeJSONValue(w, workspaceView{ID: id, Kind: kind, Path: path})
}

func (s *server) openWorkspace(w http.ResponseWriter, r *http.Request) {
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
	var req openBody
	if err := json.Unmarshal(body, &req); err != nil || req.targets() != 1 {
		http.Error(w, "name one folder to open", http.StatusBadRequest)
		return
	}
	dir, err := s.resolveOpen(req)
	if err != nil {
		writeStatus(w, err)
		return
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "access refused", http.StatusForbidden)
		return
	}
	info, err := root.Stat(".")
	if err != nil || !info.IsDir() {
		_ = root.Close()
		http.Error(w, "path is not a folder", http.StatusBadRequest)
		return
	}
	kind := kindOf(dir, s.ws.library)
	id := s.ws.open(root, dir, kind)
	writeJSONValue(w, workspaceView{ID: id, Kind: kind, Path: dir})
}

func (s *server) resolveOpen(req openBody) (string, error) {
	switch {
	case req.Library != nil && *req.Library:
		if s.ws.library == "" {
			return "", openError(http.StatusInternalServerError, "library is not set")
		}
		if err := os.MkdirAll(s.ws.library, 0o755); err != nil {
			return "", openError(http.StatusInternalServerError, "cannot create the library")
		}
		return directory(s.ws.library)
	case req.Project != "":
		if s.ws.library == "" {
			return "", openError(http.StatusInternalServerError, "library is not set")
		}
		if !filepath.IsLocal(req.Project) {
			return "", openError(http.StatusBadRequest, "project name must be a single folder name")
		}
		return directory(filepath.Join(s.ws.library, req.Project))
	case req.Folder != "":
		if !filepath.IsAbs(req.Folder) {
			return "", openError(http.StatusBadRequest, "folder must be an absolute path")
		}
		return directory(req.Folder)
	default:
		if !filepath.IsAbs(req.File) {
			return "", openError(http.StatusBadRequest, "file must be an absolute path")
		}
		info, err := os.Stat(req.File)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return "", openError(http.StatusNotFound, "not found")
			}
			return "", openError(http.StatusForbidden, "access refused")
		}
		if info.IsDir() || !info.Mode().IsRegular() {
			return "", openError(http.StatusBadRequest, "path is not a file")
		}
		return directory(filepath.Dir(req.File))
	}
}

func directory(p string) (string, error) {
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", openError(http.StatusBadRequest, "path is not a folder")
	}
	info, err := os.Stat(abs)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", openError(http.StatusNotFound, "not found")
		}
		return "", openError(http.StatusForbidden, "access refused")
	}
	if !info.IsDir() {
		return "", openError(http.StatusBadRequest, "path is not a folder")
	}
	return abs, nil
}

func writeJSONValue(w http.ResponseWriter, v any) {
	body, err := json.Marshal(v)
	if err != nil {
		http.Error(w, "cannot write response", http.StatusInternalServerError)
		return
	}
	writeJSON(w, body)
}

func writeStatus(w http.ResponseWriter, err error) {
	var status *statusError
	if errors.As(err, &status) {
		http.Error(w, status.text, status.code)
		return
	}
	http.Error(w, "cannot open folder", http.StatusInternalServerError)
}
