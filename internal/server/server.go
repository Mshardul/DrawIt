// Package server is DrawIt's local HTTP server: it serves the embedded app and the file API for
// one opened folder. Every file access goes through os.Root, so paths and
// symlinks cannot lead out of the folder. Security checks are in security.go; the bind address is the caller's.
package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"time"
)

type fileInfo struct {
	Path     string    `json:"path"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}

type server struct {
	root *os.Root
}

// New returns the handler for the opened folder `root` and the app files in `assets`, guarded as
// `cfg` says.
func New(root *os.Root, assets fs.FS, cfg Config) http.Handler {
	s := &server{root: root}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/files", s.list)
	mux.HandleFunc("GET /api/file", s.read)
	mux.HandleFunc("PUT /api/file", s.write)
	mux.HandleFunc("GET /api/", http.NotFound)
	mux.Handle("GET /", http.FileServerFS(assets))
	return protect(cfg, mux)
}

// list returns every regular file in the folder, in path order. Symlinks are not listed.
func (s *server) list(w http.ResponseWriter, _ *http.Request) {
	files := []fileInfo{}
	err := fs.WalkDir(s.root.FS(), ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.Type().IsRegular() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		files = append(files, fileInfo{Path: p, Size: info.Size(), Modified: info.ModTime().UTC()})
		return nil
	})
	if err != nil {
		http.Error(w, "cannot list folder", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string][]fileInfo{"files": files})
}

// filePath returns the requested path, or false after answering 400 if it is not a file path
// inside the folder.
func filePath(w http.ResponseWriter, r *http.Request) (string, bool) {
	p := r.URL.Query().Get("path")
	if !filepath.IsLocal(p) || path.Clean(filepath.ToSlash(p)) == "." {
		http.Error(w, "path must be a file path inside the folder", http.StatusBadRequest)
		return "", false
	}
	return path.Clean(filepath.ToSlash(p)), true
}

func (s *server) read(w http.ResponseWriter, r *http.Request) {
	p, ok := filePath(w, r)
	if !ok {
		return
	}
	f, err := s.root.Open(p)
	if err != nil {
		openFailed(w, err)
		return
	}
	defer func() { _ = f.Close() }()
	info, err := f.Stat()
	if err != nil {
		http.Error(w, "cannot read file", http.StatusInternalServerError)
		return
	}
	if !info.Mode().IsRegular() {
		http.Error(w, "not a file", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	_, _ = io.Copy(w, f)
}

func (s *server) write(w http.ResponseWriter, r *http.Request) {
	p, ok := filePath(w, r)
	if !ok {
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "cannot read request body", http.StatusBadRequest)
		return
	}
	if info, err := s.root.Lstat(p); err == nil && info.IsDir() {
		http.Error(w, "path is a folder", http.StatusBadRequest)
		return
	}
	if dir := path.Dir(p); dir != "." {
		if err := s.root.MkdirAll(dir, 0o755); err != nil {
			openFailed(w, err)
			return
		}
	}
	if err := s.replace(p, body); err != nil {
		openFailed(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// replace writes data to a temporary file next to p and renames it over p, so readers see the
// old file or the new one, never a partial write.
func (s *server) replace(p string, data []byte) error {
	var suffix [6]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return err
	}
	tmp := path.Join(path.Dir(p), "."+path.Base(p)+".tmp-"+hex.EncodeToString(suffix[:]))
	f, err := s.root.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		err = s.root.Rename(tmp, p)
	}
	if err != nil {
		_ = s.root.Remove(tmp)
	}
	return err
}

// openFailed answers for an error from os.Root: a missing file is 404, anything else, such as a
// path that leaves the folder through a symlink, is refused.
func openFailed(w http.ResponseWriter, err error) {
	if errors.Is(err, fs.ErrNotExist) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	http.Error(w, "access refused", http.StatusForbidden)
}
