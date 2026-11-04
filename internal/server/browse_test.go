package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func TestBrowseListsFoldersAndDiagramsFromHome(t *testing.T) {
	h, home := browseServer(t)
	if err := os.Mkdir(filepath.Join(home, "Docs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(home, ".hidden"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(home, "notes.txt"), "secret-bytes")
	writeFile(t, filepath.Join(home, "pic.drawit.kdl"), "diagram-secret")
	writeFile(t, filepath.Join(home, ".hidden", "skip.drawit.kdl"), "hidden-secret")

	rec := do(h, http.MethodGet, "/api/browse", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var view struct {
		Path    string `json:"path"`
		Entries []struct {
			Name string `json:"name"`
			Type string `json:"type"`
		} `json:"entries"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	wantPath, err := filepath.EvalSymlinks(home)
	if err != nil {
		t.Fatal(err)
	}
	if view.Path != wantPath {
		t.Fatalf("path = %q, want %q", view.Path, wantPath)
	}
	want := []struct{ name, kind string }{{"Docs", "folder"}, {"DrawIt", "folder"}, {"pic.drawit.kdl", "file"}}
	if len(view.Entries) != len(want) {
		t.Fatalf("entries = %+v", view.Entries)
	}
	for i, entry := range want {
		if view.Entries[i].Name != entry.name || view.Entries[i].Type != entry.kind {
			t.Fatalf("entries = %+v", view.Entries)
		}
	}
	body := rec.Body.String()
	if strings.Contains(body, "diagram-secret") || strings.Contains(body, "secret-bytes") || strings.Contains(body, "hidden-secret") {
		t.Fatalf("listing included file contents: %s", body)
	}
}

func TestBrowseListsAFolderInsideHome(t *testing.T) {
	h, home := browseServer(t)
	docs := filepath.Join(home, "Docs")
	if err := os.Mkdir(docs, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(docs, "a.drawit.kdl"), "a")

	rec := do(h, http.MethodGet, "/api/browse?path="+docs, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	view := browseBody(t, rec)
	if len(view.Entries) != 1 || view.Entries[0].Name != "a.drawit.kdl" || view.Entries[0].Type != "file" {
		t.Fatalf("entries = %+v", view.Entries)
	}
}

func TestBrowseRefusesAPathOutsideHome(t *testing.T) {
	h, _ := browseServer(t)
	outside := t.TempDir()
	rec := do(h, http.MethodGet, "/api/browse?path="+outside, nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "outside the home directory") {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestBrowseRefusesASymlinkThatLeavesHome(t *testing.T) {
	h, home := browseServer(t)
	outside := t.TempDir()
	if err := os.Mkdir(filepath.Join(outside, "Secret"), 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(home, "escape")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}

	rec := do(h, http.MethodGet, "/api/browse?path="+link, nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	homeList := browseBody(t, do(h, http.MethodGet, "/api/browse", nil))
	for _, entry := range homeList.Entries {
		if entry.Name == "escape" {
			t.Fatalf("listing showed a symlink that leaves home: %+v", homeList.Entries)
		}
	}
}

func TestBrowseShowsASymlinkThatStaysInsideHome(t *testing.T) {
	h, home := browseServer(t)
	docs := filepath.Join(home, "Docs")
	if err := os.Mkdir(docs, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(docs, filepath.Join(home, "alias")); err != nil {
		t.Fatal(err)
	}
	view := browseBody(t, do(h, http.MethodGet, "/api/browse", nil))
	found := false
	for _, entry := range view.Entries {
		if entry.Name == "alias" && entry.Type == "folder" {
			found = true
		}
	}
	if !found {
		t.Fatalf("entries = %+v", view.Entries)
	}
}

func TestBrowseCapsTheEntryCount(t *testing.T) {
	h, home := browseServer(t)
	dir := filepath.Join(home, "many")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < maxBrowseEntries+1; i++ {
		if err := os.Mkdir(filepath.Join(dir, fmt.Sprintf("f%03d", i)), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	rec := do(h, http.MethodGet, "/api/browse?path="+dir, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	view := browseBody(t, rec)
	if !view.Truncated || len(view.Entries) != maxBrowseEntries {
		t.Fatalf("truncated = %v, entries = %d", view.Truncated, len(view.Entries))
	}
	if view.Entries[0].Name != "f000" || view.Entries[len(view.Entries)-1].Name != fmt.Sprintf("f%03d", maxBrowseEntries-1) {
		t.Fatalf("entries span %s to %s", view.Entries[0].Name, view.Entries[len(view.Entries)-1].Name)
	}
}

func TestBrowseSurvivesAnUnreadableFolder(t *testing.T) {
	h, home := browseServer(t)
	blocked := filepath.Join(home, "blocked")
	if err := os.Mkdir(blocked, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(blocked, "a.drawit.kdl"), "a")
	if err := os.Chmod(blocked, 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(blocked, 0o755) })

	rec := do(h, http.MethodGet, "/api/browse?path="+blocked, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	view := browseBody(t, rec)
	if len(view.Entries) != 0 {
		t.Fatalf("entries = %+v", view.Entries)
	}
}

func TestBrowseCreatesAFolderInAListedFolder(t *testing.T) {
	h, home := browseServer(t)
	rec := do(h, http.MethodPost, "/api/browse", strings.NewReader(`{"path":"`+home+`","name":"Notes"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	info, err := os.Stat(filepath.Join(home, "Notes"))
	if err != nil || !info.IsDir() {
		t.Fatalf("Notes was not created: %v", err)
	}
	view := browseBody(t, do(h, http.MethodGet, "/api/browse", nil))
	found := false
	for _, entry := range view.Entries {
		if entry.Name == "Notes" && entry.Type == "folder" {
			found = true
		}
	}
	if !found {
		t.Fatalf("entries = %+v", view.Entries)
	}
}

func TestBrowseRefusesToCreateAFolderOutsideHome(t *testing.T) {
	h, _ := browseServer(t)
	outside := t.TempDir()
	rec := do(h, http.MethodPost, "/api/browse", strings.NewReader(`{"path":"`+outside+`","name":"Notes"}`))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(outside, "Notes")); !os.IsNotExist(err) {
		t.Fatalf("created a folder outside home: %v", err)
	}
}

func TestBrowseRefusesAFolderNameThatIsNotAllowed(t *testing.T) {
	h, home := browseServer(t)
	for _, name := range []string{"", ".hidden", "a/b", "CON", "Notes"} {
		body := `{"path":"` + home + `","name":"` + name + `"}`
		if name == "Notes" {
			if err := os.Mkdir(filepath.Join(home, "notes"), 0o755); err != nil {
				t.Fatal(err)
			}
		}
		rec := do(h, http.MethodPost, "/api/browse", strings.NewReader(body))
		if name == "Notes" {
			if rec.Code != http.StatusConflict {
				t.Errorf("clash: status = %d, body %s", rec.Code, rec.Body.String())
			}
			continue
		}
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%q: status = %d, body %s", name, rec.Code, rec.Body.String())
		}
	}
}

type browseListing struct {
	Path      string `json:"path"`
	Truncated bool   `json:"truncated"`
	Entries   []struct {
		Name string `json:"name"`
		Type string `json:"type"`
	} `json:"entries"`
}

func browseBody(t *testing.T, rec *httptest.ResponseRecorder) browseListing {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var view browseListing
	if err := json.Unmarshal(rec.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	return view
}

func browseServer(t *testing.T) (http.Handler, string) {
	t.Helper()
	home := t.TempDir()
	library := filepath.Join(home, "DrawIt")
	if err := os.Mkdir(library, 0o755); err != nil {
		t.Fatal(err)
	}
	return New(nil, "", library, fstest.MapFS{}, nil, testConfig), home
}
