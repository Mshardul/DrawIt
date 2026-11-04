package server

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"time"

	"github.com/Mshardul/DrawIt/internal/prefs"
)

const MaxFileBytes = 32 << 20

type fileInfo struct {
	Path     string    `json:"path"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}

type server struct {
	ws    workspace
	prefs *prefs.Store
	hold  *browserSession
	trash func(string) error
}

func New(root *os.Root, folder, library string, assets fs.FS, store *prefs.Store, cfg Config) http.Handler {
	kind := ""
	if root != nil {
		kind = kindOf(folder, library)
	}
	s := &server{
		ws:    workspace{root: root, id: newWorkspaceID(), path: folder, kind: kind, library: library},
		prefs: store,
		hold:  newBrowserSession(cfg.Now),
		trash: cfg.Trash,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/session", s.claimSession)
	mux.HandleFunc("GET /api/files", s.list)
	mux.HandleFunc("GET /api/file", s.read)
	mux.HandleFunc("PUT /api/file", s.write)
	mux.HandleFunc("POST /api/library", s.library)
	mux.HandleFunc("GET /api/workspace", s.currentWorkspace)
	mux.HandleFunc("POST /api/workspace", s.openWorkspace)
	mux.HandleFunc("GET /api/preferences", s.readPreferences)
	mux.HandleFunc("PATCH /api/preferences", s.patchPreferences)
	mux.HandleFunc("GET /api/browse", s.listBrowse)
	mux.HandleFunc("POST /api/browse", s.createBrowse)
	mux.HandleFunc("GET /api/", http.NotFound)
	mux.Handle("GET /", http.FileServerFS(assets))
	return protect(cfg, s.hold, mux)
}

func (s *server) list(w http.ResponseWriter, r *http.Request) {
	root, release, ok := s.fileRoot(w, r)
	if !ok {
		return
	}
	defer release()
	if err := serveListing(w, r, root); err != nil {
		http.Error(w, "cannot list folder", http.StatusInternalServerError)
	}
}

func (s *server) fileRoot(w http.ResponseWriter, r *http.Request) (*os.Root, func(), bool) {
	root, release, stale := s.ws.borrow(r.Header.Get(WorkspaceHeader))
	if stale {
		http.Error(w, "workspace is stale", http.StatusConflict)
		return nil, nil, false
	}
	if root == nil {
		http.Error(w, "no folder open", http.StatusNotFound)
		return nil, nil, false
	}
	return root, release, true
}

func filePath(w http.ResponseWriter, r *http.Request) (string, bool) {
	p := r.URL.Query().Get("path")
	if !filepath.IsLocal(p) || path.Clean(filepath.ToSlash(p)) == "." {
		http.Error(w, "path must be a file path inside the folder", http.StatusBadRequest)
		return "", false
	}
	return path.Clean(filepath.ToSlash(p)), true
}

func (s *server) read(w http.ResponseWriter, r *http.Request) {
	root, release, ok := s.fileRoot(w, r)
	if !ok {
		return
	}
	defer release()
	p, ok := filePath(w, r)
	if !ok {
		return
	}
	f, err := root.Open(p)
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
	if _, stat := r.URL.Query()["stat"]; stat {
		if r.URL.Query().Get("stat") != "1" {
			http.Error(w, "stat must be 1", http.StatusBadRequest)
			return
		}
		writeJSONValue(w, fileInfo{Path: p, Size: info.Size(), Modified: info.ModTime().UTC()})
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	_, _ = io.Copy(w, f)
}

func (s *server) write(w http.ResponseWriter, r *http.Request) {
	root, release, ok := s.fileRoot(w, r)
	if !ok {
		return
	}
	defer release()
	p, ok := filePath(w, r)
	if !ok {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxFileBytes))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		http.Error(w, "file is larger than the limit", http.StatusRequestEntityTooLarge)
		return
	}
	if err != nil {
		http.Error(w, "cannot read request body", http.StatusBadRequest)
		return
	}
	if info, err := root.Lstat(p); err == nil && info.IsDir() {
		http.Error(w, "path is a folder", http.StatusBadRequest)
		return
	}
	if err := parentReady(root, p); err != nil {
		var status *statusError
		if errors.As(err, &status) {
			http.Error(w, status.text, status.code)
			return
		}
		openFailed(w, err)
		return
	}
	if err := replace(root, p, body); err != nil {
		openFailed(w, err)
		return
	}
	info, err := root.Stat(p)
	if err != nil {
		openFailed(w, err)
		return
	}
	writeJSONValue(w, fileInfo{Path: p, Size: info.Size(), Modified: info.ModTime().UTC()})
}

// A write may create assets/ at the top of the folder and no other folder.
func parentReady(root *os.Root, p string) error {
	dir := path.Dir(p)
	if dir == "." {
		return nil
	}
	if dir == "assets" {
		err := root.Mkdir(dir, 0o755)
		if err != nil && !errors.Is(err, os.ErrExist) {
			return err
		}
	}
	info, err := root.Lstat(dir)
	if err != nil || !info.IsDir() {
		return openError(http.StatusBadRequest, "folder does not exist")
	}
	return nil
}

func replace(root *os.Root, p string, data []byte) error {
	var suffix [6]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return err
	}
	tmp := path.Join(path.Dir(p), "."+path.Base(p)+".tmp-"+hex.EncodeToString(suffix[:]))
	f, err := root.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
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
		err = root.Rename(tmp, p)
	}
	if err != nil {
		_ = root.Remove(tmp)
	}
	return err
}

const preferencesLimit = 1 << 20

func (s *server) readPreferences(w http.ResponseWriter, _ *http.Request) {
	view, err := s.prefs.Read()
	if err != nil {
		http.Error(w, "cannot read preferences", http.StatusInternalServerError)
		return
	}
	writeJSON(w, view.JSON)
}

func (s *server) patchPreferences(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, preferencesLimit))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		http.Error(w, "preferences are larger than the limit", http.StatusRequestEntityTooLarge)
		return
	}
	if err != nil {
		http.Error(w, "cannot read request body", http.StatusBadRequest)
		return
	}
	view, err := s.prefs.Patch(body)
	if errors.Is(err, prefs.ErrUnreadable) {
		http.Error(w, "preferences file cannot be read", http.StatusConflict)
		return
	}
	if errors.Is(err, prefs.ErrBadPatch) || errors.Is(err, prefs.ErrNotObject) {
		http.Error(w, "patch must be an object of objects", http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, "cannot write preferences", http.StatusInternalServerError)
		return
	}
	writeJSON(w, view.JSON)
}

func writeJSON(w http.ResponseWriter, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
}

func openFailed(w http.ResponseWriter, err error) {
	if errors.Is(err, fs.ErrNotExist) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	http.Error(w, "access refused", http.StatusForbidden)
}
