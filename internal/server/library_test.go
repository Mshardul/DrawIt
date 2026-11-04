package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCreateProjectMakesAFolderInTheLibrary(t *testing.T) {
	h, library, opened := libraryServer(t)

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"project":"Home network"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := libraryPath(t, rec); got != "Home network" {
		t.Fatalf("path = %q", got)
	}
	info, err := os.Stat(filepath.Join(library, "Home network"))
	if err != nil || !info.IsDir() {
		t.Fatalf("project folder: %v, dir %v", err, info)
	}
	entries, err := os.ReadDir(opened)
	if err != nil || len(entries) != 0 {
		t.Fatalf("served folder = %v, %v", entries, err)
	}
}

func TestAProjectNameThatExistsIgnoringCaseIsRefused(t *testing.T) {
	h, library, _ := libraryServer(t)
	if err := os.Mkdir(filepath.Join(library, "Home network"), 0o755); err != nil {
		t.Fatal(err)
	}

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"project":"home network"}`))
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	entries, err := os.ReadDir(library)
	if err != nil || len(entries) != 1 || entries[0].Name() != "Home network" {
		t.Fatalf("library = %v, %v", names(entries), err)
	}
}

func TestRenamingAProjectCanChangeOnlyItsCase(t *testing.T) {
	h, library, _ := libraryServer(t)
	if err := os.Mkdir(filepath.Join(library, "Home network"), 0o755); err != nil {
		t.Fatal(err)
	}

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"from":"Home network","to":"home network"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := libraryPath(t, rec); got != "home network" {
		t.Fatalf("path = %q", got)
	}
	entries, err := os.ReadDir(library)
	if err != nil || len(entries) != 1 || entries[0].Name() != "home network" {
		t.Fatalf("library = %v, %v", names(entries), err)
	}
}

func TestCreateDraftPicksTheNextFreeName(t *testing.T) {
	h, library, _ := libraryServer(t)
	if err := os.Mkdir(filepath.Join(library, "drafts"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "drafts", "untitled.drawit.kdl"), "keep")
	writeFile(t, filepath.Join(library, "drafts", "Untitled 3.drawit.kdl"), "keep")

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"draft":true}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := libraryPath(t, rec); got != "drafts/Untitled 2.drawit.kdl" {
		t.Fatalf("path = %q", got)
	}
	if got := readFile(t, filepath.Join(library, "drafts", "Untitled 2.drawit.kdl")); got != "diagram version=1\n" {
		t.Fatalf("content = %q", got)
	}
	if got := readFile(t, filepath.Join(library, "drafts", "untitled.drawit.kdl")); got != "keep" {
		t.Fatalf("existing draft changed to %q", got)
	}
}

func TestANewDraftStartsAtUntitled(t *testing.T) {
	h, library, _ := libraryServer(t)

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"draft":true}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := libraryPath(t, rec); got != "Drafts/Untitled.drawit.kdl" {
		t.Fatalf("path = %q", got)
	}
	info, err := os.Stat(filepath.Join(library, "Drafts"))
	if err != nil || !info.IsDir() {
		t.Fatalf("Drafts: %v", err)
	}
}

func TestCreateDiagramRefusesANameThatExists(t *testing.T) {
	h, library, _ := libraryServer(t)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "notes.drawit.kdl"), "keep")

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"diagram":"Notes","project":"Demo"}`))
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := readFile(t, filepath.Join(library, "Demo", "notes.drawit.kdl")); got != "keep" {
		t.Fatalf("content = %q", got)
	}
	entries, err := os.ReadDir(filepath.Join(library, "Demo"))
	if err != nil || len(entries) != 1 || entries[0].Name() != "notes.drawit.kdl" {
		t.Fatalf("project = %v, %v", names(entries), err)
	}
}

func TestCreateDiagramWritesAnEmptyFile(t *testing.T) {
	h, library, _ := libraryServer(t)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"diagram":"Order flow","project":"Demo"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := libraryPath(t, rec); got != "Demo/Order flow.drawit.kdl" {
		t.Fatalf("path = %q", got)
	}
	if got := readFile(t, filepath.Join(library, "Demo", "Order flow.drawit.kdl")); got != "diagram version=1\n" {
		t.Fatalf("content = %q", got)
	}
}

func TestADiagramNeedsAnExistingProject(t *testing.T) {
	h, library, _ := libraryServer(t)

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"diagram":"Notes","project":"Missing"}`))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(library, "Missing")); !os.IsNotExist(err) {
		t.Fatalf("Missing was created: %v", err)
	}
}

func TestLibraryNamesAreLimited(t *testing.T) {
	h, library, _ := libraryServer(t)
	long := strings.Repeat("a", 256)
	cases := []string{
		`{"project":""}`,
		`{"project":".hidden"}`,
		`{"project":"a/b"}`,
		`{"project":"CON"}`,
		`{"project":"lpt3"}`,
		`{"project":"` + long + `"}`,
		`{"project":"bad name!"}`,
		`{"diagram":"COM1","project":"Demo"}`,
	}
	for _, body := range cases {
		rec := do(h, http.MethodPost, "/api/library", strings.NewReader(body))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", body, rec.Code)
		}
	}
	if entries, err := os.ReadDir(library); err != nil || len(entries) != 0 {
		t.Fatalf("library = %v, %v", names(entries), err)
	}

	ok := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"project":"Café"}`))
	if ok.Code != http.StatusOK {
		t.Fatalf("Café status = %d, body %s", ok.Code, ok.Body.String())
	}
}

func TestRenameDiagramKeepsItsContents(t *testing.T) {
	h, library, _ := libraryServer(t)
	if err := os.Mkdir(filepath.Join(library, "Drafts"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Drafts", "Untitled.drawit.kdl"), "diagram version=1\n")
	writeFile(t, filepath.Join(library, "Drafts", "Other.drawit.kdl"), "other")

	clash := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"from":"Drafts/Untitled.drawit.kdl","to":"other"}`))
	if clash.Code != http.StatusConflict {
		t.Fatalf("clash status = %d, body %s", clash.Code, clash.Body.String())
	}
	if got := readFile(t, filepath.Join(library, "Drafts", "Untitled.drawit.kdl")); got != "diagram version=1\n" {
		t.Fatalf("source after clash = %q", got)
	}

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"from":"Drafts/Untitled.drawit.kdl","to":"Notes"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := libraryPath(t, rec); got != "Drafts/Notes.drawit.kdl" {
		t.Fatalf("path = %q", got)
	}
	if got := readFile(t, filepath.Join(library, "Drafts", "Notes.drawit.kdl")); got != "diagram version=1\n" {
		t.Fatalf("content = %q", got)
	}
	if _, err := os.Stat(filepath.Join(library, "Drafts", "Untitled.drawit.kdl")); !os.IsNotExist(err) {
		t.Fatalf("old name still present: %v", err)
	}
}

func TestALibraryChangeNamesOneAction(t *testing.T) {
	h, _, _ := libraryServer(t)
	for _, body := range []string{`{}`, `{"project":"A","draft":true}`, `{"from":"A"}`, `{`} {
		rec := do(h, http.MethodPost, "/api/library", strings.NewReader(body))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", body, rec.Code)
		}
	}
}

func TestLibraryRoutesNeedALibrary(t *testing.T) {
	h, _ := newServer(t)
	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"project":"Demo"}`))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
}

func libraryServer(t *testing.T) (http.Handler, string, string) {
	t.Helper()
	library := filepath.Join(t.TempDir(), "DrawIt")
	if err := os.Mkdir(library, 0o755); err != nil {
		t.Fatal(err)
	}
	opened := t.TempDir()
	root, err := os.OpenRoot(opened)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })
	return New(root, opened, library, nil, nil, testConfig), library, opened
}

func libraryPath(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var view struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	return view.Path
}

func names(entries []os.DirEntry) []string {
	out := make([]string, len(entries))
	for i, entry := range entries {
		out[i] = entry.Name()
	}
	return out
}
