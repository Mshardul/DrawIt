package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Mshardul/DrawIt/internal/prefs"
	"github.com/Mshardul/DrawIt/internal/server"
)

func start(t *testing.T, args ...string) (url string, out *bytes.Buffer, stop func() error) {
	t.Helper()
	return startWith(t, t.TempDir(), prefs.Open(t.TempDir()), args...)
}

func startWith(t *testing.T, home string, store *prefs.Store, args ...string) (url string, out *bytes.Buffer, stop func() error) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	out = &bytes.Buffer{}
	opened := make(chan string, 1)
	ready := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		done <- runWith(ctx, args, out, func(u string) error {
			opened <- u
			return nil
		}, func() { close(ready) }, home, store)
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
		if id, ok := claimRunning(t, url, token); ok {
			req.Header.Set(server.SessionHeader, id)
			if workspace := workspaceID(t, url, token, id); workspace != "" && fileAPI(url) {
				req.Header.Set(server.WorkspaceHeader, workspace)
			}
		}
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b), resp.Header
}

func fileAPI(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return u.Path == "/api/files" || u.Path == "/api/file"
}

func claimRunning(t *testing.T, raw, token string) (string, bool) {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/api/session"
	u.RawQuery = ""
	u.Fragment = ""
	req, err := http.NewRequest(http.MethodPost, u.String(), strings.NewReader(`{"takeover":true}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", false
	}
	var got struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	return got.ID, got.ID != ""
}

func workspaceID(t *testing.T, raw, token, session string) string {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/api/workspace"
	u.RawQuery = ""
	u.Fragment = ""
	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set(server.SessionHeader, session)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return ""
	}
	var view struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &view); err != nil {
		t.Fatal(err)
	}
	return view.ID
}

func get(t *testing.T, url, path string) string {
	t.Helper()
	base, token := split(t, url)
	_, body, _ := request(t, http.MethodGet, base+path, token, nil)
	return body
}

func TestRunServesTheFolderAndOpensTheBrowser(t *testing.T) {
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

func TestRunWritesFilesIntoTheFolder(t *testing.T) {
	dir := folderWithFile(t)
	url, _, stop := start(t, "-addr", "127.0.0.1:0", dir)
	defer func() { _ = stop() }()

	base, token := split(t, url)
	if status, _, _ := request(t, http.MethodPut, base+"api/file?path=b.drawit.kdl", token, strings.NewReader("new")); status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "b.drawit.kdl")); string(b) != "new" {
		t.Fatalf("file holds %q", b)
	}
}

func TestRunWithNoBrowserFlagDoesNotOpenOne(t *testing.T) {
	url, out, stop := start(t, "-addr", "127.0.0.1:0", "-no-browser", folderWithFile(t))
	defer func() { _ = stop() }()

	if url != "" {
		t.Fatalf("browser opened %q, want none", url)
	}
	if !strings.Contains(out.String(), "http://") {
		t.Fatalf("output %q does not tell the URL", out.String())
	}
}

func TestRunWithNoArgumentsServesNoFolder(t *testing.T) {
	home := t.TempDir()
	t.Chdir(folderWithFile(t))
	url, out, stop := startWith(t, home, prefs.Open(t.TempDir()), "-addr", "127.0.0.1:0")
	defer func() { _ = stop() }()

	base, token := split(t, url)
	status, body, _ := request(t, http.MethodGet, base+"api/files", token, nil)
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, body %s, want no folder", status, body)
	}
	if strings.Contains(body, "a.drawit.kdl") {
		t.Fatalf("the current folder was served: %s", body)
	}
	if strings.Contains(out.String(), "a.drawit.kdl") || strings.Contains(out.String(), "serving .") {
		t.Fatalf("output names a folder: %s", out.String())
	}
	lib := filepath.Join(home, "DrawIt")
	if info, err := os.Stat(lib); err != nil || !info.IsDir() {
		t.Fatalf("library folder: %v", err)
	}
}

func TestRememberedFolderIsServedWhenTheCommandLineHasNone(t *testing.T) {
	dir := folderWithFile(t)
	store := prefs.Open(t.TempDir())
	remember(t, store, dir)
	url, _, stop := startWith(t, t.TempDir(), store, "-addr", "127.0.0.1:0")
	defer func() { _ = stop() }()

	if !strings.Contains(get(t, url, "api/files"), "a.drawit.kdl") {
		t.Fatal("the remembered folder was not served")
	}
}

func TestAMissingRememberedFolderServesNothing(t *testing.T) {
	store := prefs.Open(t.TempDir())
	remember(t, store, filepath.Join(t.TempDir(), "gone"))
	url, _, stop := startWith(t, t.TempDir(), store, "-addr", "127.0.0.1:0")
	defer func() { _ = stop() }()

	base, token := split(t, url)
	if status, _, _ := request(t, http.MethodGet, base+"api/files", token, nil); status != http.StatusNotFound {
		t.Fatalf("status = %d, want no folder", status)
	}
}

func TestARememberedFileServesNothing(t *testing.T) {
	file := filepath.Join(folderWithFile(t), "a.drawit.kdl")
	store := prefs.Open(t.TempDir())
	remember(t, store, file)
	url, _, stop := startWith(t, t.TempDir(), store, "-addr", "127.0.0.1:0")
	defer func() { _ = stop() }()

	base, token := split(t, url)
	if status, _, _ := request(t, http.MethodGet, base+"api/files", token, nil); status != http.StatusNotFound {
		t.Fatalf("status = %d, want no folder", status)
	}
}

func TestTheCommandLineFolderBeatsTheRememberedFolder(t *testing.T) {
	chosen := folderWithFile(t)
	other := t.TempDir()
	if err := os.WriteFile(filepath.Join(other, "b.drawit.kdl"), []byte("b"), 0o644); err != nil {
		t.Fatal(err)
	}
	store := prefs.Open(t.TempDir())
	remember(t, store, other)
	url, _, stop := startWith(t, t.TempDir(), store, "-addr", "127.0.0.1:0", chosen)
	defer func() { _ = stop() }()

	body := get(t, url, "api/files")
	if !strings.Contains(body, "a.drawit.kdl") || strings.Contains(body, "b.drawit.kdl") {
		t.Fatalf("files = %s", body)
	}
}

func TestAnExistingLibraryIsLeftInPlace(t *testing.T) {
	home := t.TempDir()
	marker := filepath.Join(home, "DrawIt", "kept.txt")
	if err := os.MkdirAll(filepath.Dir(marker), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(marker, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, _, stop := startWith(t, home, prefs.Open(t.TempDir()), "-addr", "127.0.0.1:0", "-no-browser")
	defer func() { _ = stop() }()

	if got, err := os.ReadFile(marker); err != nil || string(got) != "keep" {
		t.Fatalf("library file = %q, %v", got, err)
	}
}

func TestUnreadablePreferencesServeNothingAndStayUntouched(t *testing.T) {
	config := t.TempDir()
	path := filepath.Join(config, "preferences.json")
	body := []byte("{not json")
	if err := os.WriteFile(path, body, 0o644); err != nil {
		t.Fatal(err)
	}
	url, _, stop := startWith(t, t.TempDir(), prefs.Open(config), "-addr", "127.0.0.1:0")
	defer func() { _ = stop() }()

	base, token := split(t, url)
	if status, _, _ := request(t, http.MethodGet, base+"api/files", token, nil); status != http.StatusNotFound {
		t.Fatalf("status = %d, want no folder", status)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, body) {
		t.Fatalf("preferences file changed to %q", got)
	}
}

func TestRunOpensTheLibrary(t *testing.T) {
	home := t.TempDir()
	url, _, stop := startWith(t, home, prefs.Open(t.TempDir()), "-addr", "127.0.0.1:0")
	defer func() { _ = stop() }()

	base, token := split(t, url)
	status, body, _ := request(t, http.MethodPost, base+"api/workspace", token, strings.NewReader(`{"library":true}`))
	if status != http.StatusOK {
		t.Fatalf("status = %d, body %s", status, body)
	}
	var view struct {
		Kind string `json:"kind"`
		Path string `json:"path"`
	}
	if err := json.Unmarshal([]byte(body), &view); err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(home, "DrawIt")
	if view.Kind != "library" || view.Path != want {
		t.Fatalf("workspace kind %q path %q, want library %s", view.Kind, view.Path, want)
	}
}

func remember(t *testing.T, store *prefs.Store, folder string) {
	t.Helper()
	body, err := json.Marshal(map[string]any{"workspace": map[string]string{"folder": folder}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Patch(body); err != nil {
		t.Fatal(err)
	}
}

func TestRunRefusesAFolderThatDoesNotExist(t *testing.T) {
	err := run(context.Background(), []string{"-addr", "127.0.0.1:0", filepath.Join(t.TempDir(), "missing")}, io.Discard, nil, nil)
	if err == nil {
		t.Fatal("run succeeded for a missing folder")
	}
}

func TestRunRefusesAFileInsteadOfAFolder(t *testing.T) {
	file := filepath.Join(folderWithFile(t), "a.drawit.kdl")
	if err := run(context.Background(), []string{"-addr", "127.0.0.1:0", file}, io.Discard, nil, nil); err == nil {
		t.Fatal("run succeeded for a file")
	}
}

func TestRunRefusesMoreThanOneFolder(t *testing.T) {
	err := run(context.Background(), []string{"-addr", "127.0.0.1:0", t.TempDir(), t.TempDir()}, io.Discard, nil, nil)
	if err == nil {
		t.Fatal("run accepted two folders")
	}
}

func TestRunRefusesAddressesOffTheLoopback(t *testing.T) {
	for _, addr := range []string{"0.0.0.0:0", ":0", "[::]:0", "[::1]:0", "localhost:0", "192.168.1.5:0", "127.0.0.2:0", "example.com:80"} {
		err := run(context.Background(), []string{"-addr", addr, t.TempDir()}, io.Discard, nil, nil)
		if err == nil {
			t.Errorf("run accepted -addr %s", addr)
		}
	}
}

func TestRunListensOn127001ByDefault(t *testing.T) {
	url, _, stop := start(t, t.TempDir())
	defer func() { _ = stop() }()
	if !strings.HasPrefix(url, "http://127.0.0.1:") {
		t.Fatalf("URL = %q, want one on 127.0.0.1", url)
	}
}

func TestTheTokenTravelsInTheURLFragment(t *testing.T) {
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

func TestEachRunHasItsOwnToken(t *testing.T) {
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

func TestARunningServerRefusesRequestsWithoutTheToken(t *testing.T) {
	url, _, stop := start(t, "-addr", "127.0.0.1:0", folderWithFile(t))
	defer func() { _ = stop() }()
	base, token := split(t, url)

	if status, _, _ := request(t, http.MethodGet, base+"api/files", "", nil); status != http.StatusForbidden {
		t.Errorf("no token: status = %d, want 403", status)
	}
	if status, _, _ := request(t, http.MethodGet, base+"api/files", token+"x", nil); status != http.StatusForbidden {
		t.Errorf("wrong token: status = %d, want 403", status)
	}
	held, err := http.NewRequest(http.MethodGet, base+"api/files", nil)
	if err != nil {
		t.Fatal(err)
	}
	held.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(held)
	if err != nil {
		t.Fatal(err)
	}
	lost, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized || !strings.Contains(string(lost), "session lost") {
		t.Errorf("right token without a session: status = %d, body %q, want session lost", resp.StatusCode, lost)
	}
	if status, _, _ := request(t, http.MethodGet, base+"api/files", token, nil); status != http.StatusOK {
		t.Errorf("right token: status = %d, want 200", status)
	}
}

func TestARunningServerRefusesAForeignHostAndOrigin(t *testing.T) {
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

func TestARunningServerSendsSecurityHeaders(t *testing.T) {
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

func TestRunStopsEvenWhenAConnectionStaysOpen(t *testing.T) {
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
