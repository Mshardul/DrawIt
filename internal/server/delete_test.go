package server

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Mshardul/DrawIt/internal/trash"
)

func TestDeleteMovesAProjectToTheTrash(t *testing.T) {
	h, library, opened, bin := libraryWithTrash(t, nil)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "a.drawit.kdl"), "keep")
	writeFile(t, filepath.Join(opened, "stay.txt"), "stay")

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"delete":"Demo"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := libraryPath(t, rec); got != "Demo" {
		t.Fatalf("path = %q", got)
	}
	if _, err := os.Stat(filepath.Join(library, "Demo")); !os.IsNotExist(err) {
		t.Fatalf("project still in the library: %v", err)
	}
	if got := readFile(t, filepath.Join(bin, "Demo", "a.drawit.kdl")); got != "keep" {
		t.Fatalf("trashed content = %q", got)
	}
	if got := readFile(t, filepath.Join(opened, "stay.txt")); got != "stay" {
		t.Fatalf("served folder changed to %q", got)
	}
}

func TestDeleteMovesADiagramToTheTrash(t *testing.T) {
	h, library, _, bin := libraryWithTrash(t, nil)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "a.drawit.kdl"), "keep")
	writeFile(t, filepath.Join(library, "Demo", "b.drawit.kdl"), "other")

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"delete":"Demo/a.drawit.kdl"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := libraryPath(t, rec); got != "Demo/a.drawit.kdl" {
		t.Fatalf("path = %q", got)
	}
	if _, err := os.Stat(filepath.Join(library, "Demo", "a.drawit.kdl")); !os.IsNotExist(err) {
		t.Fatalf("diagram still in the project: %v", err)
	}
	if got := readFile(t, filepath.Join(bin, "a.drawit.kdl")); got != "keep" {
		t.Fatalf("trashed content = %q", got)
	}
	if got := readFile(t, filepath.Join(library, "Demo", "b.drawit.kdl")); got != "other" {
		t.Fatalf("other diagram = %q", got)
	}
}

func TestDeleteWithoutATrashLeavesTheItem(t *testing.T) {
	h, library, _, bin := libraryWithTrash(t, trash.ErrNoTrash)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "a.drawit.kdl"), "keep")

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"delete":"Demo"}`))
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "no trash") {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := readFile(t, filepath.Join(library, "Demo", "a.drawit.kdl")); got != "keep" {
		t.Fatalf("content = %q", got)
	}
	if _, err := os.Stat(filepath.Join(bin, "Demo")); !os.IsNotExist(err) {
		t.Fatalf("trash received the project: %v", err)
	}
}

func TestDeleteWithoutATrashRemovesTheItemWhenConfirmed(t *testing.T) {
	h, library, _, bin := libraryWithTrash(t, trash.ErrNoTrash)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "a.drawit.kdl"), "keep")

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"delete":"Demo","noTrash":true}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(library, "Demo")); !os.IsNotExist(err) {
		t.Fatalf("project still in the library: %v", err)
	}
	if _, err := os.Stat(filepath.Join(bin, "Demo")); !os.IsNotExist(err) {
		t.Fatalf("trash received the project: %v", err)
	}
}

func TestConfirmingDoesNotSkipAWorkingTrash(t *testing.T) {
	h, library, _, bin := libraryWithTrash(t, nil)
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "a.drawit.kdl"), "keep")

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"delete":"Demo","noTrash":true}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := readFile(t, filepath.Join(bin, "Demo", "a.drawit.kdl")); got != "keep" {
		t.Fatalf("trashed content = %q", got)
	}
}

func TestATrashFailureLeavesTheItem(t *testing.T) {
	h, library, _, _ := libraryWithTrash(t, errors.New("disk"))
	if err := os.Mkdir(filepath.Join(library, "Demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "a.drawit.kdl"), "keep")

	rec := do(h, http.MethodPost, "/api/library", strings.NewReader(`{"delete":"Demo"}`))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := readFile(t, filepath.Join(library, "Demo", "a.drawit.kdl")); got != "keep" {
		t.Fatalf("content = %q", got)
	}
}

func TestDeleteRefusesWhatIsNotAProjectOrADiagram(t *testing.T) {
	h, library, _, bin := libraryWithTrash(t, nil)
	if err := os.MkdirAll(filepath.Join(library, "Demo", "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(library, "Demo", "notes.txt"), "keep")
	writeFile(t, filepath.Join(library, "Demo", "a.drawit.kdl"), "keep")
	outside := filepath.Join(t.TempDir(), "outside")
	writeFile(t, outside, "out")

	cases := []struct {
		body string
		code int
	}{
		{`{"delete":"../outside"}`, http.StatusBadRequest},
		{`{"delete":"Demo/notes.txt"}`, http.StatusBadRequest},
		{`{"delete":"Demo/assets"}`, http.StatusBadRequest},
		{`{"delete":"Demo/sub/a.drawit.kdl"}`, http.StatusBadRequest},
		{`{"delete":"Missing"}`, http.StatusNotFound},
		{`{"delete":"Demo","project":"Demo"}`, http.StatusBadRequest},
	}
	for _, tc := range cases {
		rec := do(h, http.MethodPost, "/api/library", strings.NewReader(tc.body))
		if rec.Code != tc.code {
			t.Errorf("%s: status = %d, want %d, body %s", tc.body, rec.Code, tc.code, rec.Body.String())
		}
	}
	if got := readFile(t, filepath.Join(library, "Demo", "a.drawit.kdl")); got != "keep" {
		t.Fatalf("diagram = %q", got)
	}
	if got := readFile(t, outside); got != "out" {
		t.Fatalf("outside = %q", got)
	}
	entries, err := os.ReadDir(bin)
	if err != nil || len(entries) != 0 {
		t.Fatalf("trash = %v, %v", entries, err)
	}
}

func libraryWithTrash(t *testing.T, fail error) (http.Handler, string, string, string) {
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
	bin := t.TempDir()
	cfg := testConfig
	cfg.Trash = func(path string) error {
		if fail != nil {
			return fail
		}
		return os.Rename(path, filepath.Join(bin, filepath.Base(path)))
	}
	return New(root, opened, library, nil, nil, cfg), library, opened, bin
}
