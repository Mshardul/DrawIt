package server

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
)

const importLimit = 64 << 20

type importFile struct {
	Path string `json:"path"`
	Data []byte `json:"data"`
}

type importRequest struct {
	Project string       `json:"project"`
	Files   []importFile `json:"files"`
}

func (s *server) importLibrary(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, importLimit))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		http.Error(w, "request is larger than the limit", http.StatusRequestEntityTooLarge)
		return
	}
	if err != nil {
		http.Error(w, "cannot read request body", http.StatusBadRequest)
		return
	}
	var req importRequest
	if err := json.Unmarshal(body, &req); err != nil || req.Project == "" || len(req.Files) == 0 {
		http.Error(w, "name a file", http.StatusBadRequest)
		return
	}
	for _, file := range req.Files {
		if int64(len(file.Data)) > MaxFileBytes {
			http.Error(w, "file is over the limit", http.StatusRequestEntityTooLarge)
			return
		}
	}
	root, err := s.openLibrary()
	if err != nil {
		writeLibraryError(w, err)
		return
	}
	defer func() { _ = root.Close() }()
	paths, err := importInto(root, req)
	if err != nil {
		writeLibraryError(w, err)
		return
	}
	writeJSONValue(w, map[string][]string{"paths": paths})
}

func importInto(root *os.Root, req importRequest) ([]string, error) {
	folder, err := projectFolder(root, req.Project)
	if err != nil {
		return nil, err
	}
	rels := make([]string, len(req.Files))
	for i, file := range req.Files {
		rel, err := importRelative(file.Path)
		if err != nil {
			return nil, err
		}
		rels[i] = rel
	}
	taken, err := projectTaken(root, folder)
	if err != nil {
		return nil, err
	}
	chosen := make([]string, len(rels))
	for i, rel := range rels {
		free, err := freeRelative(taken, rel)
		if err != nil {
			return nil, err
		}
		chosen[i] = free
		taken[strings.ToLower(free)] = struct{}{}
	}
	for _, rel := range chosen {
		if !strings.HasPrefix(rel, "assets/") {
			continue
		}
		if err := root.Mkdir(path.Join(folder, "assets"), 0o755); err != nil && !errors.Is(err, fs.ErrExist) {
			return nil, err
		}
		break
	}
	paths := make([]string, len(chosen))
	for i, rel := range chosen {
		dest := path.Join(folder, rel)
		if err := createExclusive(root, dest, req.Files[i].Data); err != nil {
			return nil, err
		}
		paths[i] = dest
	}
	return paths, nil
}

func projectTaken(root *os.Root, folder string) (map[string]struct{}, error) {
	taken := map[string]struct{}{}
	entries, err := fs.ReadDir(root.FS(), folder)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() && strings.EqualFold(name, "assets") {
			assets, err := fs.ReadDir(root.FS(), path.Join(folder, name))
			if err != nil {
				return nil, err
			}
			for _, asset := range assets {
				taken[strings.ToLower(path.Join("assets", asset.Name()))] = struct{}{}
			}
			continue
		}
		taken[strings.ToLower(name)] = struct{}{}
	}
	return taken, nil
}

func importRelative(p string) (string, error) {
	if strings.Contains(p, `\`) || strings.Contains(p, "\x00") || strings.HasPrefix(p, "/") || strings.Contains(p, "..") {
		return "", openError(http.StatusBadRequest, "name is not allowed")
	}
	parts := strings.Split(p, "/")
	for _, part := range parts {
		if part == "" || part == "." || strings.HasPrefix(part, ".") {
			return "", openError(http.StatusBadRequest, "name is not allowed")
		}
	}
	if len(parts) == 1 {
		return parts[0], nil
	}
	if len(parts) == 2 && parts[0] == "assets" {
		return p, nil
	}
	return "", openError(http.StatusBadRequest, "name is not allowed")
}

func freeRelative(taken map[string]struct{}, relative string) (string, error) {
	if _, ok := taken[strings.ToLower(relative)]; !ok {
		return relative, nil
	}
	dir, base := "", relative
	if slash := strings.LastIndex(relative, "/"); slash >= 0 {
		dir = relative[:slash+1]
		base = relative[slash+1:]
	}
	stem, ext := splitExt(base)
	for n := 2; n <= 10000; n++ {
		candidate := dir + stem + " " + strconv.Itoa(n) + ext
		if _, ok := taken[strings.ToLower(candidate)]; !ok {
			return candidate, nil
		}
	}
	return "", openError(http.StatusConflict, "name exists")
}

func (s *server) readLibraryFile(w http.ResponseWriter, r *http.Request) {
	root, err := s.openLibrary()
	if err != nil {
		writeLibraryError(w, err)
		return
	}
	defer func() { _ = root.Close() }()
	rel, err := cleanLibraryPath(r.URL.Query().Get("path"))
	if err != nil {
		writeLibraryError(w, err)
		return
	}
	f, err := root.Open(rel)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "access refused", http.StatusForbidden)
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

func (s *server) writeLibraryFile(w http.ResponseWriter, r *http.Request) {
	root, err := s.openLibrary()
	if err != nil {
		writeLibraryError(w, err)
		return
	}
	defer func() { _ = root.Close() }()
	rel, err := cleanLibraryPath(r.URL.Query().Get("path"))
	if err != nil {
		writeLibraryError(w, err)
		return
	}
	info, err := root.Stat(rel)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "access refused", http.StatusForbidden)
		return
	}
	if !info.Mode().IsRegular() {
		http.Error(w, "not a file", http.StatusBadRequest)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxFileBytes))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		http.Error(w, "file is over the limit", http.StatusRequestEntityTooLarge)
		return
	}
	if err != nil {
		http.Error(w, "cannot read request body", http.StatusBadRequest)
		return
	}
	if err := replace(root, rel, body); err != nil {
		http.Error(w, "cannot update the library", http.StatusInternalServerError)
		return
	}
	writeJSONValue(w, libraryPathView{Path: rel})
}
