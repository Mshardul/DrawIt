package server

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
	"slices"
	"strings"
	"time"
)

type topEntry struct {
	Path     string    `json:"path"`
	Type     string    `json:"type"`
	Size     int64     `json:"size,omitempty"`
	Modified time.Time `json:"modified"`
	Diagrams *int      `json:"diagrams,omitempty"`
	Latest   *fileInfo `json:"latest,omitempty"`
}

type listed struct {
	name  string
	isDir bool
	size  int64
	mod   time.Time
}

func serveListing(w http.ResponseWriter, r *http.Request, root *os.Root) error {
	q := r.URL.Query()
	top := q.Has("top")
	revision := q.Has("revision")
	switch {
	case top && revision:
		http.Error(w, "choose one listing", http.StatusBadRequest)
		return nil
	case top && q.Get("top") != "1", revision && q.Get("revision") != "1":
		http.Error(w, "choose one listing", http.StatusBadRequest)
		return nil
	case top:
		return writeTop(w, root, false)
	case revision:
		return writeTop(w, root, true)
	}
	files, err := recursiveFiles(root)
	if err != nil {
		return err
	}
	writeJSONValue(w, map[string][]fileInfo{"files": files})
	return nil
}

func recursiveFiles(root *os.Root) ([]fileInfo, error) {
	files := []fileInfo{}
	err := fs.WalkDir(root.FS(), ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.Type().IsRegular() || tempFile(path.Base(p)) {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		files = append(files, fileInfo{Path: p, Size: info.Size(), Modified: info.ModTime().UTC()})
		return nil
	})
	return files, err
}

func writeTop(w http.ResponseWriter, root *os.Root, revisionOnly bool) error {
	rows, err := topLevel(root)
	if err != nil {
		return err
	}
	revision := folderRevision(rows)
	if revisionOnly {
		writeJSONValue(w, map[string]string{"revision": revision})
		return nil
	}
	entries := make([]topEntry, 0, len(rows))
	for _, row := range rows {
		if !row.isDir {
			entries = append(entries, topEntry{Path: row.name, Type: "file", Size: row.size, Modified: row.mod.UTC()})
			continue
		}
		count, latest, err := projectSummary(root, row.name)
		if err != nil {
			return err
		}
		entry := topEntry{Path: row.name, Type: "folder", Modified: row.mod.UTC(), Diagrams: &count}
		if latest != nil {
			entry.Latest = latest
		}
		entries = append(entries, entry)
	}
	writeJSONValue(w, struct {
		Revision string     `json:"revision"`
		Entries  []topEntry `json:"entries"`
	}{Revision: revision, Entries: entries})
	return nil
}

func topLevel(root *os.Root) ([]listed, error) {
	dir, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		return nil, err
	}
	rows := make([]listed, 0, len(dir))
	for _, d := range dir {
		if tempFile(d.Name()) {
			continue
		}
		info, err := d.Info()
		if err != nil {
			return nil, err
		}
		switch {
		case info.IsDir():
			rows = append(rows, listed{name: d.Name(), isDir: true, mod: info.ModTime()})
		case info.Mode().IsRegular():
			rows = append(rows, listed{name: d.Name(), size: info.Size(), mod: info.ModTime()})
		}
	}
	slices.SortFunc(rows, func(a, b listed) int { return strings.Compare(a.name, b.name) })
	return rows, nil
}

// A save renames into the folder, so the folder mtime changes without reading the files inside.
func folderRevision(rows []listed) string {
	sum := sha256.New()
	for _, row := range rows {
		kind := "file"
		if row.isDir {
			kind = "folder"
		}
		fmt.Fprintf(sum, "%s\t%s\t%d\t%d\n", kind, row.name, row.size, row.mod.UnixNano())
	}
	return hex.EncodeToString(sum.Sum(nil))
}

func projectSummary(root *os.Root, name string) (int, *fileInfo, error) {
	dir, err := fs.ReadDir(root.FS(), name)
	if err != nil {
		return 0, nil, err
	}
	var latest *fileInfo
	count := 0
	for _, d := range dir {
		if !d.Type().IsRegular() || tempFile(d.Name()) || !strings.HasSuffix(d.Name(), ".drawit.kdl") {
			continue
		}
		info, err := d.Info()
		if err != nil {
			return 0, nil, err
		}
		count++
		mod := info.ModTime().UTC()
		if latest != nil && !mod.After(latest.Modified) {
			continue
		}
		latest = &fileInfo{Path: path.Join(name, d.Name()), Modified: mod}
	}
	return count, latest, nil
}

func tempFile(name string) bool {
	rest, ok := strings.CutPrefix(name, ".")
	if !ok {
		return false
	}
	base, hexPart, ok := strings.Cut(rest, ".tmp-")
	if !ok || base == "" || strings.Contains(base, ".tmp-") {
		return false
	}
	if len(hexPart) != 12 {
		return false
	}
	for _, c := range hexPart {
		switch {
		case c >= '0' && c <= '9', c >= 'a' && c <= 'f':
		default:
			return false
		}
	}
	return true
}
