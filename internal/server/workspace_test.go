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

func TestTheOpenFolderIsReportedWithItsKind(t *testing.T) {
	h, dir := newServer(t)
	view := current(t, h)
	if view.ID == "" || view.Kind != kindOpened || view.Path != dir {
		t.Fatalf("workspace = %+v, want opened %s", view, dir)
	}
}

func TestSwitchingFolderRetiresThePreviousId(t *testing.T) {
	h, dir := newServer(t)
	writeFile(t, filepath.Join(dir, "a.drawit.kdl"), "a")
	first := current(t, h)

	other := t.TempDir()
	writeFile(t, filepath.Join(other, "b.drawit.kdl"), "b")
	next := openFolder(t, h, map[string]string{"folder": other})
	if next.ID == "" || next.ID == first.ID || next.Kind != kindOpened || next.Path != other {
		t.Fatalf("opened = %+v, previous %s", next, first.ID)
	}
	if body := do(h, http.MethodGet, "/api/files", nil).Body.String(); !strings.Contains(body, "b.drawit.kdl") || strings.Contains(body, "a.drawit.kdl") {
		t.Fatalf("files = %s", body)
	}

	rec := send(h, http.MethodPut, "/api/file?path=nope.txt", testHost, map[string]string{
		"Authorization": "Bearer " + testToken,
		WorkspaceHeader: first.ID,
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("stale write status = %d, want 409", rec.Code)
	}
	if _, err := os.Stat(filepath.Join(other, "nope.txt")); !os.IsNotExist(err) {
		t.Fatalf("stale write created a file: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "nope.txt")); !os.IsNotExist(err) {
		t.Fatalf("stale write created a file in the old folder: %v", err)
	}
}

func TestAFileRequestWithoutTheWorkspaceIdIsRefused(t *testing.T) {
	h, _ := newServer(t)
	rec := send(h, http.MethodGet, "/api/files", testHost, bearer(testToken))
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
}

func TestAMissingFolderDoesNotReplaceTheOpenOne(t *testing.T) {
	h, dir := newServer(t)
	before := current(t, h)
	missing, err := json.Marshal(map[string]string{"folder": filepath.Join(t.TempDir(), "missing")})
	if err != nil {
		t.Fatal(err)
	}
	rec := do(h, http.MethodPost, "/api/workspace", strings.NewReader(string(missing)))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	after := current(t, h)
	if after.ID != before.ID || after.Path != dir {
		t.Fatalf("workspace changed from %+v to %+v", before, after)
	}
}

func TestLibraryProjectAndOpenedFolder(t *testing.T) {
	library := filepath.Join(t.TempDir(), "DrawIt")
	project := filepath.Join(library, "Demo")
	nested := filepath.Join(project, "notes")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(project, "a.drawit.kdl"), "a")
	outside := t.TempDir()
	root, err := os.OpenRoot(outside)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })
	h := New(root, outside, library, nil, nil, testConfig)

	lib := openFolder(t, h, map[string]bool{"library": true})
	if lib.Kind != kindLibrary || lib.Path != library {
		t.Fatalf("library = %+v", lib)
	}
	proj := openFolder(t, h, map[string]string{"project": "Demo"})
	if proj.Kind != kindProject || proj.Path != project {
		t.Fatalf("project = %+v", proj)
	}
	if body := do(h, http.MethodGet, "/api/files", nil).Body.String(); !strings.Contains(body, "a.drawit.kdl") {
		t.Fatalf("project files = %s", body)
	}
	deep := openFolder(t, h, map[string]string{"folder": nested})
	if deep.Kind != kindProject || deep.Path != nested {
		t.Fatalf("nested = %+v", deep)
	}
	opened := openFolder(t, h, map[string]string{"folder": outside})
	if opened.Kind != kindOpened || opened.Path != outside {
		t.Fatalf("opened = %+v", opened)
	}
}

func TestOpeningAFileServesItsFolder(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "a.drawit.kdl")
	writeFile(t, file, "a")
	h, _ := newServer(t)
	view := openFolder(t, h, map[string]string{"file": file})
	if view.Kind != kindOpened || view.Path != dir {
		t.Fatalf("workspace = %+v, want %s", view, dir)
	}
	if !strings.Contains(do(h, http.MethodGet, "/api/files", nil).Body.String(), "a.drawit.kdl") {
		t.Fatal("the file's folder was not served")
	}
}

func TestAProjectNameCannotLeaveTheLibrary(t *testing.T) {
	library := t.TempDir()
	root, err := os.OpenRoot(library)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })
	h := New(root, library, library, nil, nil, testConfig)
	before := current(t, h)
	rec := do(h, http.MethodPost, "/api/workspace", strings.NewReader(`{"project":"../outside"}`))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if after := current(t, h); after.ID != before.ID {
		t.Fatalf("workspace changed to %+v", after)
	}
}

func TestSwitchWaitsUntilTheFileRequestFinishes(t *testing.T) {
	first := t.TempDir()
	second := t.TempDir()
	writeFile(t, filepath.Join(first, "a.txt"), "a")
	root1, err := os.OpenRoot(first)
	if err != nil {
		t.Fatal(err)
	}
	root2, err := os.OpenRoot(second)
	if err != nil {
		t.Fatal(err)
	}
	w := workspace{root: root1, id: "old", path: first, kind: kindOpened}
	held, release, stale := w.borrow("old")
	if stale || held == nil {
		t.Fatal("the open folder was not lent to the request")
	}
	holding := make(chan struct{})
	done := make(chan struct{})
	go func() {
		close(holding)
		w.open(root2, second, kindOpened)
		close(done)
	}()
	<-holding
	select {
	case <-done:
		t.Fatal("the folder was replaced while a request still held it")
	case <-time.After(50 * time.Millisecond):
	}
	f, err := held.Open("a.txt")
	if err != nil {
		t.Fatal(err)
	}
	_ = f.Close()
	release()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("the folder was not replaced after the request finished")
	}
	if _, err := root1.Open("a.txt"); err == nil {
		t.Fatal("the previous folder stayed open")
	}
	if _, _, stale := w.borrow("old"); !stale {
		t.Fatal("the previous id was still accepted")
	}
}

func current(t *testing.T, h http.Handler) workspaceView {
	t.Helper()
	rec := do(h, http.MethodGet, "/api/workspace", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var view workspaceView
	if err := json.Unmarshal(rec.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	return view
}

func openFolder(t *testing.T, h http.Handler, body any) workspaceView {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	rec := do(h, http.MethodPost, "/api/workspace", strings.NewReader(string(raw)))
	if rec.Code != http.StatusOK {
		t.Fatalf("open %s: status = %d, body %s", raw, rec.Code, rec.Body.String())
	}
	var view workspaceView
	if err := json.Unmarshal(rec.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	return view
}
