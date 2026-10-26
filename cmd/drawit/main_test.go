package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// start runs the app in the background and returns the URL it reported to the browser opener,
// or "" when it never opened one. stop shuts it down and returns run's error.
func start(t *testing.T, args ...string) (url string, out *bytes.Buffer, stop func() error) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	out = &bytes.Buffer{}
	opened := make(chan string, 1)
	ready := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		done <- run(ctx, args, out, func(u string) error {
			opened <- u
			return nil
		}, func() { close(ready) })
	}()
	select {
	case <-ready:
	case err := <-done:
		cancel()
		t.Fatalf("run returned before serving: %v", err)
	case <-time.After(5 * time.Second):
		cancel()
		t.Fatal("run did not start serving")
	}
	select {
	case url = <-opened:
	default:
	}
	return url, out, func() error {
		cancel()
		select {
		case err := <-done:
			return err
		case <-time.After(5 * time.Second):
			t.Fatal("run did not stop")
			return nil
		}
	}
}

func folderWithFile(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.drawit.kdl"), []byte("diagram version=1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

// split separates the URL the browser is sent to into the server address and the session token
// from its fragment.
func split(t *testing.T, url string) (base, token string) {
	t.Helper()
	base, token, found := strings.Cut(url, "#")
	if !found || token == "" {
		t.Fatalf("URL %q carries no token in its fragment", url)
	}
	return base, token
}

func request(t *testing.T, method, url, token string, body io.Reader) (int, string, http.Header) {
	t.Helper()
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b), resp.Header
}

// get fetches `api/...` or any path below the URL the browser was sent to, with its token.
func get(t *testing.T, url, path string) string {
	t.Helper()
	base, token := split(t, url)
	_, body, _ := request(t, http.MethodGet, base+path, token, nil)
	return body
}

func TestT019_RunServesTheFolderAndOpensTheBrowser(t *testing.T) {
	url, out, stop := start(t, "-addr", "127.0.0.1:0", folderWithFile(t))

	if !strings.HasPrefix(url, "http://") {
		t.Fatalf("browser opened %q, want an http URL", url)
	}
	if !strings.Contains(out.String(), url) {
		t.Fatalf("output %q does not tell the URL %s", out.String(), url)
	}
	var listing struct {
		Files []struct{ Path string } `json:"files"`
	}
	if err := json.Unmarshal([]byte(get(t, url, "api/files")), &listing); err != nil {
		t.Fatal(err)
	}
	if len(listing.Files) != 1 || listing.Files[0].Path != "a.drawit.kdl" {
		t.Fatalf("files = %+v", listing.Files)
	}
	if err := stop(); err != nil {
		t.Fatalf("run returned %v on shutdown", err)
	}
}

func TestT019_RunWritesFilesIntoTheFolder(t *testing.T) {
	dir := folderWithFile(t)
	url, _, stop := start(t, "-addr", "127.0.0.1:0", dir)
	defer func() { _ = stop() }()

	base, token := split(t, url)
	if status, _, _ := request(t, http.MethodPut, base+"api/file?path=b.drawit.kdl", token, strings.NewReader("new")); status != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", status)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "b.drawit.kdl")); string(b) != "new" {
		t.Fatalf("file holds %q", b)
	}
}

func TestT019_RunWithNoBrowserFlagDoesNotOpenOne(t *testing.T) {
	url, out, stop := start(t, "-addr", "127.0.0.1:0", "-no-browser", folderWithFile(t))
	defer func() { _ = stop() }()

	if url != "" {
		t.Fatalf("browser opened %q, want none", url)
	}
	if !strings.Contains(out.String(), "http://") {
		t.Fatalf("output %q does not tell the URL", out.String())
	}
}

func TestT019_RunDefaultsToTheCurrentFolder(t *testing.T) {
	t.Chdir(folderWithFile(t))
	url, _, stop := start(t, "-addr", "127.0.0.1:0")
	defer func() { _ = stop() }()

	if !strings.Contains(get(t, url, "api/files"), "a.drawit.kdl") {
		t.Fatal("the current folder was not served")
	}
}

func TestT019_RunRefusesAFolderThatDoesNotExist(t *testing.T) {
	err := run(context.Background(), []string{"-addr", "127.0.0.1:0", filepath.Join(t.TempDir(), "missing")}, io.Discard, nil, nil)
	if err == nil {
		t.Fatal("run succeeded for a missing folder")
	}
}

func TestT019_RunRefusesAFileInsteadOfAFolder(t *testing.T) {
	file := filepath.Join(folderWithFile(t), "a.drawit.kdl")
	if err := run(context.Background(), []string{"-addr", "127.0.0.1:0", file}, io.Discard, nil, nil); err == nil {
		t.Fatal("run succeeded for a file")
	}
}

func TestT019_RunRefusesMoreThanOneFolder(t *testing.T) {
	err := run(context.Background(), []string{"-addr", "127.0.0.1:0", t.TempDir(), t.TempDir()}, io.Discard, nil, nil)
	if err == nil {
		t.Fatal("run accepted two folders")
	}
}

func TestT020_RunRefusesAddressesOffTheLoopback(t *testing.T) {
	for _, addr := range []string{"0.0.0.0:0", ":0", "[::]:0", "[::1]:0", "localhost:0", "192.168.1.5:0", "127.0.0.2:0", "example.com:80"} {
		err := run(context.Background(), []string{"-addr", addr, t.TempDir()}, io.Discard, nil, nil)
		if err == nil {
			t.Errorf("run accepted -addr %s", addr)
		}
	}
}

func TestT020_RunListensOn127001ByDefault(t *testing.T) {
	url, _, stop := start(t, t.TempDir())
	defer func() { _ = stop() }()
	if !strings.HasPrefix(url, "http://127.0.0.1:") {
		t.Fatalf("URL = %q, want one on 127.0.0.1", url)
	}
}

func TestT020_TheTokenTravelsInTheURLFragment(t *testing.T) {
	url, out, stop := start(t, "-addr", "127.0.0.1:0", folderWithFile(t))
	defer func() { _ = stop() }()

	base, token := split(t, url)
	if len(token) < 43 { // 256 bits in base64
		t.Fatalf("token %q is shorter than 256 bits", token)
	}
	if strings.ContainsAny(base, "?") || strings.Contains(base, token) {
		t.Fatalf("token leaks outside the fragment: %q", url)
	}
	if !strings.Contains(out.String(), url) {
		t.Fatalf("output %q does not print the full URL %s", out.String(), url)
	}
}

func TestT020_EachRunHasItsOwnToken(t *testing.T) {
	first, _, stopFirst := start(t, "-addr", "127.0.0.1:0", t.TempDir())
	defer func() { _ = stopFirst() }()
	second, _, stopSecond := start(t, "-addr", "127.0.0.1:0", t.TempDir())
	defer func() { _ = stopSecond() }()

	_, a := split(t, first)
	_, b := split(t, second)
	if a == b {
		t.Fatalf("two runs share the token %q", a)
	}
}

func TestT020_ARunningServerRefusesRequestsWithoutTheToken(t *testing.T) {
	url, _, stop := start(t, "-addr", "127.0.0.1:0", folderWithFile(t))
	defer func() { _ = stop() }()
	base, token := split(t, url)

	if status, _, _ := request(t, http.MethodGet, base+"api/files", "", nil); status != http.StatusForbidden {
		t.Errorf("no token: status = %d, want 403", status)
	}
	if status, _, _ := request(t, http.MethodGet, base+"api/files", token+"x", nil); status != http.StatusForbidden {
		t.Errorf("wrong token: status = %d, want 403", status)
	}
	if status, _, _ := request(t, http.MethodGet, base+"api/files", token, nil); status != http.StatusOK {
		t.Errorf("right token: status = %d, want 200", status)
	}
}

func TestT020_ARunningServerRefusesAForeignHostAndOrigin(t *testing.T) {
	url, _, stop := start(t, "-addr", "127.0.0.1:0", folderWithFile(t))
	defer func() { _ = stop() }()
	base, token := split(t, url)

	for name, set := range map[string]func(*http.Request){
		"host":   func(r *http.Request) { r.Host = "evil.example" },
		"origin": func(r *http.Request) { r.Header.Set("Origin", "http://evil.example") },
	} {
		req, err := http.NewRequest(http.MethodGet, base+"api/files", nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Authorization", "Bearer "+token)
		set(req)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("foreign %s: status = %d, want 403", name, resp.StatusCode)
		}
	}
}

func TestT020_ARunningServerSendsSecurityHeaders(t *testing.T) {
	url, _, stop := start(t, "-addr", "127.0.0.1:0", folderWithFile(t))
	defer func() { _ = stop() }()
	base, _ := split(t, url)

	_, _, header := request(t, http.MethodGet, base, "", nil)
	if !strings.Contains(header.Get("Content-Security-Policy"), "connect-src 'self'") {
		t.Errorf("CSP = %q", header.Get("Content-Security-Policy"))
	}
	if header.Get("Referrer-Policy") != "no-referrer" {
		t.Errorf("Referrer-Policy = %q", header.Get("Referrer-Policy"))
	}
}

func TestT019_RunStopsEvenWhenAConnectionStaysOpen(t *testing.T) {
	url, _, stop := start(t, "-addr", "127.0.0.1:0", t.TempDir())
	base, _ := split(t, url)
	// A client that connected and sent nothing, like a browser's spare connection.
	conn, err := net.Dial("tcp", strings.TrimSuffix(strings.TrimPrefix(base, "http://"), "/"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	time.Sleep(200 * time.Millisecond) // let the server accept it

	began := time.Now()
	if err := stop(); err != nil {
		t.Fatalf("run returned %v on shutdown", err)
	}
	if took := time.Since(began); took > 3*time.Second {
		t.Fatalf("shutdown took %v", took)
	}
}
