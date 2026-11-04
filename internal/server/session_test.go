package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/Mshardul/DrawIt/internal/prefs"
)

func newTimedServer(t *testing.T, now func() time.Time) http.Handler {
	t.Helper()
	dir := t.TempDir()
	root := openRoot(t, dir)
	t.Cleanup(func() { _ = root.Close() })
	cfg := testConfig
	cfg.Now = now
	assets := fstest.MapFS{"index.html": {Data: []byte("<title>DrawIt</title>")}}
	return New(root, dir, "", assets, prefs.Open(t.TempDir()), cfg)
}

func postSession(h http.Handler, header map[string]string, body string) *httptest.ResponseRecorder {
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/session", reader)
	req.Host = testHost
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func sessionID(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("claim status = %d, body %s", rec.Code, rec.Body.String())
	}
	var got struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.ID == "" {
		t.Fatal("claim returned no id")
	}
	return got.ID
}

func authed(h http.Handler, id, method, target string) *httptest.ResponseRecorder {
	header := bearer(testToken)
	if id != "" {
		header[SessionHeader] = id
	}
	return send(h, method, target, testHost, header)
}

func TestATabClaimsTheSession(t *testing.T) {
	h := newTimedServer(t, time.Now)
	id := sessionID(t, postSession(h, bearer(testToken), ""))
	if rec := authed(h, id, http.MethodGet, "/api/preferences"); rec.Code != http.StatusOK {
		t.Fatalf("holder status = %d, want 200", rec.Code)
	}
}

func TestASecondTabIsToldDrawItIsOpenElsewhere(t *testing.T) {
	h := newTimedServer(t, time.Now)
	id := sessionID(t, postSession(h, bearer(testToken), ""))

	rec := postSession(h, bearer(testToken), "")
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "DrawIt is open elsewhere") {
		t.Fatalf("second claim = %d %q", rec.Code, rec.Body.String())
	}
	if rec := authed(h, id, http.MethodGet, "/api/preferences"); rec.Code != http.StatusOK {
		t.Fatalf("first tab status = %d, want 200", rec.Code)
	}
}

func TestUseHereTakesTheSessionOver(t *testing.T) {
	h := newTimedServer(t, time.Now)
	first := sessionID(t, postSession(h, bearer(testToken), ""))
	second := sessionID(t, postSession(h, bearer(testToken), `{"takeover":true}`))
	if second == first {
		t.Fatal("takeover kept the same id")
	}

	lost := authed(h, first, http.MethodGet, "/api/preferences")
	if lost.Code != http.StatusUnauthorized || !strings.Contains(lost.Body.String(), "session lost") {
		t.Fatalf("old tab = %d %q, want session lost", lost.Code, lost.Body.String())
	}
	if rec := authed(h, second, http.MethodGet, "/api/preferences"); rec.Code != http.StatusOK {
		t.Fatalf("new tab status = %d, want 200", rec.Code)
	}
}

func TestARequestWithoutTheSessionIsLost(t *testing.T) {
	h := newTimedServer(t, time.Now)
	_ = sessionID(t, postSession(h, bearer(testToken), ""))
	rec := authed(h, "", http.MethodGet, "/api/preferences")
	if rec.Code != http.StatusUnauthorized || !strings.Contains(rec.Body.String(), "session lost") {
		t.Fatalf("status = %d %q, want session lost", rec.Code, rec.Body.String())
	}
}

func TestTheHoldingTabClaimsAgainWithTheSameId(t *testing.T) {
	h := newTimedServer(t, time.Now)
	id := sessionID(t, postSession(h, bearer(testToken), ""))
	header := bearer(testToken)
	header[SessionHeader] = id
	if again := sessionID(t, postSession(h, header, "")); again != id {
		t.Fatalf("reclaim = %s, want %s", again, id)
	}
}

func TestAQuietTabLosesTheSessionAfterFiveSeconds(t *testing.T) {
	at := time.Date(2026, 11, 5, 0, 0, 0, 0, time.UTC)
	h := newTimedServer(t, func() time.Time { return at })
	id := sessionID(t, postSession(h, bearer(testToken), ""))

	at = at.Add(5*time.Second - time.Nanosecond)
	if rec := authed(h, id, http.MethodGet, "/api/preferences"); rec.Code != http.StatusOK {
		t.Fatalf("just inside five seconds: status = %d, want 200", rec.Code)
	}

	at = at.Add(5 * time.Second)
	lost := authed(h, id, http.MethodGet, "/api/preferences")
	if lost.Code != http.StatusUnauthorized || !strings.Contains(lost.Body.String(), "session lost") {
		t.Fatalf("five seconds after the last contact = %d %q, want session lost", lost.Code, lost.Body.String())
	}

	next := sessionID(t, postSession(h, bearer(testToken), ""))
	if next == id {
		t.Fatal("a quiet tab kept its id")
	}
}

func TestLoadingTheAppDoesNotKeepTheSession(t *testing.T) {
	at := time.Date(2026, 11, 5, 0, 0, 0, 0, time.UTC)
	h := newTimedServer(t, func() time.Time { return at })
	id := sessionID(t, postSession(h, bearer(testToken), ""))

	at = at.Add(4 * time.Second)
	if rec := send(h, http.MethodGet, "/", testHost, nil); rec.Code != http.StatusOK {
		t.Fatalf("GET / status = %d, want 200", rec.Code)
	}
	at = at.Add(time.Second)
	lost := authed(h, id, http.MethodGet, "/api/preferences")
	if lost.Code != http.StatusUnauthorized || !strings.Contains(lost.Body.String(), "session lost") {
		t.Fatalf("after loading the app = %d %q, want session lost", lost.Code, lost.Body.String())
	}
}

func TestAClaimBodyMustBeEmptyOrAnObject(t *testing.T) {
	h := newTimedServer(t, time.Now)
	rec := postSession(h, bearer(testToken), "nope")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestAClaimWithoutTheTokenIsForbidden(t *testing.T) {
	h := newTimedServer(t, time.Now)
	if rec := postSession(h, nil, ""); rec.Code != http.StatusForbidden {
		t.Fatalf("no token: status = %d, want 403", rec.Code)
	}
	id := sessionID(t, postSession(h, bearer(testToken), ""))
	if rec := authed(h, id, http.MethodGet, "/api/preferences"); rec.Code != http.StatusOK {
		t.Fatalf("holder status = %d, want 200", rec.Code)
	}
}
