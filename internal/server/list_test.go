package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestTempFilesStayOutOfTheRecursiveListing(t *testing.T) {
	h, dir := newServer(t)
	writeFile(t, filepath.Join(dir, "a.drawit.kdl"), "a")
	writeFile(t, filepath.Join(dir, ".a.drawit.kdl.tmp-0123456789ab"), "partial")
	writeFile(t, filepath.Join(dir, "assets", ".logo.svg.tmp-abcdefabcdef"), "partial")
	writeFile(t, filepath.Join(dir, ".keep"), "keep")

	var got listing
	if err := json.Unmarshal(do(h, http.MethodGet, "/api/files", nil).Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	var paths []string
	for _, f := range got.Files {
		paths = append(paths, f.Path)
	}
	if strings.Join(paths, ",") != ".keep,a.drawit.kdl" {
		t.Fatalf("paths = %v", paths)
	}
}

func TestTopListingReportsFilesFoldersAndTheLatestDiagram(t *testing.T) {
	h, dir := newServer(t)
	writeFile(t, filepath.Join(dir, "readme.txt"), "hello")
	writeFile(t, filepath.Join(dir, "Demo", "a.drawit.kdl"), "old")
	time.Sleep(5 * time.Millisecond)
	writeFile(t, filepath.Join(dir, "Demo", "b.drawit.kdl"), "new")
	writeFile(t, filepath.Join(dir, "Demo", "assets", "c.drawit.kdl"), "nested")
	writeFile(t, filepath.Join(dir, "Demo", "notes.txt"), "note")
	writeFile(t, filepath.Join(dir, "Demo", ".b.drawit.kdl.tmp-0123456789ab"), "partial")
	if err := os.Mkdir(filepath.Join(dir, "Empty"), 0o755); err != nil {
		t.Fatal(err)
	}

	rec := do(h, http.MethodGet, "/api/files?top=1", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var got topListing
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Revision == "" {
		t.Fatal("revision is empty")
	}
	if len(got.Entries) != 3 {
		t.Fatalf("entries = %+v", got.Entries)
	}
	if got.Entries[0].Path != "Demo" || got.Entries[0].Type != "folder" || got.Entries[0].Diagrams != 2 {
		t.Fatalf("Demo = %+v", got.Entries[0])
	}
	if got.Entries[0].Latest == nil || got.Entries[0].Latest.Path != "Demo/b.drawit.kdl" {
		t.Fatalf("latest = %+v", got.Entries[0].Latest)
	}
	if got.Entries[1].Path != "Empty" || got.Entries[1].Type != "folder" || got.Entries[1].Diagrams != 0 || got.Entries[1].Latest != nil {
		t.Fatalf("Empty = %+v", got.Entries[1])
	}
	if got.Entries[2].Path != "readme.txt" || got.Entries[2].Type != "file" || got.Entries[2].Size != 5 {
		t.Fatalf("readme = %+v", got.Entries[2])
	}
	if strings.Contains(rec.Body.String(), "tmp-") || strings.Contains(rec.Body.String(), "c.drawit.kdl") {
		t.Fatalf("listing includes a nested or temporary file: %s", rec.Body.String())
	}
}

func TestRevisionChangesWhenAProjectChangesAndSkipsTheWalk(t *testing.T) {
	h, dir := newServer(t)
	writeFile(t, filepath.Join(dir, "Demo", "a.drawit.kdl"), "a")

	first := revisionOf(t, h)
	again := revisionOf(t, h)
	if first == "" || first != again {
		t.Fatalf("revision %q then %q", first, again)
	}
	top := topOf(t, h)
	if top.Revision != first {
		t.Fatalf("top revision %q, want %q", top.Revision, first)
	}

	rec := do(h, http.MethodPut, "/api/file?path=Demo/a.drawit.kdl", strings.NewReader("changed"))
	if rec.Code != http.StatusOK {
		t.Fatalf("write status = %d, body %s", rec.Code, rec.Body.String())
	}
	if revisionOf(t, h) == first {
		t.Fatal("revision did not change after a save")
	}
}

func TestStatReturnsSizeAndModifiedTime(t *testing.T) {
	h, dir := newServer(t)
	writeFile(t, filepath.Join(dir, "a.drawit.kdl"), "abcd")

	rec := do(h, http.MethodGet, "/api/file?path=a.drawit.kdl&stat=1", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var got fileInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Path != "a.drawit.kdl" || got.Size != 4 || got.Modified.IsZero() {
		t.Fatalf("stat = %+v", got)
	}
	if rec := do(h, http.MethodGet, "/api/file?path=missing.drawit.kdl&stat=1", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("missing status = %d", rec.Code)
	}

	wrote := do(h, http.MethodPut, "/api/file?path=a.drawit.kdl", strings.NewReader("abcdef"))
	if wrote.Code != http.StatusOK {
		t.Fatalf("write status = %d, body %s", wrote.Code, wrote.Body.String())
	}
	var after fileInfo
	if err := json.Unmarshal(wrote.Body.Bytes(), &after); err != nil {
		t.Fatal(err)
	}
	if after.Path != "a.drawit.kdl" || after.Size != 6 || after.Modified.IsZero() {
		t.Fatalf("write stat = %+v", after)
	}
}

type topListing struct {
	Revision string `json:"revision"`
	Entries  []struct {
		Path     string `json:"path"`
		Type     string `json:"type"`
		Size     int64  `json:"size"`
		Diagrams int    `json:"diagrams"`
		Latest   *struct {
			Path string `json:"path"`
		} `json:"latest"`
	} `json:"entries"`
}

func revisionOf(t *testing.T, h http.Handler) string {
	t.Helper()
	rec := do(h, http.MethodGet, "/api/files?revision=1", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var got struct {
		Revision string `json:"revision"`
		Entries  []any  `json:"entries"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Entries != nil {
		t.Fatalf("revision response included entries: %s", rec.Body.String())
	}
	return got.Revision
}

func topOf(t *testing.T, h http.Handler) topListing {
	t.Helper()
	rec := do(h, http.MethodGet, "/api/files?top=1", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var got topListing
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	return got
}
