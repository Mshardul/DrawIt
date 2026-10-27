package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

const (
	testHost  = "127.0.0.1:8080"
	testToken = "test-token-0123456789"
)

var testConfig = Config{Token: testToken, Hosts: []string{testHost, "localhost:8080"}}

// newServer serves a fresh temp folder. The returned dir is the opened folder; its parent is
// the "outside" that the server must never touch.
func newServer(t *testing.T) (http.Handler, string) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "workspace")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })
	assets := fstest.MapFS{"index.html": {Data: []byte("<title>DrawIt</title>")}}
	return New(root, assets, testConfig), dir
}

// do sends a request as the app would: right Host, right token.
func do(h http.Handler, method, target string, body io.Reader) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, body)
	req.Host = testHost
	req.Header.Set("Authorization", "Bearer "+testToken)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

type listing struct {
	Files []struct {
		Path     string `json:"path"`
		Size     int64  `json:"size"`
		Modified string `json:"modified"`
	} `json:"files"`
}

func TestListReturnsFilesRecursivelyInOrder(t *testing.T) {
	h, dir := newServer(t)
	writeFile(t, filepath.Join(dir, "b.drawit.kdl"), "bb")
	writeFile(t, filepath.Join(dir, "a.drawit.kdl"), "a")
	writeFile(t, filepath.Join(dir, "assets", "logo.svg"), "<svg/>")
	if err := os.Mkdir(filepath.Join(dir, "empty"), 0o755); err != nil {
		t.Fatal(err)
	}

	rec := do(h, http.MethodGet, "/api/files", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type = %q, want JSON", ct)
	}
	var got listing
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	var paths []string
	for _, f := range got.Files {
		paths = append(paths, f.Path)
		if f.Modified == "" {
			t.Errorf("%s has no modified time", f.Path)
		}
	}
	want := "a.drawit.kdl,assets/logo.svg,b.drawit.kdl"
	if strings.Join(paths, ",") != want {
		t.Fatalf("paths = %v, want %s", paths, want)
	}
	if got.Files[2].Size != 2 {
		t.Fatalf("size of b.drawit.kdl = %d, want 2", got.Files[2].Size)
	}
}

func TestListOfEmptyFolderIsAnEmptyArray(t *testing.T) {
	h, _ := newServer(t)
	rec := do(h, http.MethodGet, "/api/files", nil)
	if body := strings.TrimSpace(rec.Body.String()); body != `{"files":[]}` {
		t.Fatalf("body = %s, want {\"files\":[]}", body)
	}
}

func TestReadReturnsFileBytes(t *testing.T) {
	h, dir := newServer(t)
	writeFile(t, filepath.Join(dir, "sub", "a.drawit.kdl"), "diagram version=1\n")

	rec := do(h, http.MethodGet, "/api/file?path=sub/a.drawit.kdl", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if rec.Body.String() != "diagram version=1\n" {
		t.Fatalf("body = %q", rec.Body.String())
	}
}

func TestReadOfMissingFileIs404(t *testing.T) {
	h, _ := newServer(t)
	if rec := do(h, http.MethodGet, "/api/file?path=nope.drawit.kdl", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestReadOfDirectoryIsRefused(t *testing.T) {
	h, dir := newServer(t)
	if err := os.Mkdir(filepath.Join(dir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if rec := do(h, http.MethodGet, "/api/file?path=sub", nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestWriteCreatesAndReplacesAFile(t *testing.T) {
	h, dir := newServer(t)

	if rec := do(h, http.MethodPut, "/api/file?path=a.drawit.kdl", strings.NewReader("one")); rec.Code != http.StatusNoContent {
		t.Fatalf("create status = %d, want 204", rec.Code)
	}
	if got := readFile(t, filepath.Join(dir, "a.drawit.kdl")); got != "one" {
		t.Fatalf("content = %q, want one", got)
	}
	if rec := do(h, http.MethodPut, "/api/file?path=a.drawit.kdl", strings.NewReader("two")); rec.Code != http.StatusNoContent {
		t.Fatalf("replace status = %d, want 204", rec.Code)
	}
	if got := readFile(t, filepath.Join(dir, "a.drawit.kdl")); got != "two" {
		t.Fatalf("content = %q, want two", got)
	}
}

func TestWriteCreatesMissingFolders(t *testing.T) {
	h, dir := newServer(t)
	if rec := do(h, http.MethodPut, "/api/file?path=assets/img/a.svg", strings.NewReader("<svg/>")); rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if got := readFile(t, filepath.Join(dir, "assets", "img", "a.svg")); got != "<svg/>" {
		t.Fatalf("content = %q", got)
	}
}

func TestWriteLeavesNoTemporaryFiles(t *testing.T) {
	h, dir := newServer(t)
	do(h, http.MethodPut, "/api/file?path=a.drawit.kdl", strings.NewReader("one"))
	do(h, http.MethodPut, "/api/file?path=a.drawit.kdl", strings.NewReader("two"))

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "a.drawit.kdl" {
		t.Fatalf("folder holds %v, want only a.drawit.kdl", entries)
	}
}

// failingBody delivers some bytes, then fails, like a connection dropped mid-upload.
type failingBody struct{ sent bool }

func (b *failingBody) Read(p []byte) (int, error) {
	if !b.sent {
		b.sent = true
		return copy(p, "half of the new con"), nil
	}
	return 0, errors.New("connection reset")
}

func TestFailedWriteKeepsTheOldFileAndLeavesNoTemporaryFiles(t *testing.T) {
	h, dir := newServer(t)
	writeFile(t, filepath.Join(dir, "a.drawit.kdl"), "original")

	rec := do(h, http.MethodPut, "/api/file?path=a.drawit.kdl", &failingBody{})
	if rec.Code < 400 {
		t.Fatalf("status = %d, want an error", rec.Code)
	}
	if got := readFile(t, filepath.Join(dir, "a.drawit.kdl")); got != "original" {
		t.Fatalf("content = %q, want original", got)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("folder holds %v, want only a.drawit.kdl", entries)
	}
}

func TestWriteOverADirectoryIsRefused(t *testing.T) {
	h, dir := newServer(t)
	if err := os.Mkdir(filepath.Join(dir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	rec := do(h, http.MethodPut, "/api/file?path=sub", strings.NewReader("x"))
	if rec.Code < 400 || rec.Code >= 500 {
		t.Fatalf("status = %d, want a 4xx", rec.Code)
	}
}

func TestPathsOutsideTheFolderAreRefused(t *testing.T) {
	h, dir := newServer(t)
	outside := filepath.Join(filepath.Dir(dir), "secret.txt")
	writeFile(t, outside, "secret")

	for _, p := range []string{"../secret.txt", "sub/../../secret.txt", "..", outside, "/etc/passwd", "", "."} {
		target := "/api/file?path=" + strings.ReplaceAll(p, " ", "%20")
		if rec := do(h, http.MethodGet, target, nil); rec.Code != http.StatusBadRequest {
			t.Errorf("GET path %q: status = %d, want 400", p, rec.Code)
		}
		if rec := do(h, http.MethodPut, target, strings.NewReader("overwritten")); rec.Code != http.StatusBadRequest {
			t.Errorf("PUT path %q: status = %d, want 400", p, rec.Code)
		}
	}
	if got := readFile(t, outside); got != "secret" {
		t.Fatalf("outside file changed to %q", got)
	}
}

func TestMissingPathParameterIsRefused(t *testing.T) {
	h, _ := newServer(t)
	if rec := do(h, http.MethodGet, "/api/file", nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func symlink(t *testing.T, target, link string) {
	t.Helper()
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("cannot create symlinks here: %v", err)
	}
}

func TestSymlinkLeadingOutsideCannotBeRead(t *testing.T) {
	h, dir := newServer(t)
	outside := filepath.Join(filepath.Dir(dir), "secret.txt")
	writeFile(t, outside, "secret")
	symlink(t, outside, filepath.Join(dir, "link.txt"))
	symlink(t, filepath.Dir(dir), filepath.Join(dir, "up"))

	for _, p := range []string{"link.txt", "up/secret.txt"} {
		rec := do(h, http.MethodGet, "/api/file?path="+p, nil)
		if rec.Code < 400 || strings.Contains(rec.Body.String(), "secret") {
			t.Errorf("GET %s: status = %d body = %q, want an error without the content", p, rec.Code, rec.Body.String())
		}
	}
}

func TestWriteThroughSymlinkNeverTouchesTheTarget(t *testing.T) {
	h, dir := newServer(t)
	outside := filepath.Join(filepath.Dir(dir), "secret.txt")
	writeFile(t, outside, "secret")
	symlink(t, outside, filepath.Join(dir, "link.txt"))
	symlink(t, filepath.Dir(dir), filepath.Join(dir, "up"))

	do(h, http.MethodPut, "/api/file?path=link.txt", strings.NewReader("overwritten"))
	do(h, http.MethodPut, "/api/file?path=up/secret.txt", strings.NewReader("overwritten"))
	do(h, http.MethodPut, "/api/file?path=up/new.txt", strings.NewReader("created"))

	if got := readFile(t, outside); got != "secret" {
		t.Fatalf("outside file changed to %q", got)
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(dir), "new.txt")); err == nil {
		t.Fatal("a file was created outside the folder")
	}
}

func TestListSkipsSymlinks(t *testing.T) {
	h, dir := newServer(t)
	outside := filepath.Join(filepath.Dir(dir), "secret.txt")
	writeFile(t, outside, "secret")
	writeFile(t, filepath.Join(dir, "a.drawit.kdl"), "a")
	symlink(t, outside, filepath.Join(dir, "link.txt"))
	symlink(t, filepath.Dir(dir), filepath.Join(dir, "up"))

	var got listing
	if err := json.Unmarshal(do(h, http.MethodGet, "/api/files", nil).Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Files) != 1 || got.Files[0].Path != "a.drawit.kdl" {
		t.Fatalf("files = %+v, want only a.drawit.kdl", got.Files)
	}
}

func TestUnsupportedMethodsAreRefused(t *testing.T) {
	h, _ := newServer(t)
	for _, c := range []struct{ method, target string }{
		{http.MethodPost, "/api/files"},
		{http.MethodDelete, "/api/file?path=a"},
		{http.MethodPost, "/api/file?path=a"},
	} {
		if rec := do(h, c.method, c.target, nil); rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s %s: status = %d, want 405", c.method, c.target, rec.Code)
		}
	}
}

func TestServesTheEmbeddedApp(t *testing.T) {
	h, _ := newServer(t)
	rec := do(h, http.MethodGet, "/", nil)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "<title>DrawIt</title>") {
		t.Fatalf("GET /: status = %d body = %q", rec.Code, rec.Body.String())
	}
}

func TestUnknownAPIPathIs404NotTheApp(t *testing.T) {
	h, _ := newServer(t)
	if rec := do(h, http.MethodGet, "/api/nothing", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestAppAssetsAreNotReadableAsWorkspaceFiles(t *testing.T) {
	h, dir := newServer(t)
	writeFile(t, filepath.Join(dir, "private.drawit.kdl"), "mine")
	if rec := do(h, http.MethodGet, "/private.drawit.kdl", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404: workspace files are only reachable through /api/file", rec.Code)
	}
}

func readDir(dir string) ([]os.DirEntry, error) { return os.ReadDir(dir) }

func openRoot(t *testing.T, dir string) *os.Root {
	t.Helper()
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })
	return root
}
