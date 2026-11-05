package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestImportRenamesAClash(t *testing.T) {
	h, library, _ := libraryServer(t)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "a.drawit.kdl"), "keep")

	body := importBody(t, "Demo", []importPart{
		{"a.drawit.kdl", []byte("one")},
		{"a.drawit.kdl", []byte("two")},
		{"assets/logo.png", []byte{1, 2, 3}},
	})
	rec := do(h, http.MethodPost, "/api/library/import", bytes.NewReader(body))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var view struct {
		Paths []string `json:"paths"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	want := []string{"Demo/a 2.drawit.kdl", "Demo/a 3.drawit.kdl", "Demo/assets/logo.png"}
	if strings.Join(view.Paths, ",") != strings.Join(want, ",") {
		t.Fatalf("paths = %v", view.Paths)
	}
	if got := readFile(t, filepath.Join(library, "Demo", "a.drawit.kdl")); got != "keep" {
		t.Fatalf("original = %q", got)
	}
	if got := readFile(t, filepath.Join(library, "Demo", "a 2.drawit.kdl")); got != "one" {
		t.Fatalf("first = %q", got)
	}
	if got := readFile(t, filepath.Join(library, "Demo", "a 3.drawit.kdl")); got != "two" {
		t.Fatalf("second = %q", got)
	}
	if got := readFile(t, filepath.Join(library, "Demo", "assets", "logo.png")); got != string([]byte{1, 2, 3}) {
		t.Fatalf("logo = %q", got)
	}
}

func TestImportRefusesAPathThatLeavesTheProject(t *testing.T) {
	h, library, opened := libraryServer(t)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "a.drawit.kdl"), "keep")

	for _, path := range []string{"../out.drawit.kdl", "assets/nested/logo.png", "/etc/passwd"} {
		body := importBody(t, "Demo", []importPart{{path, []byte("x")}})
		rec := do(h, http.MethodPost, "/api/library/import", bytes.NewReader(body))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, body %s", path, rec.Code, rec.Body.String())
		}
	}
	if got := readFile(t, filepath.Join(library, "Demo", "a.drawit.kdl")); got != "keep" {
		t.Fatalf("original = %q", got)
	}
	if _, err := os.Stat(filepath.Join(opened, "out.drawit.kdl")); !os.IsNotExist(err) {
		t.Fatalf("import wrote outside the library: %v", err)
	}
}

func TestImportRefusesAFileOverTheLimit(t *testing.T) {
	h, library, _ := libraryServer(t)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	body := importBody(t, "Demo", []importPart{{"big.bin", bytes.Repeat([]byte("x"), MaxFileBytes+1)}})
	rec := do(h, http.MethodPost, "/api/library/import", bytes.NewReader(body))
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(library, "Demo", "big.bin")); !os.IsNotExist(err) {
		t.Fatalf("big.bin exists: %v", err)
	}
}

func TestCopyPutsAFileUnderAFreeName(t *testing.T) {
	h, library, _ := libraryServer(t)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(library, "Other"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "a.drawit.kdl"), "keep")
	writeFile(t, filepath.Join(library, "Demo", "assets", "logo.png"), "png")

	first := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"copy":"Demo/a.drawit.kdl","into":"Other"}`))
	if first.Code != http.StatusOK || libraryPath(t, first) != "Other/a.drawit.kdl" {
		t.Fatalf("first = %d %s", first.Code, first.Body.String())
	}
	second := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"copy":"Demo/a.drawit.kdl","into":"Other"}`))
	if second.Code != http.StatusOK || libraryPath(t, second) != "Other/a 2.drawit.kdl" {
		t.Fatalf("second = %d %s", second.Code, second.Body.String())
	}
	asset := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"copy":"Demo/assets/logo.png","into":"Other/assets"}`))
	if asset.Code != http.StatusOK || libraryPath(t, asset) != "Other/assets/logo.png" {
		t.Fatalf("asset = %d %s", asset.Code, asset.Body.String())
	}
	if got := readFile(t, filepath.Join(library, "Other", "assets", "logo.png")); got != "png" {
		t.Fatalf("copied logo = %q", got)
	}
	if got := readFile(t, filepath.Join(library, "Demo", "a.drawit.kdl")); got != "keep" {
		t.Fatalf("source = %q", got)
	}
}

func TestLibraryFileReadAndReplace(t *testing.T) {
	h, library, _ := libraryServer(t)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "a.drawit.kdl"), "keep")

	rec := do(h, http.MethodGet, "/api/library/file?path=Demo/a.drawit.kdl", nil)
	if rec.Code != http.StatusOK || rec.Body.String() != "keep" {
		t.Fatalf("read = %d %q", rec.Code, rec.Body.String())
	}
	wrote := do(h, http.MethodPut, "/api/library/file?path=Demo/a.drawit.kdl", strings.NewReader("next"))
	if wrote.Code != http.StatusOK {
		t.Fatalf("write = %d %s", wrote.Code, wrote.Body.String())
	}
	if got := readFile(t, filepath.Join(library, "Demo", "a.drawit.kdl")); got != "next" {
		t.Fatalf("replaced = %q", got)
	}
	missing := do(h, http.MethodPut, "/api/library/file?path=Demo/missing.drawit.kdl", strings.NewReader("x"))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing = %d %s", missing.Code, missing.Body.String())
	}
}

type importPart struct {
	path string
	data []byte
}

func importBody(t *testing.T, project string, parts []importPart) []byte {
	t.Helper()
	files := make([]map[string]any, len(parts))
	for i, part := range parts {
		files[i] = map[string]any{"path": part.path, "data": part.data}
	}
	body, err := json.Marshal(map[string]any{"project": project, "files": files})
	if err != nil {
		t.Fatal(err)
	}
	return body
}
