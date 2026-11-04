package server

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

const maxBrowseEntries = 500

type browseEntry struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type browseView struct {
	Path      string        `json:"path"`
	Entries   []browseEntry `json:"entries"`
	Truncated bool          `json:"truncated,omitempty"`
}

func (s *server) listBrowse(w http.ResponseWriter, r *http.Request) {
	home, err := s.homeDir()
	if err != nil {
		writeStatus(w, err)
		return
	}
	dir, err := browseDir(home, r.URL.Query().Get("path"))
	if err != nil {
		writeStatus(w, err)
		return
	}
	entries, truncated, err := browseEntries(home, dir)
	if err != nil {
		if errors.Is(err, fs.ErrPermission) {
			writeJSONValue(w, browseView{Path: dir, Entries: []browseEntry{}})
			return
		}
		http.Error(w, "cannot list folder", http.StatusInternalServerError)
		return
	}
	writeJSONValue(w, browseView{Path: dir, Entries: entries, Truncated: truncated})
}

type browseCreate struct {
	Path string `json:"path"`
	Name string `json:"name"`
}

func (s *server) createBrowse(w http.ResponseWriter, r *http.Request) {
	home, err := s.homeDir()
	if err != nil {
		writeStatus(w, err)
		return
	}
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
	var req browseCreate
	if err := json.Unmarshal(body, &req); err != nil || req.Path == "" {
		http.Error(w, "name a folder", http.StatusBadRequest)
		return
	}
	if !allowedName(req.Name, false) {
		http.Error(w, "name is not allowed", http.StatusBadRequest)
		return
	}
	dir, err := browseDir(home, req.Path)
	if err != nil {
		writeStatus(w, err)
		return
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		http.Error(w, "cannot create folder", http.StatusInternalServerError)
		return
	}
	if nameTaken(entries, req.Name, "") {
		http.Error(w, "name exists", http.StatusConflict)
		return
	}
	if err := os.Mkdir(filepath.Join(dir, req.Name), 0o755); err != nil {
		if errors.Is(err, fs.ErrExist) {
			http.Error(w, "name exists", http.StatusConflict)
			return
		}
		http.Error(w, "cannot create folder", http.StatusInternalServerError)
		return
	}
	writeJSONValue(w, map[string]string{"path": filepath.Join(dir, req.Name)})
}

func (s *server) homeDir() (string, error) {
	if s.ws.library == "" {
		return "", openError(http.StatusInternalServerError, "library is not set")
	}
	home, err := filepath.EvalSymlinks(filepath.Dir(s.ws.library))
	if err != nil {
		return "", openError(http.StatusInternalServerError, "cannot open the home directory")
	}
	return home, nil
}

func browseDir(home, p string) (string, error) {
	if p == "" {
		p = home
	}
	if !filepath.IsAbs(p) {
		return "", openError(http.StatusBadRequest, "folder must be an absolute path")
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", openError(http.StatusBadRequest, "path is not a folder")
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "", openError(http.StatusNotFound, "not found")
		}
		return "", openError(http.StatusForbidden, "access refused")
	}
	if !withinHome(home, resolved) {
		return "", openError(http.StatusForbidden, "path is outside the home directory")
	}
	info, err := os.Stat(resolved)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "", openError(http.StatusNotFound, "not found")
		}
		return "", openError(http.StatusForbidden, "access refused")
	}
	if !info.IsDir() {
		return "", openError(http.StatusBadRequest, "path is not a folder")
	}
	return resolved, nil
}

func withinHome(home, p string) bool {
	rel, err := filepath.Rel(home, p)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func browseEntries(home, dir string) ([]browseEntry, bool, error) {
	list, err := os.ReadDir(dir)
	if err != nil {
		return nil, false, err
	}
	entries := []browseEntry{}
	for _, entry := range list {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		kind, ok := browseKind(home, dir, entry)
		if !ok {
			continue
		}
		entries = append(entries, browseEntry{Name: entry.Name(), Type: kind})
	}
	slices.SortFunc(entries, func(a, b browseEntry) int {
		if a.Type != b.Type {
			if a.Type == "folder" {
				return -1
			}
			return 1
		}
		return strings.Compare(a.Name, b.Name)
	})
	truncated := len(entries) > maxBrowseEntries
	if truncated {
		entries = entries[:maxBrowseEntries]
	}
	return entries, truncated, nil
}

func browseKind(home, dir string, entry os.DirEntry) (string, bool) {
	name := entry.Name()
	if entry.Type()&os.ModeSymlink != 0 {
		resolved, err := filepath.EvalSymlinks(filepath.Join(dir, name))
		if err != nil || !withinHome(home, resolved) {
			return "", false
		}
		info, err := os.Stat(resolved)
		if err != nil {
			return "", false
		}
		if info.IsDir() {
			return "folder", true
		}
		if info.Mode().IsRegular() && strings.HasSuffix(name, diagramExt) {
			return "file", true
		}
		return "", false
	}
	info, err := entry.Info()
	if err != nil {
		return "", false
	}
	if info.IsDir() {
		return "folder", true
	}
	if info.Mode().IsRegular() && strings.HasSuffix(name, diagramExt) {
		return "file", true
	}
	return "", false
}
