package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/Mshardul/DrawIt/internal/trash"
)

const (
	diagramExt    = ".drawit.kdl"
	maxNameBytes  = 255
	emptyDiagram  = "diagram version=1\n"
	draftsProject = "Drafts"
)

type libraryRequest struct {
	Project *string `json:"project"`
	Diagram *string `json:"diagram"`
	Draft   *bool   `json:"draft"`
	From    *string `json:"from"`
	To      *string `json:"to"`
	Delete  *string `json:"delete"`
	NoTrash *bool   `json:"noTrash"`
	Copy    *string `json:"copy"`
	Into    *string `json:"into"`
}

func (q libraryRequest) action() string {
	draft := q.Draft != nil && *q.Draft
	project := q.Project != nil
	diagram := q.Diagram != nil
	from := q.From != nil
	to := q.To != nil
	del := q.Delete != nil
	copy := q.Copy != nil
	into := q.Into != nil
	switch {
	case draft && !project && !diagram && !from && !to && !del && !copy && !into:
		return "draft"
	case project && !draft && !diagram && !from && !to && !del && !copy && !into:
		return "project"
	case project && diagram && !draft && !from && !to && !del && !copy && !into:
		return "diagram"
	case from && to && !draft && !project && !diagram && !del && !copy && !into:
		return "rename"
	case del && !draft && !project && !diagram && !from && !to && !copy && !into:
		return "delete"
	case copy && into && !draft && !project && !diagram && !from && !to && !del:
		return "copy"
	default:
		return ""
	}
}

type libraryPathView struct {
	Path string `json:"path"`
}

func (s *server) library(w http.ResponseWriter, r *http.Request) {
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
	var req libraryRequest
	if err := json.Unmarshal(body, &req); err != nil || req.action() == "" {
		http.Error(w, "name one library change", http.StatusBadRequest)
		return
	}
	root, err := s.openLibrary()
	if err != nil {
		writeLibraryError(w, err)
		return
	}
	defer func() { _ = root.Close() }()
	rel, err := s.changeLibrary(root, req)
	if err != nil {
		writeLibraryError(w, err)
		return
	}
	writeJSONValue(w, libraryPathView{Path: rel})
}

func (s *server) openLibrary() (*os.Root, error) {
	if s.ws.library == "" {
		return nil, openError(http.StatusInternalServerError, "library is not set")
	}
	root, err := os.OpenRoot(s.ws.library)
	if err != nil {
		return nil, openError(http.StatusInternalServerError, "cannot open the library")
	}
	return root, nil
}

func (s *server) changeLibrary(root *os.Root, req libraryRequest) (string, error) {
	switch req.action() {
	case "project":
		return createProject(root, *req.Project)
	case "draft":
		return createDraft(root)
	case "diagram":
		return createDiagram(root, *req.Project, *req.Diagram)
	case "delete":
		permanent := req.NoTrash != nil && *req.NoTrash
		move := s.trash
		if move == nil {
			move = trash.Move
		}
		return deleteLibrary(root, s.ws.library, *req.Delete, permanent, move)
	case "copy":
		return copyLibrary(root, *req.Copy, *req.Into)
	default:
		return renameLibrary(root, *req.From, *req.To)
	}
}

func copyLibrary(root *os.Root, from, dir string) (string, error) {
	rel, err := cleanLibraryPath(from)
	if err != nil {
		return "", err
	}
	info, err := root.Stat(rel)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "", openError(http.StatusNotFound, "not found")
		}
		return "", openError(http.StatusForbidden, "access refused")
	}
	if !info.Mode().IsRegular() {
		return "", openError(http.StatusBadRequest, "not a file")
	}
	project, intoAssets, err := copyDir(dir)
	if err != nil {
		return "", err
	}
	folder, err := projectFolder(root, project)
	if err != nil {
		return "", err
	}
	destDir := folder
	if intoAssets {
		destDir = path.Join(folder, "assets")
		if err := root.Mkdir(destDir, 0o755); err != nil && !errors.Is(err, fs.ErrExist) {
			return "", err
		}
	}
	entries, err := fs.ReadDir(root.FS(), destDir)
	if err != nil {
		return "", err
	}
	free, err := freeBase(entries, path.Base(rel))
	if err != nil {
		return "", err
	}
	data, err := fs.ReadFile(root.FS(), rel)
	if err != nil {
		return "", err
	}
	if int64(len(data)) > MaxFileBytes {
		return "", openError(http.StatusRequestEntityTooLarge, "file is over the limit")
	}
	dest := path.Join(destDir, free)
	if err := createExclusive(root, dest, data); err != nil {
		return "", err
	}
	return dest, nil
}

func copyDir(dir string) (string, bool, error) {
	if strings.HasSuffix(dir, "/assets") {
		project := strings.TrimSuffix(dir, "/assets")
		if project == "" || strings.Contains(project, "/") {
			return "", false, openError(http.StatusBadRequest, "name is not allowed")
		}
		return project, true, nil
	}
	if dir == "" || strings.Contains(dir, "/") {
		return "", false, openError(http.StatusBadRequest, "name is not allowed")
	}
	return dir, false, nil
}

func freeBase(entries []fs.DirEntry, base string) (string, error) {
	if !nameTaken(entries, base, "") {
		return base, nil
	}
	stem, ext := splitExt(base)
	for n := 2; n <= 10000; n++ {
		candidate := fmt.Sprintf("%s %d%s", stem, n, ext)
		if !nameTaken(entries, candidate, "") {
			return candidate, nil
		}
	}
	return "", openError(http.StatusConflict, "name exists")
}

func splitExt(base string) (string, string) {
	if strings.HasSuffix(base, diagramExt) {
		return strings.TrimSuffix(base, diagramExt), diagramExt
	}
	if dot := strings.LastIndex(base, "."); dot > 0 {
		return base[:dot], base[dot:]
	}
	return base, ""
}

func deleteLibrary(root *os.Root, library, rel string, permanent bool, move func(string) error) (string, error) {
	rel, err := cleanLibraryPath(rel)
	if err != nil {
		return "", err
	}
	if !deletablePath(rel) {
		return "", openError(http.StatusBadRequest, "not a project or a diagram")
	}
	info, err := root.Stat(rel)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "", openError(http.StatusNotFound, "not found")
		}
		return "", openError(http.StatusForbidden, "access refused")
	}
	if !libraryItem(rel, info) {
		return "", openError(http.StatusBadRequest, "not a project or a diagram")
	}
	abs, err := libraryAbs(library, rel)
	if err != nil {
		return "", err
	}
	if move == nil {
		return "", openError(http.StatusInternalServerError, "cannot move to the trash")
	}
	if err := move(abs); err != nil {
		if errors.Is(err, trash.ErrNoTrash) {
			if !permanent {
				return "", openError(http.StatusConflict, "no trash")
			}
			if err := removeLibraryItem(root, rel); err != nil {
				return "", err
			}
			return rel, nil
		}
		return "", err
	}
	return rel, nil
}

func deletablePath(rel string) bool {
	if !strings.Contains(rel, "/") {
		return true
	}
	project, file, _ := strings.Cut(rel, "/")
	return project != "" && !strings.Contains(file, "/") && strings.HasSuffix(file, diagramExt)
}

func libraryItem(rel string, info fs.FileInfo) bool {
	if strings.Contains(rel, "/") {
		return info.Mode().IsRegular()
	}
	return info.IsDir()
}

func libraryAbs(library, rel string) (string, error) {
	abs := filepath.Join(library, filepath.FromSlash(rel))
	back, err := filepath.Rel(library, abs)
	if err != nil || back == ".." || strings.HasPrefix(back, ".."+string(filepath.Separator)) {
		return "", openError(http.StatusBadRequest, "name is not allowed")
	}
	return abs, nil
}

func removeLibraryItem(root *os.Root, rel string) error {
	var dirs []string
	err := fs.WalkDir(root.FS(), rel, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			dirs = append(dirs, p)
			return nil
		}
		return root.Remove(p)
	})
	if err != nil {
		return err
	}
	for i := len(dirs) - 1; i >= 0; i-- {
		if err := root.Remove(dirs[i]); err != nil {
			return err
		}
	}
	return nil
}

func createProject(root *os.Root, name string) (string, error) {
	if !allowedName(name, false) {
		return "", openError(http.StatusBadRequest, "name is not allowed")
	}
	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return "", err
	}
	if nameTaken(entries, name, "") {
		return "", openError(http.StatusConflict, "name exists")
	}
	if err := root.Mkdir(name, 0o755); err != nil {
		if errors.Is(err, os.ErrExist) {
			return "", openError(http.StatusConflict, "name exists")
		}
		return "", err
	}
	return name, nil
}

func createDraft(root *os.Root) (string, error) {
	folder, err := draftsFolder(root)
	if err != nil {
		return "", err
	}
	entries, err := fs.ReadDir(root.FS(), folder)
	if err != nil {
		return "", err
	}
	file, err := nextDraft(entries)
	if err != nil {
		return "", err
	}
	rel := path.Join(folder, file)
	if err := createExclusive(root, rel, []byte(emptyDiagram)); err != nil {
		return "", err
	}
	return rel, nil
}

func createDiagram(root *os.Root, project, name string) (string, error) {
	if !allowedName(project, false) || !allowedName(name, true) {
		return "", openError(http.StatusBadRequest, "name is not allowed")
	}
	folder, err := projectFolder(root, project)
	if err != nil {
		return "", err
	}
	entries, err := fs.ReadDir(root.FS(), folder)
	if err != nil {
		return "", err
	}
	file := name + diagramExt
	if nameTaken(entries, file, "") {
		return "", openError(http.StatusConflict, "name exists")
	}
	rel := path.Join(folder, file)
	if err := createExclusive(root, rel, []byte(emptyDiagram)); err != nil {
		return "", err
	}
	return rel, nil
}

func renameLibrary(root *os.Root, from, to string) (string, error) {
	rel, err := cleanLibraryPath(from)
	if err != nil {
		return "", err
	}
	if !strings.Contains(rel, "/") {
		return renameProject(root, rel, to)
	}
	project, file, _ := strings.Cut(rel, "/")
	if strings.Contains(file, "/") || !strings.HasSuffix(file, diagramExt) {
		return "", openError(http.StatusBadRequest, "not a project or a diagram")
	}
	return renameDiagram(root, project, file, to)
}

func renameProject(root *os.Root, from, to string) (string, error) {
	if !allowedName(to, false) {
		return "", openError(http.StatusBadRequest, "name is not allowed")
	}
	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return "", err
	}
	source := matchingEntry(entries, from)
	if source == nil || !source.IsDir() {
		return "", openError(http.StatusNotFound, "not found")
	}
	if nameTaken(entries, to, source.Name()) {
		return "", openError(http.StatusConflict, "name exists")
	}
	if source.Name() != to {
		if err := root.Rename(source.Name(), to); err != nil {
			return "", err
		}
	}
	return to, nil
}

func renameDiagram(root *os.Root, project, file, to string) (string, error) {
	if !allowedName(to, true) {
		return "", openError(http.StatusBadRequest, "name is not allowed")
	}
	folder, err := projectFolder(root, project)
	if err != nil {
		return "", err
	}
	entries, err := fs.ReadDir(root.FS(), folder)
	if err != nil {
		return "", err
	}
	source := matchingEntry(entries, file)
	if source == nil || source.IsDir() {
		return "", openError(http.StatusNotFound, "not found")
	}
	dest := to + diagramExt
	if nameTaken(entries, dest, source.Name()) {
		return "", openError(http.StatusConflict, "name exists")
	}
	if source.Name() != dest {
		if err := root.Rename(path.Join(folder, source.Name()), path.Join(folder, dest)); err != nil {
			return "", err
		}
	}
	return path.Join(folder, dest), nil
}

func draftsFolder(root *os.Root) (string, error) {
	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return "", err
	}
	if existing := matchingEntry(entries, draftsProject); existing != nil {
		if !existing.IsDir() {
			return "", openError(http.StatusConflict, "name exists")
		}
		return existing.Name(), nil
	}
	if err := root.Mkdir(draftsProject, 0o755); err != nil {
		if errors.Is(err, os.ErrExist) {
			return "", openError(http.StatusConflict, "name exists")
		}
		return "", err
	}
	return draftsProject, nil
}

func projectFolder(root *os.Root, name string) (string, error) {
	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return "", err
	}
	existing := matchingEntry(entries, name)
	if existing == nil || !existing.IsDir() {
		return "", openError(http.StatusNotFound, "not found")
	}
	return existing.Name(), nil
}

func nextDraft(entries []fs.DirEntry) (string, error) {
	if !nameTaken(entries, "Untitled"+diagramExt, "") {
		return "Untitled" + diagramExt, nil
	}
	for n := 2; n <= 10000; n++ {
		file := fmt.Sprintf("Untitled %d%s", n, diagramExt)
		if !nameTaken(entries, file, "") {
			return file, nil
		}
	}
	return "", openError(http.StatusConflict, "name exists")
}

func createExclusive(root *os.Root, p string, data []byte) error {
	f, err := root.OpenFile(p, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			return openError(http.StatusConflict, "name exists")
		}
		return err
	}
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		_ = root.Remove(p)
		return err
	}
	return nil
}

func cleanLibraryPath(p string) (string, error) {
	p = path.Clean(filepath.ToSlash(p))
	if !filepath.IsLocal(p) || p == "." {
		return "", openError(http.StatusBadRequest, "name is not allowed")
	}
	return p, nil
}

func allowedName(name string, diagram bool) bool {
	if name == "" || strings.Contains(name, "/") || strings.Contains(name, "\\") {
		return false
	}
	n := len(name)
	if diagram {
		n += len(diagramExt)
	}
	if n > maxNameBytes || !utf8.ValidString(name) {
		return false
	}
	for _, r := range name {
		if r == ' ' || r == '-' || r == '_' || unicode.IsLetter(r) || unicode.IsDigit(r) {
			continue
		}
		return false
	}
	return !windowsReserved(name)
}

func windowsReserved(name string) bool {
	base := name
	if dot := strings.IndexByte(name, '.'); dot >= 0 {
		base = name[:dot]
	}
	base = strings.TrimRight(base, " ")
	switch strings.ToUpper(base) {
	case "CON", "PRN", "AUX", "NUL":
		return true
	}
	if len(base) == 4 {
		head := strings.ToUpper(base[:3])
		if (head == "COM" || head == "LPT") && base[3] >= '1' && base[3] <= '9' {
			return true
		}
	}
	return false
}

func matchingEntry(entries []fs.DirEntry, name string) fs.DirEntry {
	var folded fs.DirEntry
	for _, entry := range entries {
		if entry.Name() == name {
			return entry
		}
		if folded == nil && strings.EqualFold(entry.Name(), name) {
			folded = entry
		}
	}
	return folded
}

// ignore is the entry being renamed, so a case-only change is not a clash.
func nameTaken(entries []fs.DirEntry, name, ignore string) bool {
	for _, entry := range entries {
		if ignore != "" && entry.Name() == ignore {
			continue
		}
		if strings.EqualFold(entry.Name(), name) {
			return true
		}
	}
	return false
}

func writeLibraryError(w http.ResponseWriter, err error) {
	var status *statusError
	if errors.As(err, &status) {
		http.Error(w, status.text, status.code)
		return
	}
	http.Error(w, "cannot update the library", http.StatusInternalServerError)
}
